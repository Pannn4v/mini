import { ImapFlow } from "imapflow";
import { Inbox } from "./db";

export interface ScannedReply {
  message_id?: string;
  sender_email: string;
  sender_name?: string;
  subject: string;
  body_text: string;
  date: string;
}

export interface SyncResult {
  inbox_email: string;
  replies_found: ScannedReply[];
  error?: string;
}

/**
 * Robust Quoted-Printable decoder handling multi-byte UTF-8 sequences.
 */
export function decodeQuotedPrintable(raw: string): string {
  // Normalize soft line breaks
  const normalized = raw.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === "=" && /[0-9A-Fa-f]{2}/.test(normalized.substring(i + 1, i + 3))) {
      bytes.push(parseInt(normalized.substring(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(normalized.charCodeAt(i));
    }
  }
  
  return Buffer.from(bytes).toString("utf-8");
}

/**
 * Extracts the plain text body from a raw MIME message.
 */
export function parseEmailBody(mime: string): string {
  if (!mime) return "";

  // 1. Check if multipart
  const boundaryMatch = mime.match(/boundary="?([^"\r\n;]+)"?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = mime.split(new RegExp(`--${boundary.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")}`));
    
    for (const part of parts) {
      if (/Content-Type:\s*text\/plain/i.test(part)) {
        const headerEndIdx = part.search(/\r?\n\r?\n/);
        if (headerEndIdx !== -1) {
          const header = part.substring(0, headerEndIdx);
          let body = part.substring(headerEndIdx).replace(/^\r?\n\r?\n/, "").trim();
          
          if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(header)) {
            body = decodeQuotedPrintable(body);
          } else if (/Content-Transfer-Encoding:\s*base64/i.test(header)) {
            try {
              body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf-8");
            } catch {}
          }
          return body.trim();
        }
      }
    }
  }

  // 2. Single-part fallback
  const headerEnd = mime.search(/\r?\n\r?\n/);
  if (headerEnd !== -1) {
    const header = mime.substring(0, headerEnd);
    let body = mime.substring(headerEnd).replace(/^\r?\n\r?\n/, "").trim();
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(header)) {
      body = decodeQuotedPrintable(body);
    } else if (/Content-Transfer-Encoding:\s*base64/i.test(header)) {
      try {
        body = Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf-8");
      } catch {}
    }
    return body.trim();
  }

  return mime.trim();
}

/**
 * Connects to a single inbox via IMAP (TLS 993) with defensive timeout,
 * reads recent inbound messages from INBOX, and returns matched prospect replies.
 */
export async function scanInboxForReplies(
  inbox: Inbox,
  maxMessagesToCheck = 30,
  targetLeadEmails?: Set<string>
): Promise<SyncResult> {
  const result: SyncResult = {
    inbox_email: inbox.email,
    replies_found: [],
  };

  if (!inbox.email || !inbox.app_password) {
    result.error = "Missing credentials";
    return result;
  }

  // Sanitize app password (strip internal spaces if any)
  const cleanPass = inbox.app_password.replace(/\s+/g, "");

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: {
      user: inbox.email,
      pass: cleanPass,
    },
    logger: false,
    clientInfo: {
      name: "MiniInstantlyUnibox",
      version: "1.2.0",
    },
  });

  // 12-second hard safety timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("IMAP connection timed out (12s)")), 12000);
  });

  try {
    await Promise.race([client.connect(), timeoutPromise]);

    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      const status = await client.status("INBOX", { messages: true });
      if (!status || !status.messages) {
        return result;
      }
      const totalMessages = status.messages;

      // Check the latest N messages (from total - N to total)
      const startSeq = Math.max(1, totalMessages - maxMessagesToCheck + 1);
      const sequenceRange = `${startSeq}:${totalMessages}`;

      for await (const message of client.fetch(sequenceRange, { envelope: true, source: true })) {
        if (message.envelope && message.envelope.from && message.envelope.from.length > 0) {
          const fromAddress = message.envelope.from[0].address;
          if (fromAddress) {
            const cleanFrom = fromAddress.toLowerCase().trim();
            // Don't flag own address, system bounces, or automated no-reply mailers
            const isSystemOrBot =
              cleanFrom === inbox.email.toLowerCase() ||
              cleanFrom.includes("mailer-daemon") ||
              cleanFrom.includes("googlemail.com") ||
              cleanFrom.includes("noreply") ||
              cleanFrom.includes("no-reply") ||
              cleanFrom.includes("donotreply") ||
              cleanFrom.includes("notifications@") ||
              cleanFrom.includes("security@");

            if (isSystemOrBot) {
              continue;
            }

            const rawSubject = message.envelope.subject || "";
            const isDirectReply = rawSubject.toLowerCase().trim().startsWith("re:");

            // Lead Matching Guard:
            // Keep message if:
            // 1. cleanFrom is in targetLeadEmails
            // 2. OR subject starts with "re:" (direct prospect reply thread)
            // 3. OR targetLeadEmails is undefined/empty
            if (targetLeadEmails && targetLeadEmails.size > 0) {
              if (!targetLeadEmails.has(cleanFrom) && !isDirectReply) {
                continue;
              }
            }

            const rawSource = message.source ? message.source.toString("utf-8") : "";
            const bodyText = parseEmailBody(rawSource);
            const senderName = message.envelope.from[0].name || "";
            const subject = message.envelope.subject || "(No Subject)";
            const dateStr = message.envelope.date
              ? new Date(message.envelope.date).toISOString()
              : new Date().toISOString();

            result.replies_found.push({
              message_id: message.envelope.messageId || undefined,
              sender_email: cleanFrom,
              sender_name: senderName,
              subject,
              body_text: bodyText,
              date: dateStr,
            });
          }
        }
      }
    } finally {
      lock.release();
    }
  } catch (err: any) {
    result.error = err.message || "IMAP Error";
    console.warn(`[IMAP Sync Warning] Inbox ${inbox.email}:`, err.message);
  } finally {
    try {
      await client.logout();
    } catch {}
  }

  return result;
}

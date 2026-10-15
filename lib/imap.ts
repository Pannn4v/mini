import { ImapFlow } from "imapflow";
import { Inbox } from "./db";

export interface SyncResult {
  inbox_email: string;
  new_replies_found: string[];
  error?: string;
}

/**
 * Connects to a single inbox via IMAP (TLS 993) with defensive timeout,
 * reads recent inbound senders from INBOX, and returns detected email addresses.
 */
export async function scanInboxForReplies(inbox: Inbox, maxMessagesToCheck = 20): Promise<SyncResult> {
  const result: SyncResult = {
    inbox_email: inbox.email,
    new_replies_found: [],
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
      name: "MiniInstantlySync",
      version: "1.0.0",
    },
  });

  // 10-second hard safety timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("IMAP connection timed out (10s)")), 10000);
  });

  try {
    await Promise.race([client.connect(), timeoutPromise]);

    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      // Query recent messages
      const status = await client.status("INBOX", { messages: true });
      if (!status || !status.messages) {
        return result;
      }
      const totalMessages = status.messages;

      // Check the latest N messages (from total - N to total)
      const startSeq = Math.max(1, totalMessages - maxMessagesToCheck + 1);
      const sequenceRange = `${startSeq}:${totalMessages}`;

      const senders = new Set<string>();

      for await (const message of client.fetch(sequenceRange, { envelope: true })) {
        if (message.envelope && message.envelope.from && message.envelope.from.length > 0) {
          const fromAddress = message.envelope.from[0].address;
          if (fromAddress) {
            const cleanFrom = fromAddress.toLowerCase().trim();
            // Don't flag own address or system alerts
            if (cleanFrom !== inbox.email.toLowerCase() && !cleanFrom.includes("mailer-daemon")) {
              senders.add(cleanFrom);
            }
          }
        }
      }

      result.new_replies_found = Array.from(senders);
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

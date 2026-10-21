import { NextResponse } from "next/server";
import { getInboxes, getLeads, updateLead, saveReply, getReplies } from "@/lib/db";
import { scanInboxForReplies } from "@/lib/imap";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleSync(req);
}

export async function POST(req: Request) {
  return handleSync(req);
}

async function handleSync(req: Request) {
  const startTime = Date.now();

  try {
    // 1. Auth check (CRON_SECRET, query param secret, or same-origin dashboard UI)
    const url = new URL(req.url);
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    const querySecret = url.searchParams.get("secret");
    
    const secFetchSite = req.headers.get("sec-fetch-site");
    const referer = req.headers.get("referer") || "";
    const host = req.headers.get("host") || "";
    const isSameOrigin = secFetchSite === "same-origin" || (!!host && referer.includes(host));

    const isAuthorized = 
      !cronSecret || 
      authHeader === `Bearer ${cronSecret}` || 
      querySecret === cronSecret || 
      isSameOrigin;

    if (!isAuthorized && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch all active inboxes
    const inboxes = await getInboxes();
    const activeInboxes = inboxes.filter((i) => i.status === "ACTIVE");

    if (activeInboxes.length === 0) {
      return NextResponse.json({
        status: "NO_ACTIVE_INBOXES",
        message: "No active inboxes configured for reply synchronization.",
      });
    }

    // 3. Fetch all leads to cross-reference
    const allLeads = await getLeads();
    const leadMapByEmail = new Map<string, typeof allLeads[0]>();
    const targetLeadEmails = new Set<string>();

    allLeads.forEach((l) => {
      const clean = l.recipient_email.toLowerCase().trim();
      leadMapByEmail.set(clean, l);
      targetLeadEmails.add(clean);
    });

    const results = [];
    const autoRepliedLeads: Array<{ email: string; lead_id: string; previous_status: string }> = [];

    // 4. Scan each inbox sequentially (to avoid concurrent load)
    for (const inbox of activeInboxes) {
      const scanResult = await scanInboxForReplies(inbox, 30, targetLeadEmails);
      results.push({
        inbox: inbox.email,
        replies_found_count: scanResult.replies_found.length,
        error: scanResult.error,
      });

      for (const rep of scanResult.replies_found) {
        const matchedLead = leadMapByEmail.get(rep.sender_email);
        if (matchedLead) {
          await saveReply({
            lead_id: matchedLead.id,
            campaign_id: matchedLead.campaign_id,
            inbox_email: inbox.email,
            sender_email: rep.sender_email,
            sender_name: rep.sender_name || matchedLead.recipient_name,
            recipient_name: matchedLead.recipient_name,
            company_name: matchedLead.company_name,
            city: matchedLead.city,
            subject: rep.subject,
            body_text: rep.body_text,
            received_at: rep.date,
            outbound_subject: matchedLead.subject_template,
            outbound_body: matchedLead.body_template,
          });

          if (matchedLead.status !== "REPLIED") {
            await updateLead(matchedLead.id, {
              status: "REPLIED",
            });
            autoRepliedLeads.push({
              email: rep.sender_email,
              lead_id: matchedLead.id,
              previous_status: matchedLead.status,
            });
            matchedLead.status = "REPLIED";
            console.log(`[IMAP Auto-Sync] Matched reply from ${rep.sender_email}! Auto-marked lead ${matchedLead.id} as REPLIED.`);
          }
        }
      }
    }

    return NextResponse.json({
      status: "SYNC_SUCCESS",
      checked_inboxes: activeInboxes.length,
      auto_replied_count: autoRepliedLeads.length,
      auto_replied_leads: autoRepliedLeads,
      details: results,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[IMAP Sync Fatal Error]:", err);
    return NextResponse.json({ status: "FATAL_ERROR", error: err.message }, { status: 500 });
  }
}

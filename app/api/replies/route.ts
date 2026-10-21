import { NextResponse } from "next/server";
import { getInboxes, getLeads, updateLead, getReplies, saveReply, deleteReply } from "@/lib/db";
import { scanInboxForReplies } from "@/lib/imap";

export const dynamic = "force-dynamic";

/**
 * GET /api/replies?campaign_id=...
 * Returns all captured prospect replies, optionally filtered by campaign.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const campaignId = url.searchParams.get("campaign_id") || undefined;
    const replies = await getReplies(campaignId);
    return NextResponse.json({ replies });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/replies
 * Triggers on-demand reply sync across ALL active inboxes with strict lead matching.
 */
export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    // 1. Fetch all active inboxes
    const inboxes = await getInboxes();
    const activeInboxes = inboxes.filter((i) => i.status === "ACTIVE");

    if (activeInboxes.length === 0) {
      return NextResponse.json({
        status: "NO_ACTIVE_INBOXES",
        message: "No active inboxes configured for reply synchronization.",
        replies: await getReplies(),
      });
    }

    // 2. Fetch all known leads across all campaigns to cross-reference
    const allLeads = await getLeads();
    const leadMapByEmail = new Map<string, typeof allLeads[0]>();
    const targetLeadEmails = new Set<string>();

    allLeads.forEach((l) => {
      const clean = l.recipient_email.toLowerCase().trim();
      leadMapByEmail.set(clean, l);
      targetLeadEmails.add(clean);
    });

    const syncReports: any[] = [];
    let newRepliesSaved = 0;

    // 3. Scan each active inbox sequentially to preserve socket safety
    for (const inbox of activeInboxes) {
      const scanResult = await scanInboxForReplies(inbox, 35, targetLeadEmails);
      syncReports.push({
        inbox: inbox.email,
        replies_found_count: scanResult.replies_found.length,
        error: scanResult.error,
      });

      for (const rep of scanResult.replies_found) {
        const matchedLead = leadMapByEmail.get(rep.sender_email);
        if (matchedLead) {
          // Save reply record
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

          // Mark lead as REPLIED if not already
          if (matchedLead.status !== "REPLIED") {
            await updateLead(matchedLead.id, {
              status: "REPLIED",
              last_error: `[REPLIED] ${rep.date}`,
            });
            matchedLead.status = "REPLIED";
          }
          newRepliesSaved++;
        }
      }
    }

    const allCurrentReplies = await getReplies();

    return NextResponse.json({
      status: "SYNC_SUCCESS",
      checked_inboxes: activeInboxes.length,
      new_replies_count: newRepliesSaved,
      total_replies: allCurrentReplies.length,
      reports: syncReports,
      replies: allCurrentReplies,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[Unibox Manual Sync Fatal Error]:", err);
    return NextResponse.json({ status: "FATAL_ERROR", error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/replies?id=...
 */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const success = await deleteReply(id);
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

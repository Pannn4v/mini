import { NextResponse } from "next/server";
import { getInboxes, getLeads, updateLead, saveReply, getReplies, getOutboundLogs, Lead } from "@/lib/db";
import { scanInboxForReplies } from "@/lib/imap";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

function resolveMatchedLead(
  rep: { sender_email: string; sender_name?: string; subject: string; body_text: string },
  allLeads: Lead[],
  historicalLeads: any[],
  outboundLogs: any[]
): {
  matchedLead?: Lead;
  company_name: string;
  recipient_name: string;
  city: string;
  campaign_id: string;
  lead_id: string;
  subject_template?: string;
  body_template?: string;
} {
  const cleanFrom = rep.sender_email.toLowerCase().trim();
  const cleanSubj = (rep.subject || "").toLowerCase().replace(/^re:\s*/i, "").trim();

  // Tier 1: Exact sender email in active leads
  let match = allLeads.find((l) => l.recipient_email.toLowerCase().trim() === cleanFrom);
  if (match) {
    return {
      matchedLead: match,
      company_name: match.company_name,
      recipient_name: rep.sender_name || match.recipient_name,
      city: match.city,
      campaign_id: match.campaign_id,
      lead_id: match.id,
      subject_template: match.subject_template,
      body_template: match.body_template,
    };
  }

  // Tier 2: Check historical/backup leads (e.g. purged or archived leads like George Weiss / Alberts Meats)
  match = historicalLeads.find((l) => (l.recipient_email || "").toLowerCase().trim() === cleanFrom);
  if (match) {
    return {
      matchedLead: match,
      company_name: match.company_name,
      recipient_name: rep.sender_name || match.recipient_name,
      city: match.city,
      campaign_id: match.campaign_id,
      lead_id: match.id,
      subject_template: match.subject_template,
      body_template: match.body_template,
    };
  }

  // Tier 3: Check outbound logs
  const logMatch = outboundLogs.find((lg) => (lg.recipient_email || "").toLowerCase().trim() === cleanFrom);
  if (logMatch) {
    const parentLead = allLeads.find((l) => l.id === logMatch.lead_id) || historicalLeads.find((l) => l.id === logMatch.lead_id);
    if (parentLead) {
      return {
        matchedLead: parentLead,
        company_name: parentLead.company_name,
        recipient_name: rep.sender_name || parentLead.recipient_name,
        city: parentLead.city,
        campaign_id: parentLead.campaign_id,
        lead_id: parentLead.id,
        subject_template: parentLead.subject_template,
        body_template: parentLead.body_template,
      };
    }
  }

  // Tier 4: Match by clean subject line (e.g., "a food company in Pennsylvania")
  if (cleanSubj.length > 5) {
    match = allLeads.find((l) => (l.subject_template || "").toLowerCase().includes(cleanSubj)) ||
            historicalLeads.find((l) => (l.subject_template || "").toLowerCase().includes(cleanSubj));
    if (match) {
      return {
        matchedLead: match,
        company_name: match.company_name,
        recipient_name: rep.sender_name || match.recipient_name,
        city: match.city,
        campaign_id: match.campaign_id,
        lead_id: match.id,
        subject_template: match.subject_template,
        body_template: match.body_template,
      };
    }
  }

  // Tier 5: Domain match (e.g., sender is @albertsmeats.com and lead is @albertsmeats.com)
  const senderDomain = cleanFrom.split("@")[1];
  if (senderDomain && !["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "aol.com"].includes(senderDomain)) {
    match = allLeads.find((l) => l.recipient_email.toLowerCase().includes(`@${senderDomain}`)) ||
            historicalLeads.find((l) => (l.recipient_email || "").toLowerCase().includes(`@${senderDomain}`));
    if (match) {
      return {
        matchedLead: match,
        company_name: match.company_name,
        recipient_name: rep.sender_name || match.recipient_name,
        city: match.city,
        campaign_id: match.campaign_id,
        lead_id: match.id,
        subject_template: match.subject_template,
        body_template: match.body_template,
      };
    }
  }

  // Tier 6: Unmatched / Direct Inbound fallback (NEVER DROP A PROSPECT MESSAGE)
  const inferredCamp = allLeads.length > 0 ? allLeads[0].campaign_id : "unassigned";
  return {
    matchedLead: undefined,
    company_name: senderDomain ? senderDomain.replace(/\.[^.]+$/, "").toUpperCase() : "Direct Inbound",
    recipient_name: rep.sender_name || cleanFrom,
    city: "Direct",
    campaign_id: inferredCamp,
    lead_id: `inbound_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
  };
}

export async function GET(req: Request) {
  return handleSync(req);
}

export async function POST(req: Request) {
  return handleSync(req);
}

async function handleSync(req: Request) {
  const startTime = Date.now();

  try {
    // 1. Auth check
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

    // 3. Fetch active leads, outbound logs, and historical backup leads
    const allLeads = await getLeads();
    const outboundLogs = await getOutboundLogs();
    
    let historicalLeads: any[] = [];
    try {
      const bakPath = path.join(process.cwd(), "data", "store.json.bak");
      if (fs.existsSync(bakPath)) {
        const bakData = JSON.parse(fs.readFileSync(bakPath, "utf8"));
        if (Array.isArray(bakData.leads)) historicalLeads = bakData.leads;
      }
    } catch {}

    const targetLeadEmails = new Set<string>();
    allLeads.forEach((l) => targetLeadEmails.add(l.recipient_email.toLowerCase().trim()));
    historicalLeads.forEach((l) => targetLeadEmails.add((l.recipient_email || "").toLowerCase().trim()));
    outboundLogs.forEach((lg) => targetLeadEmails.add((lg.recipient_email || "").toLowerCase().trim()));

    const results = [];
    const autoRepliedLeads: Array<{ email: string; lead_id: string; company: string }> = [];

    // 4. Scan each active inbox sequentially
    for (const inbox of activeInboxes) {
      const scanResult = await scanInboxForReplies(inbox, 40, targetLeadEmails);
      results.push({
        inbox: inbox.email,
        replies_found_count: scanResult.replies_found.length,
        error: scanResult.error,
      });

      for (const rep of scanResult.replies_found) {
        const resolution = resolveMatchedLead(rep, allLeads, historicalLeads, outboundLogs);

        await saveReply({
          lead_id: resolution.lead_id,
          campaign_id: resolution.campaign_id,
          inbox_email: inbox.email,
          sender_email: rep.sender_email,
          sender_name: resolution.recipient_name,
          recipient_name: resolution.recipient_name,
          company_name: resolution.company_name,
          city: resolution.city,
          subject: rep.subject,
          body_text: rep.body_text,
          received_at: rep.date,
          outbound_subject: resolution.subject_template,
          outbound_body: resolution.body_template,
        });

        if (resolution.matchedLead && resolution.matchedLead.status !== "REPLIED") {
          await updateLead(resolution.matchedLead.id, {
            status: "REPLIED",
          });
          resolution.matchedLead.status = "REPLIED";
          autoRepliedLeads.push({
            email: rep.sender_email,
            lead_id: resolution.matchedLead.id,
            company: resolution.company_name,
          });
          console.log(`[IMAP Auto-Sync] Matched reply from ${rep.sender_email}! Auto-marked lead ${resolution.matchedLead.id} as REPLIED.`);
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

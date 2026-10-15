import { NextResponse } from "next/server";
import { getCampaign, getNextDueLead, getEligibleInbox, updateLead, updateInbox, logOutbound, getLeads } from "@/lib/db";
import { parseSpintax } from "@/lib/spintax";
import { createGmailTransporter } from "@/lib/mailer";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return handleDispatch(req);
}

export async function POST(req: Request) {
  return handleDispatch(req);
}

async function handleDispatch(req: Request) {
  const startTime = Date.now();

  try {
    // 1. Cron Secret Auth (Allow Bearer token, query param secret, or same-origin dashboard UI)
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

    if (!isAuthorized) {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    // 2. Identify Target Campaign / Next Due Lead
    const campaignId = url.searchParams.get("campaign_id") || undefined;
    const forceSend = url.searchParams.get("force") === "true";

    // Query next pending lead (from specified campaign or any ACTIVE campaign)
    const lead = await getNextDueLead(campaignId);
    if (!lead) {
      return NextResponse.json({
        status: "NO_PENDING_LEADS",
        message: "No leads are currently due for dispatch.",
      });
    }

    // Resolve lead's campaign for schedule & timezone checks
    const campaign = await getCampaign(lead.campaign_id);
    if (!campaign || campaign.status !== "ACTIVE") {
      return NextResponse.json({ 
        status: "CAMPAIGN_INACTIVE", 
        message: `Campaign ${campaign?.name || lead.campaign_id} is currently paused.` 
      });
    }

    // 3. Timezone Business Hours Gate
    const now = new Date();
    const estTimeStr = now.toLocaleTimeString("en-US", { timeZone: campaign.timezone, hour12: false, hour: "2-digit", minute: "2-digit" });
    const [currHour, currMin] = estTimeStr.split(":").map(Number);
    const currTotalMins = currHour * 60 + currMin;

    const [startH, startM] = (campaign.window_start || "07:30").split(":").map(Number);
    const startTotalMins = startH * 60 + startM;

    const [endH, endM] = (campaign.window_end || "18:00").split(":").map(Number);
    const endTotalMins = endH * 60 + endM;

    if (!forceSend && (currTotalMins < startTotalMins || currTotalMins >= endTotalMins)) {
      return NextResponse.json({
        status: "IDLE_OUTSIDE_WINDOW",
        campaign_name: campaign.name,
        current_time_est: estTimeStr,
        allowed_window: `${campaign.window_start} - ${campaign.window_end} ${campaign.timezone}`,
        message: "Current time is outside target business hours. Engine is in power-save sleep mode.",
      });
    }

    // 5. Select eligible round-robin inbox
    const inbox = await getEligibleInbox();
    if (!inbox) {
      return NextResponse.json({
        status: "ALL_INBOXES_EXHAUSTED",
        message: "All inboxes have reached their daily limit or are in cooldown.",
      });
    }

    // 6. Compile Dynamic Spintax & Personalization Tokens
    const vars: Record<string, string> = {
      first_name: (lead.recipient_name || "").split(" ")[0] || "there",
      name: lead.recipient_name || "there",
      company_name: lead.company_name || "your company",
      company: lead.company_name || "your company",
      city: lead.city || "your area",
    };

    const finalSubject = parseSpintax(lead.subject_template, vars);
    const finalBody = parseSpintax(lead.body_template, vars);

    // 7. Dispatch Email via Google SMTP
    const transporter = createGmailTransporter(inbox);
    
    let sendResult;
    try {
      sendResult = await transporter.sendMail({
        from: `"${inbox.display_name}" <${inbox.email}>`,
        to: lead.recipient_email,
        subject: finalSubject,
        text: finalBody,
      });
    } catch (smtpErr: any) {
      console.error(`[SMTP Error] ${inbox.email} -> ${lead.recipient_email}:`, smtpErr);

      // Check rate limit or auth failure
      const isRateLimit = smtpErr?.responseCode === 421 || smtpErr?.responseCode === 429;
      if (isRateLimit) {
        await updateInbox(inbox.id, { status: "COOLDOWN" });
      }

      await updateLead(lead.id, {
        attempts: (lead.attempts || 0) + 1,
        last_error: smtpErr.message || "SMTP Dispatch Error",
      });

      await logOutbound({
        lead_id: lead.id,
        inbox_id: inbox.id,
        recipient_email: lead.recipient_email,
        subject: finalSubject,
        status: "FAILED",
        smtp_response: smtpErr.message,
      });

      return NextResponse.json({
        status: "SMTP_ERROR",
        error: smtpErr.message,
        duration_ms: Date.now() - startTime,
      }, { status: 500 });
    }

    // 8. Atomic Status Updates & Multi-Step Sequence Transition
    const hasFollowup = !!lead.followup_body || (lead.step === 1 && !!lead.followup_subject);
    const isStep1 = lead.status === "PENDING" && (lead.step === 1 || !lead.step);

    if (isStep1 && hasFollowup) {
      // Transition to Step 2 (scheduled 3 days delay, marked SENT for Step 1)
      const delayDays = lead.followup_delay_days || 3;
      const nextScheduled = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();
      const nextSubject = lead.followup_subject || (lead.subject_template.startsWith("Re:") ? lead.subject_template : `Re: ${lead.subject_template}`);
      const nextBody = lead.followup_body || lead.body_template;

      await updateLead(lead.id, {
        status: "SENT",
        scheduled_at: nextScheduled,
        sent_at: new Date().toISOString(),
        assigned_inbox_id: inbox.id,
      });
    } else {
      // Completed or single-touch
      await updateLead(lead.id, {
        status: "SENT",
        sent_at: new Date().toISOString(),
        assigned_inbox_id: inbox.id,
      });
    }

    await updateInbox(inbox.id, {
      sent_today: inbox.sent_today + 1,
      last_sent_at: new Date().toISOString(),
    });

    await logOutbound({
      lead_id: lead.id,
      inbox_id: inbox.id,
      recipient_email: lead.recipient_email,
      subject: finalSubject,
      status: "SUCCESS",
      smtp_response: sendResult.response,
    });

    // 9. Schedule next lead with randomized jitter interval (e.g. 4 to 8 minutes)
    const allLeads = await getLeads();
    const remainingDue = allLeads.filter(
      (l) => (l.status === "PENDING" || (l.status === "WAITING_FOLLOWUP" && new Date(l.scheduled_at) <= now)) && l.id !== lead.id
    );
    if (remainingDue.length > 0) {
      const minMins = campaign.min_interval_mins || 4;
      const maxMins = campaign.max_interval_mins || 8;
      const jitterMins = Math.floor(Math.random() * (maxMins - minMins + 1)) + minMins;
      const nextTime = new Date(Date.now() + jitterMins * 60 * 1000).toISOString();

      // Set the immediate next lead
      await updateLead(remainingDue[0].id, {
        scheduled_at: nextTime,
      });
    }

    return NextResponse.json({
      status: "DISPATCHED_SUCCESS",
      lead: lead.recipient_email,
      inbox: inbox.email,
      subject: finalSubject,
      duration_ms: Date.now() - startTime,
    });
  } catch (err: any) {
    console.error("[Dispatcher Fatal Error]:", err);
    return NextResponse.json({ status: "FATAL_ERROR", error: err.message }, { status: 500 });
  }
}

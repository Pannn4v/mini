import { NextResponse } from "next/server";
import { getCampaigns, getInboxes, getNextDueLead, getEligibleInbox, updateLead, updateInbox, logOutbound } from "@/lib/db";
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

    // 2. Pre-DB Weekend Hard-Shutdown Gate (Zero Supabase reads on Sat/Sun)
    const campaignId = url.searchParams.get("campaign_id") || undefined;
    const forceSend = url.searchParams.get("force") === "true";
    const now = new Date();
    const nowMs = now.getTime();

    const estDayOfWeek = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
    }).format(now);
    const estTimeStr = now.toLocaleTimeString("en-US", {
      timeZone: "America/New_York",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });

    if (!forceSend && (estDayOfWeek === "Sat" || estDayOfWeek === "Sun")) {
      return NextResponse.json({
        status: "WEEKEND_SHUTDOWN",
        day: estDayOfWeek,
        current_time_est: estTimeStr,
        message: "Weekend Hard-Shutdown active (Sat-Sun Closed). Inboxes resting until Monday 07:30 EST.",
      });
    }

    // 3. Resolve Active Campaigns & Filter by Business Window BEFORE querying Leads
    const allCampaigns = await getCampaigns();
    const candidateCampaigns = allCampaigns.filter((c) => {
      if (campaignId && campaignId !== "all" && c.id !== campaignId) return false;
      return c.status === "ACTIVE";
    });

    if (candidateCampaigns.length === 0) {
      return NextResponse.json({
        status: "CAMPAIGN_INACTIVE",
        message: "No active campaigns found.",
      });
    }

    const openCampaigns = candidateCampaigns.filter((c) => {
      if (forceSend) return true;
      const tz = c.timezone || "America/New_York";
      const dayStr = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now);
      if (dayStr === "Sat" || dayStr === "Sun") return false;

      const tStr = now.toLocaleTimeString("en-US", {
        timeZone: tz,
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
      });
      const [cH, cM] = tStr.split(":").map(Number);
      const currMins = cH * 60 + cM;

      const [sH, sM] = (c.window_start || "07:30").split(":").map(Number);
      const [eH, eM] = (c.window_end || "18:00").split(":").map(Number);
      return currMins >= sH * 60 + sM && currMins < eH * 60 + eM;
    });

    if (openCampaigns.length === 0) {
      const refCamp = candidateCampaigns[0];
      return NextResponse.json({
        status: "IDLE_OUTSIDE_WINDOW",
        campaign_name: refCamp.name,
        current_time_est: estTimeStr,
        day: estDayOfWeek,
        allowed_window: `${refCamp.window_start} - ${refCamp.window_end} ${refCamp.timezone}`,
        message: "Current time is outside target business hours. Engine is in power-save sleep mode.",
      });
    }

    // 4. Global / Campaign Jitter Gate (4-8 Min Random Delay Locked to Last Sent Timestamp)
    const allInboxes = await getInboxes();
    const activeInboxes = allInboxes.filter((i) => i.status === "ACTIVE");

    if (activeInboxes.length === 0) {
      return NextResponse.json({
        status: "ALL_INBOXES_EXHAUSTED",
        message: "No active inboxes connected.",
      });
    }

    const latestSentMs = allInboxes.reduce((maxMs, i) => {
      const ms = i.last_sent_at ? new Date(i.last_sent_at).getTime() : 0;
      return ms > maxMs ? ms : maxMs;
    }, 0);

    const primaryCamp = openCampaigns[0];
    const minMins = primaryCamp.min_interval_mins || 4;
    const maxMins = Math.max(minMins, primaryCamp.max_interval_mins || 8);
    const jitterRange = maxMins - minMins + 1;
    // Deterministic jitter seeded from latestSentMs so every cron tick agrees on the exact target wait time
    const requiredJitterMins = minMins + (Math.floor(latestSentMs / 1000) % jitterRange);
    const requiredJitterMs = requiredJitterMins * 60 * 1000;

    if (!forceSend && latestSentMs > 0 && nowMs - latestSentMs < requiredJitterMs) {
      const remainingSec = Math.ceil((requiredJitterMs - (nowMs - latestSentMs)) / 1000);
      return NextResponse.json({
        status: "JITTER_COOLDOWN_ACTIVE",
        required_gap_mins: requiredJitterMins,
        wait_remaining_sec: remainingSec,
        message: `Human-like pacing active (${requiredJitterMins}m gap). Next send in ${remainingSec}s.`,
      });
    }

    // 5. Select eligible round-robin inbox (under daily_limit & past 120s safety cooldown)
    const inbox = await getEligibleInbox();
    if (!inbox) {
      return NextResponse.json({
        status: "ALL_INBOXES_EXHAUSTED",
        message: "All active inboxes have reached their daily limit or are in cooldown.",
      });
    }

    // 6. Query next pending lead across currently open campaigns
    let lead = null;
    for (const c of openCampaigns) {
      lead = await getNextDueLead(c.id);
      if (lead) break;
    }

    if (!lead) {
      return NextResponse.json({
        status: "NO_PENDING_LEADS",
        message: "No leads are currently due for dispatch.",
      });
    }

    // 7. Compile Dynamic Spintax & Personalization Tokens
    const isFollowup = !!(lead as any).is_followup;
    const parts = (lead.recipient_name || "").trim().split(/\s+/);
    const lastName = parts.length > 1 ? parts[parts.length - 1] : parts[0] || "Sir";
    const firstName = parts[0] || "there";
    const city = lead.city || "your area";

    let finalSubject = "";
    let finalBody = "";

    if (isFollowup) {
      const cleanSubj = (lead.subject_template || "").replace(/^Re:\s*/i, "").trim();
      finalSubject = `Re: ${cleanSubj}`;

      if (lead.campaign_id === "camp_1792481395570_qjbo") {
        // Supply (Contractors / Haulers)
        finalBody = `Mr. ${lastName},\n\nFollowing up on your fleet availability in ${city} before we finalize regional routing schedules for upcoming pad mobilizations.\n\nBest,\nPandu Utama`;
      } else if (lead.campaign_id === "camp_1792481404891_wyf9") {
        // Demand (Operators / Producers)
        finalBody = `Mr. ${lastName},\n\nFollowing up regarding standby waxy crude hauling capacity before wellsite mobilization windows lock for the month.\n\nBest,\nPandu Utama`;
      } else {
        // Generic fallback
        finalBody = `Hi ${firstName},\n\nFollowing up on my previous note regarding ${lead.company_name || "your team"} before our schedule locks for the week.\n\nBest,\nPandu Utama`;
      }
    } else {
      const vars: Record<string, string> = {
        first_name: firstName,
        name: lead.recipient_name || "there",
        company_name: lead.company_name || "your company",
        company: lead.company_name || "your company",
        city: city,
      };

      finalSubject = parseSpintax(lead.subject_template, vars);
      finalBody = parseSpintax(lead.body_template, vars);
    }

    // 8. Dispatch Email via Google SMTP
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
      const errMsg = String(smtpErr?.message || "SMTP Dispatch Error");
      const errLower = errMsg.toLowerCase();
      console.error(`[SMTP Error] ${inbox.email} -> ${lead.recipient_email}:`, errMsg);

      const isDailyLimit =
        errMsg.includes("Daily user sending limit exceeded") ||
        errMsg.includes("5.4.5") ||
        smtpErr?.responseCode === 421 ||
        smtpErr?.responseCode === 429;

      const isHardBounce =
        !isDailyLimit &&
        (errMsg.includes("5.1.1") ||
          errLower.includes("does not exist") ||
          errLower.includes("user unknown") ||
          errLower.includes("invalid recipient") ||
          errLower.includes("address rejected") ||
          errLower.includes("no such user") ||
          smtpErr?.responseCode === 550 ||
          smtpErr?.responseCode === 553 ||
          smtpErr?.responseCode === 501);

      if (isDailyLimit) {
        // Immediately mark this inbox as full for today so next tick rotates to the other inbox
        await updateInbox(inbox.id, {
          sent_today: inbox.daily_limit,
          last_sent_at: new Date().toISOString(),
        });
      } else if (isHardBounce) {
        // Instantly.ai standard: never retry a 550 Hard Bounce (protects Gmail reputation)
        await updateLead(lead.id, {
          attempts: (lead.attempts || 0) + 1,
          last_error: errMsg,
          status: "FAILED",
        });
      } else {
        // Transient network error: backoff 15 minutes so healthy leads behind it aren't blocked
        const nextAttempts = (lead.attempts || 0) + 1;
        const backoffTime = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        await updateLead(lead.id, {
          attempts: nextAttempts,
          last_error: errMsg,
          scheduled_at: backoffTime,
          ...(nextAttempts >= 3 ? { status: "FAILED" } : {}),
        });
      }

      await logOutbound({
        lead_id: lead.id,
        inbox_id: inbox.id,
        recipient_email: lead.recipient_email,
        subject: finalSubject,
        status: "FAILED",
        smtp_response: errMsg,
      });

      // Return HTTP 200 so external cron (cron-job.org) never disables the job on SMTP bounce/limit
      return NextResponse.json({
        status: isDailyLimit
          ? "INBOX_DAILY_LIMIT_ROTATED"
          : isHardBounce
          ? "LEAD_HARD_BOUNCED"
          : "SMTP_TRANSIENT_BACKOFF",
        inbox: inbox.email,
        lead: lead.recipient_email,
        error: errMsg,
        duration_ms: Date.now() - startTime,
      }, { status: 200 });
    }

    // 9. Mark Lead as SENT / FOLLOWED_UP & Update Inbox Counter
    const sentIso = new Date().toISOString();
    if (isFollowup) {
      await updateLead(lead.id, {
        status: "FOLLOWED_UP",
        sent_at: sentIso,
        assigned_inbox_id: inbox.id,
        step: 2,
      });
    } else {
      await updateLead(lead.id, {
        status: "SENT",
        sent_at: sentIso,
        assigned_inbox_id: inbox.id,
        step: 1,
      });
    }

    const todayEst = now.toLocaleDateString("en-US", { timeZone: "America/New_York" });
    const lastSentEst = inbox.last_sent_at
      ? new Date(inbox.last_sent_at).toLocaleDateString("en-US", { timeZone: "America/New_York" })
      : "";
    const isNewDay = lastSentEst !== todayEst;
    const nextSentToday = isNewDay ? 1 : inbox.sent_today + 1;

    await updateInbox(inbox.id, {
      sent_today: nextSentToday,
      last_sent_at: sentIso,
    });

    await logOutbound({
      lead_id: lead.id,
      inbox_id: inbox.id,
      recipient_email: lead.recipient_email,
      subject: finalSubject,
      status: "SUCCESS",
      smtp_response: sendResult.response,
    });

    return NextResponse.json({
      status: "DISPATCHED_SUCCESS",
      type: isFollowup ? "GHOST_BUMP_STEP_2" : "FIRST_TOUCH_STEP_1",
      step: isFollowup ? 2 : 1,
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

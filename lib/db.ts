import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

export interface Inbox {
  id: string;
  email: string;
  display_name: string;
  app_password: string;
  daily_limit: number;
  sent_today: number;
  last_sent_at: string;
  status: "ACTIVE" | "PAUSED" | "COOLDOWN" | "ERROR";
  created_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  market_category: string; // "SCHOOL_WIFI" | "AIRPORT_PAVING" | "SOLAR_EPC" | "CUSTOM"
  status: "ACTIVE" | "PAUSED";
  timezone: string; // e.g. "America/New_York"
  window_start: string; // e.g. "07:30"
  window_end: string;   // e.g. "18:00"
  min_interval_mins: number;
  max_interval_mins: number;
  subject_default?: string;
  body_default?: string;
  created_at: string;
}

export interface Lead {
  id: string;
  campaign_id: string;
  recipient_email: string;
  recipient_name: string;
  company_name: string;
  city: string;
  subject_template: string;
  body_template: string;
  status: "PENDING" | "SENT" | "FOLLOWED_UP" | "WAITING_FOLLOWUP" | "REPLIED" | "ARCHIVED" | "FAILED" | "SKIPPED";
  step?: number;
  followup_subject?: string;
  followup_body?: string;
  followup_delay_days?: number;
  scheduled_at: string;
  sent_at?: string;
  assigned_inbox_id?: string;
  attempts?: number;
  last_error?: string;
  created_at: string;
  is_followup?: boolean;
}

export interface OutboundLog {
  id: string;
  lead_id: string;
  inbox_id: string;
  recipient_email: string;
  subject: string;
  status: "SUCCESS" | "FAILED";
  smtp_response?: string;
  sent_at: string;
}

export interface ReplyRecord {
  id: string;
  lead_id: string;
  campaign_id: string;
  inbox_email: string;
  sender_email: string;
  sender_name: string;
  recipient_name: string;
  company_name: string;
  city: string;
  subject: string;
  body_text: string;
  received_at: string;
  outbound_subject?: string;
  outbound_body?: string;
  created_at: string;
}

interface DatabaseSchema {
  inboxes: Inbox[];
  campaigns: Campaign[];
  leads: Lead[];
  logs: OutboundLog[];
  replies?: ReplyRecord[];
}

// -----------------------------------------------------------------------------
// DUAL-MODE SUPABASE INITIALIZATION
// Checks for Supabase environment credentials; gracefully falls back to JSON
// -----------------------------------------------------------------------------
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = 
  process.env.SUPABASE_SERVICE_ROLE_KEY || 
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (typeof globalThis.WebSocket === "undefined") {
  try {
    globalThis.WebSocket = require("ws");
  } catch {}
}

export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// -----------------------------------------------------------------------------
// LOCAL FALLBACK DATA STORE (JSON)
// -----------------------------------------------------------------------------
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "store.json");

const DEFAULT_PRESET_CAMPAIGNS: Campaign[] = [
  {
    id: "campaign-school-fl",
    name: "School E-Rate Supply Strike (Florida)",
    market_category: "SCHOOL_WIFI",
    status: "ACTIVE",
    timezone: "America/New_York",
    window_start: "07:30",
    window_end: "18:00",
    min_interval_mins: 4,
    max_interval_mins: 8,
    subject_default: "{central fl charter rfp / cabling scope|volusia charter school tender} / crew availability",
    body_default: "{Hi|Hey|Good morning} {first_name},\n\nReaching out directly to {company_name} regarding the Category 2 low-voltage cabling scope for Burns Science & Technology Charter School in Volusia County.\n\nThe deployment calls for Cat6A plenum drops, patch panels, 24/48-port PoE switching, and indoor/outdoor Access Point mounting (~90 AP units across the campus).\n\nThis is currently in the statutory 28-day E-Rate review window before the school locks their installation vendor.\n\nAre you open to reviewing the spec sheet and BoQ before bidding locks?\n\nBest,\nPandu",
    created_at: new Date().toISOString(),
  },
  {
    id: "campaign-airport-paving",
    name: "Airport Paving Clearance (FAA AIP)",
    market_category: "AIRPORT_PAVING",
    status: "ACTIVE",
    timezone: "America/New_York",
    window_start: "07:30",
    window_end: "18:00",
    min_interval_mins: 4,
    max_interval_mins: 8,
    subject_default: "airport work in {city} / paving contractor availability",
    body_default: "{Hi|Hey|Good morning} {first_name},\n\nI have airports in {city} that want more contractors bidding on their next runway and taxiway job.\n\nThanks for reading (also, no call needed, I can easily make the introduction).\n\nBest,\nPandu",
    created_at: new Date().toISOString(),
  },
];

function isReadOnlyFs(): boolean {
  return !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}

function ensureDbFile(): DatabaseSchema {
  if (isReadOnlyFs()) {
    return { inboxes: [], campaigns: DEFAULT_PRESET_CAMPAIGNS, leads: [], logs: [] };
  }

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DB_FILE)) {
      const initialData: DatabaseSchema = {
        inboxes: [],
        campaigns: DEFAULT_PRESET_CAMPAIGNS,
        leads: [],
        logs: [],
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), "utf-8");
      return initialData;
    }

    const raw = fs.readFileSync(DB_FILE, "utf-8");
    const data: DatabaseSchema = JSON.parse(raw);
    if (!Array.isArray(data.campaigns) || data.campaigns.length === 0) {
      data.campaigns = DEFAULT_PRESET_CAMPAIGNS;
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
    } else if (data.campaigns.length === 1 && data.campaigns[0].id === "default-campaign") {
      data.campaigns = DEFAULT_PRESET_CAMPAIGNS;
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
    }
    return data;
  } catch {
    return { inboxes: [], campaigns: DEFAULT_PRESET_CAMPAIGNS, leads: [], logs: [] };
  }
}

function saveDb(data: DatabaseSchema) {
  if (isReadOnlyFs()) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.warn("saveDb skipped (read-only filesystem):", e);
  }
}

// -----------------------------------------------------------------------------
// INBOXES OPERATIONS
// -----------------------------------------------------------------------------
export async function getInboxes(): Promise<Inbox[]> {
  const todayEst = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  if (supabase) {
    try {
      const { data, error } = await supabase.from("inboxes").select("*").order("created_at", { ascending: true });
      if (!error && data) {
        const inboxes = data as Inbox[];
        for (const i of inboxes) {
          const lastSentEst = i.last_sent_at ? new Date(i.last_sent_at).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "";
          if (lastSentEst && lastSentEst !== todayEst && i.sent_today > 0) {
            i.sent_today = 0;
            supabase.from("inboxes").update({ sent_today: 0 }).eq("id", i.id).then();
          }
        }
        return inboxes;
      }
    } catch (e) {
      console.warn("Supabase getInboxes fallback:", e);
    }
  }
  const db = ensureDbFile();
  return db.inboxes;
}

export async function addInbox(inbox: Omit<Inbox, "id" | "sent_today" | "last_sent_at" | "created_at">): Promise<Inbox> {
  const newInbox: Inbox = {
    ...inbox,
    id: `inbox_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    sent_today: 0,
    last_sent_at: new Date(0).toISOString(),
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase.from("inboxes").insert(newInbox).select().single();
      if (!error && data) return data as Inbox;
    } catch (e) {
      console.warn("Supabase addInbox fallback:", e);
    }
  }

  const db = ensureDbFile();
  db.inboxes.push(newInbox);
  saveDb(db);
  return newInbox;
}

export async function updateInbox(id: string, updates: Partial<Inbox>): Promise<Inbox | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from("inboxes").update(updates).eq("id", id).select().single();
      if (!error && data) return data as Inbox;
    } catch (e) {
      console.warn("Supabase updateInbox fallback:", e);
    }
  }

  const db = ensureDbFile();
  const idx = db.inboxes.findIndex((i) => i.id === id);
  if (idx === -1) return null;
  db.inboxes[idx] = { ...db.inboxes[idx], ...updates };
  saveDb(db);
  return db.inboxes[idx];
}

export async function deleteInbox(id: string): Promise<boolean> {
  if (supabase) {
    try {
      const { error } = await supabase.from("inboxes").delete().eq("id", id);
      if (!error) return true;
    } catch (e) {
      console.warn("Supabase deleteInbox fallback:", e);
    }
  }

  const db = ensureDbFile();
  const initialLen = db.inboxes.length;
  db.inboxes = db.inboxes.filter((i) => i.id !== id);
  saveDb(db);
  return db.inboxes.length < initialLen;
}

// -----------------------------------------------------------------------------
// CAMPAIGNS OPERATIONS
// -----------------------------------------------------------------------------
export async function getCampaigns(): Promise<Campaign[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from("campaigns").select("*").order("created_at", { ascending: true });
      if (!error) return (data || []) as Campaign[];
    } catch (e) {
      console.warn("Supabase getCampaigns fallback:", e);
    }
  }
  const db = ensureDbFile();
  return db.campaigns;
}

export async function getCampaign(id?: string): Promise<Campaign | null> {
  if (supabase) {
    try {
      if (id && id !== "undefined") {
        const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).maybeSingle();
        if (!error && data) return data as Campaign;
        if (!error && !data) return null;
      } else {
        const { data, error } = await supabase.from("campaigns").select("*").limit(1);
        if (!error && data && data.length > 0) return data[0] as Campaign;
        if (!error) return null;
      }
    } catch (e) {
      console.warn("Supabase getCampaign fallback:", e);
    }
  }

  const db = ensureDbFile();
  if (id && id !== "undefined") {
    return db.campaigns.find((c) => c.id === id) || null;
  }
  return db.campaigns[0] || null;
}

export async function createCampaign(data: Omit<Campaign, "id" | "created_at">): Promise<Campaign> {
  const newCamp: Campaign = {
    ...data,
    id: `camp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    created_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { data: inserted, error } = await supabase.from("campaigns").insert(newCamp).select().single();
      if (!error && inserted) return inserted as Campaign;
    } catch (e) {
      console.warn("Supabase createCampaign fallback:", e);
    }
  }

  const db = ensureDbFile();
  db.campaigns.push(newCamp);
  saveDb(db);
  return newCamp;
}

export async function updateCampaign(id: string, updates: Partial<Campaign>): Promise<Campaign | null> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from("campaigns").update(updates).eq("id", id).select().single();
      if (!error && data) return data as Campaign;
    } catch (e) {
      console.warn("Supabase updateCampaign fallback:", e);
    }
  }

  const db = ensureDbFile();
  const idx = db.campaigns.findIndex((c) => c.id === id);
  if (idx === -1) {
    if (db.campaigns.length > 0) {
      db.campaigns[0] = { ...db.campaigns[0], ...updates };
      saveDb(db);
      return db.campaigns[0];
    }
    return null;
  }
  db.campaigns[idx] = { ...db.campaigns[idx], ...updates };
  saveDb(db);
  return db.campaigns[idx];
}

export async function deleteCampaign(id: string): Promise<boolean> {
  if (supabase) {
    try {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (!error) return true;
    } catch (e) {
      console.warn("Supabase deleteCampaign fallback:", e);
    }
  }

  const db = ensureDbFile();
  const initialLen = db.campaigns.length;
  db.campaigns = db.campaigns.filter((c) => c.id !== id);
  db.leads = db.leads.filter((l) => l.campaign_id !== id);
  saveDb(db);
  return db.campaigns.length < initialLen;
}

// -----------------------------------------------------------------------------
// LEADS OPERATIONS (Scoped by Campaign)
// -----------------------------------------------------------------------------
export async function getLeads(campaignId?: string): Promise<Lead[]> {
  if (supabase) {
    try {
      let query = supabase.from("leads").select("*").order("scheduled_at", { ascending: true });
      if (campaignId && campaignId !== "all") {
        query = query.eq("campaign_id", campaignId);
      }
      const { data, error } = await query;
      if (!error && data) {
        const list = data as Lead[];
        return list.map((l) => {
          if (l.last_error && (l.last_error.includes("[REPLIED]") || l.last_error.includes("[REPLY_DATA]:"))) {
            return { ...l, status: "REPLIED" as const };
          }
          return l;
        });
      }
    } catch (e) {
      console.warn("Supabase getLeads fallback:", e);
    }
  }

  const db = ensureDbFile();
  if (campaignId && campaignId !== "all") {
    return db.leads.filter((l) => l.campaign_id === campaignId);
  }
  return db.leads;
}

export async function addLeads(leads: Array<Omit<Lead, "id" | "created_at" | "status"> & { status?: Lead["status"] }>): Promise<Lead[]> {
  const createdLeads: Lead[] = leads.map((l, index) => ({
    ...l,
    id: `lead_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
    status: l.status || "PENDING",
    scheduled_at: l.scheduled_at || new Date().toISOString(),
    created_at: new Date().toISOString(),
  }));

  if (supabase) {
    try {
      const { data, error } = await supabase.from("leads").insert(createdLeads).select();
      if (!error && data) return data as Lead[];
    } catch (e) {
      console.warn("Supabase addLeads fallback:", e);
    }
  }

  const db = ensureDbFile();
  db.leads.push(...createdLeads);
  saveDb(db);
  return createdLeads;
}

const ALLOWED_SUPABASE_LEAD_COLS = new Set([
  "id",
  "campaign_id",
  "recipient_email",
  "recipient_name",
  "company_name",
  "city",
  "subject_template",
  "body_template",
  "status",
  "scheduled_at",
  "sent_at",
  "assigned_inbox_id",
  "attempts",
  "last_error",
  "created_at",
]);

const ALLOWED_SUPABASE_STATUSES = new Set(["PENDING", "SENT", "FAILED"]);

export async function updateLead(id: string, updates: Partial<Lead>): Promise<Lead | null> {
  if (supabase) {
    try {
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(updates)) {
        if (ALLOWED_SUPABASE_LEAD_COLS.has(key)) {
          if (key === "status") {
            if (ALLOWED_SUPABASE_STATUSES.has(value as string)) {
              sanitized.status = value;
            } else if (value === "WAITING_FOLLOWUP" || value === "REPLIED") {
              sanitized.status = "SENT";
              // Never overwrite last_error if it is not explicitly provided in updates
            }
          } else {
            sanitized[key] = value;
          }
        }
      }
      const { data, error } = await supabase.from("leads").update(sanitized).eq("id", id).select().single();
      if (!error && data) return data as Lead;
      if (error) console.error("Supabase updateLead error:", error);
    } catch (e) {
      console.warn("Supabase updateLead fallback:", e);
    }
  }

  const db = ensureDbFile();
  const idx = db.leads.findIndex((l) => l.id === id);
  if (idx === -1) return null;
  db.leads[idx] = { ...db.leads[idx], ...updates };
  saveDb(db);
  return db.leads[idx];
}

export async function clearLeads(campaignId?: string): Promise<void> {
  if (supabase) {
    try {
      if (campaignId && campaignId !== "all") {
        await supabase.from("leads").delete().eq("campaign_id", campaignId);
      } else {
        await supabase.from("leads").delete().neq("id", "");
      }
      return;
    } catch (e) {
      console.warn("Supabase clearLeads fallback:", e);
    }
  }

  const db = ensureDbFile();
  if (campaignId && campaignId !== "all") {
    db.leads = db.leads.filter((l) => l.campaign_id !== campaignId);
  } else {
    db.leads = [];
  }
  saveDb(db);
}

// -----------------------------------------------------------------------------
// ENGINE DISPATCHER QUERIES
// -----------------------------------------------------------------------------
export async function getFollowupsSentTodayCount(): Promise<number> {
  const now = new Date();
  const todayEstStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
  const startOfDayEst = new Date(`${todayEstStr}T00:00:00-05:00`).toISOString();

  if (supabase) {
    try {
      const { count, error } = await supabase
        .from("outbound_logs")
        .select("*", { count: "exact", head: true })
        .eq("status", "SUCCESS")
        .ilike("subject", "Re:%")
        .gte("sent_at", startOfDayEst);
      if (!error && typeof count === "number") return count;
    } catch (e) {
      console.warn("Supabase count followups fallback:", e);
    }
  }

  const db = ensureDbFile();
  return (db.logs || []).filter(
    (l) => l.status === "SUCCESS" && l.subject?.startsWith("Re:") && l.sent_at >= startOfDayEst
  ).length;
}

export async function getNextDueLead(campaignId?: string): Promise<Lead | null> {
  const nowMs = Date.now();
  const MAX_DAILY_FOLLOWUPS = 35;
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const threeDaysAgoIso = new Date(nowMs - THREE_DAYS_MS).toISOString();

  if (supabase) {
    try {
      let activeCampIds: string[] = [];
      if (campaignId && campaignId !== "all") {
        activeCampIds = [campaignId];
      } else {
        const { data: camps, error: campErr } = await supabase.from("campaigns").select("id").eq("status", "ACTIVE");
        if (campErr || !camps || camps.length === 0) return null;
        activeCampIds = camps.map((c) => c.id);
      }

      // 1. Check if daily follow-up quota is still open (Capped at 35/day)
      const followupsToday = await getFollowupsSentTodayCount();
      if (followupsToday < MAX_DAILY_FOLLOWUPS) {
        // Query next eligible follow-up (SENT >= 3 days ago, active campaign, not replied, not already followed up)
        const { data: fData, error: fError } = await supabase
          .from("leads")
          .select("*")
          .eq("status", "SENT")
          .in("campaign_id", activeCampIds)
          .lte("sent_at", threeDaysAgoIso)
          .order("sent_at", { ascending: true })
          .limit(1);

        if (!fError && fData && fData.length > 0) {
          const fCandidate = fData[0] as Lead;
          fCandidate.is_followup = true;
          return fCandidate;
        }
      }

      // 2. Query next fresh lead (PENDING for the 115+ daily pool)
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("status", "PENDING")
        .in("campaign_id", activeCampIds)
        .order("scheduled_at", { ascending: true })
        .limit(1);

      if (!error) {
        if (data && data.length > 0) {
          const candidate = data[0] as Lead;
          // If lead is in transient error backoff (attempts > 0), wait until backoff expires
          if ((candidate.attempts || 0) > 0 && new Date(candidate.scheduled_at).getTime() > nowMs) {
            return null;
          }
          candidate.is_followup = false;
          return candidate;
        }
        return null;
      }
    } catch (e) {
      console.warn("Supabase getNextDueLead fallback:", e);
    }
  }

  const db = ensureDbFile();
  const activeCampIds =
    campaignId && campaignId !== "all"
      ? new Set([campaignId])
      : new Set(db.campaigns.filter((c) => c.status === "ACTIVE").map((c) => c.id));

  // Local fallback: Follow-ups first (capped at 35)
  const todayDateStr = new Date().toISOString().slice(0, 10);
  const followupsTodayLocal = (db.logs || []).filter(
    (l) => l.status === "SUCCESS" && l.subject?.startsWith("Re:") && l.sent_at >= todayDateStr
  ).length;

  if (followupsTodayLocal < MAX_DAILY_FOLLOWUPS) {
    const fCandidates = db.leads
      .filter((l) => activeCampIds.has(l.campaign_id) && l.status === "SENT" && l.sent_at && new Date(l.sent_at).getTime() <= nowMs - THREE_DAYS_MS)
      .sort((a, b) => new Date(a.sent_at!).getTime() - new Date(b.sent_at!).getTime());

    if (fCandidates.length > 0) {
      const fLead = fCandidates[0];
      fLead.is_followup = true;
      return fLead;
    }
  }

  // Local fallback: Fresh leads
  const candidates = db.leads
    .filter((l) => activeCampIds.has(l.campaign_id) && l.status === "PENDING")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  if (candidates.length === 0) return null;
  const first = candidates[0];
  if ((first.attempts || 0) > 0 && new Date(first.scheduled_at).getTime() > nowMs) {
    return null;
  }
  first.is_followup = false;
  return first;
}

export async function getEligibleInbox(): Promise<Inbox | null> {
  const nowMs = Date.now();
  const MIN_INBOX_COOLDOWN_MS = 120 * 1000; // 120s cooldown per inbox (anti-collision)

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("inboxes")
        .select("*")
        .eq("status", "ACTIVE")
        .order("last_sent_at", { ascending: true });

      if (!error) {
        if (data && data.length > 0) {
          const todayEst = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
          const eligible = (data as Inbox[]).find((i) => {
            const lastSentMs = new Date(i.last_sent_at || 0).getTime();
            const lastSentEst = i.last_sent_at ? new Date(i.last_sent_at).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "";
            const currentSentToday = (lastSentEst === todayEst) ? i.sent_today : 0;
            return currentSentToday < i.daily_limit && (nowMs - lastSentMs >= MIN_INBOX_COOLDOWN_MS);
          });
          if (eligible) return eligible;
        }
        return null;
      }
    } catch (e) {
      console.warn("Supabase getEligibleInbox fallback:", e);
    }
  }

  const db = ensureDbFile();
  const todayEstLocal = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York" });
  const candidates = db.inboxes.filter((i) => {
    const lastSentMs = new Date(i.last_sent_at || 0).getTime();
    const lastSentEst = i.last_sent_at ? new Date(i.last_sent_at).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "";
    const currentSentToday = (lastSentEst === todayEstLocal) ? i.sent_today : 0;
    return i.status === "ACTIVE" && currentSentToday < i.daily_limit && (nowMs - lastSentMs >= MIN_INBOX_COOLDOWN_MS);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(a.last_sent_at).getTime() - new Date(b.last_sent_at).getTime());
  return candidates[0];
}

export async function logOutbound(log: Omit<OutboundLog, "id" | "sent_at">): Promise<OutboundLog> {
  const entry: OutboundLog = {
    ...log,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sent_at: new Date().toISOString(),
  };

  if (supabase) {
    try {
      const { data, error } = await supabase.from("outbound_logs").insert(entry).select().single();
      if (!error && data) return data as OutboundLog;
    } catch (e) {
      console.warn("Supabase logOutbound fallback:", e);
    }
  }

  const db = ensureDbFile();
  db.logs.unshift(entry);
  if (db.logs.length > 500) db.logs = db.logs.slice(0, 500);
  saveDb(db);
  return entry;
}

export async function getOutboundLogs(): Promise<OutboundLog[]> {
  if (supabase) {
    try {
      const { data, error } = await supabase.from("outbound_logs").select("*").order("sent_at", { ascending: false }).limit(200);
      if (!error) return (data || []) as OutboundLog[];
    } catch (e) {
      console.warn("Supabase getOutboundLogs fallback:", e);
    }
  }

  const db = ensureDbFile();
  return db.logs;
}

// -----------------------------------------------------------------------------
// REPLIES OPERATIONS (Unibox Inbound Store)
// -----------------------------------------------------------------------------
const REPLIES_FILE = path.join(DATA_DIR, "replies.json");

function ensureRepliesFile(): ReplyRecord[] {
  if (isReadOnlyFs()) return [];
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(REPLIES_FILE)) {
      fs.writeFileSync(REPLIES_FILE, JSON.stringify([], null, 2), "utf-8");
      return [];
    }
    const raw = fs.readFileSync(REPLIES_FILE, "utf-8");
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveRepliesFile(replies: ReplyRecord[]) {
  if (isReadOnlyFs()) return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(REPLIES_FILE, JSON.stringify(replies, null, 2), "utf-8");
  } catch (e) {
    console.warn("saveRepliesFile skipped (read-only filesystem):", e);
  }
}

export async function getReplies(campaignId?: string): Promise<ReplyRecord[]> {
  if (supabase) {
    // 1. Try dedicated public.replies table
    try {
      let query = supabase.from("replies").select("*").order("received_at", { ascending: false });
      if (campaignId && campaignId !== "all") {
        query = query.eq("campaign_id", campaignId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) return data as ReplyRecord[];
    } catch {}

    // 2. Zero-CapEx Fallback: Parse from existing public.leads table
    try {
      let query = supabase.from("leads").select("*").not("last_error", "is", null);
      if (campaignId && campaignId !== "all") {
        query = query.eq("campaign_id", campaignId);
      }
      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        const parsedReplies: ReplyRecord[] = [];
        for (const l of data) {
          if (!l.last_error) continue;
          if (l.last_error.startsWith("[REPLY_DATA]:")) {
            try {
              const rawJson = l.last_error.replace("[REPLY_DATA]:", "");
              const payload = JSON.parse(rawJson);
              parsedReplies.push({
                id: `rep_${l.id}`,
                lead_id: l.id,
                campaign_id: l.campaign_id,
                inbox_email: payload.inbox_email || "Gmail Inbox",
                sender_email: l.recipient_email,
                sender_name: payload.sender_name || l.recipient_name,
                recipient_name: l.recipient_name,
                company_name: l.company_name,
                city: l.city,
                subject: payload.subject || "(No Subject)",
                body_text: payload.body_text || "",
                received_at: payload.received_at || l.sent_at || new Date().toISOString(),
                outbound_subject: l.subject_template,
                outbound_body: l.body_template,
                created_at: payload.received_at || new Date().toISOString(),
              });
              continue;
            } catch {}
          } else if (l.last_error.startsWith("[REPLIED]")) {
            const dateStr = l.last_error.replace("[REPLIED]", "").trim();
            parsedReplies.push({
              id: `rep_${l.id}`,
              lead_id: l.id,
              campaign_id: l.campaign_id,
              inbox_email: l.assigned_inbox_id || "Gmail Inbox",
              sender_email: l.recipient_email,
              sender_name: l.recipient_name,
              recipient_name: l.recipient_name,
              company_name: l.company_name,
              city: l.city,
              subject: "Re: Prospect Reply Captured",
              body_text: "Prospect inbound confirmed by IMAP scanner.",
              received_at: dateStr || l.sent_at || new Date().toISOString(),
              outbound_subject: l.subject_template,
              outbound_body: l.body_template,
              created_at: dateStr || new Date().toISOString(),
            });
          }
        }
        if (parsedReplies.length > 0) {
          parsedReplies.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
          return parsedReplies;
        }
      }
    } catch (e) {
      console.warn("Supabase leads fallback getReplies error:", e);
    }
  }

  const localReplies = ensureRepliesFile();
  if (campaignId && campaignId !== "all") {
    return localReplies.filter((r) => r.campaign_id === campaignId);
  }
  return localReplies;
}

export async function saveReply(reply: Omit<ReplyRecord, "id" | "created_at">): Promise<ReplyRecord> {
  const newEntry: ReplyRecord = {
    ...reply,
    id: `reply_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    created_at: new Date().toISOString(),
  };

  // 1. Try Supabase dedicated replies table if it exists
  if (supabase) {
    try {
      const { data, error } = await supabase.from("replies").insert(newEntry).select().single();
      if (!error && data) {
        const local = ensureRepliesFile();
        if (!local.some((r) => r.sender_email === reply.sender_email && r.received_at === reply.received_at)) {
          local.unshift(data as ReplyRecord);
          saveRepliesFile(local);
        }
        return data as ReplyRecord;
      }
    } catch {}

    // 2. Also persist reply payload into public.leads table (zero migration barrier)
    if (reply.lead_id) {
      try {
        const payload = {
          inbox_email: reply.inbox_email,
          sender_email: reply.sender_email,
          sender_name: reply.sender_name,
          subject: reply.subject,
          body_text: reply.body_text,
          received_at: reply.received_at,
        };
        await supabase
          .from("leads")
          .update({
            last_error: `[REPLY_DATA]:${JSON.stringify(payload)}`,
            status: "SENT",
          })
          .eq("id", reply.lead_id);
      } catch (e) {
        console.warn("Supabase lead last_error reply update fallback:", e);
      }
    }
  }

  // 3. Local JSON store fallback
  const local = ensureRepliesFile();
  const existingIdx = local.findIndex(
    (r) =>
      r.sender_email.toLowerCase() === reply.sender_email.toLowerCase() &&
      (r.received_at === reply.received_at || r.subject === reply.subject)
  );

  if (existingIdx !== -1) {
    local[existingIdx] = { ...local[existingIdx], ...newEntry, id: local[existingIdx].id };
    saveRepliesFile(local);
    return local[existingIdx];
  } else {
    local.unshift(newEntry);
    saveRepliesFile(local);
    return newEntry;
  }
}

export async function deleteReply(id: string): Promise<boolean> {
  if (supabase) {
    try {
      const { error } = await supabase.from("replies").delete().eq("id", id);
      if (!error) {
        const local = ensureRepliesFile();
        saveRepliesFile(local.filter((r) => r.id !== id));
        return true;
      }
    } catch {}
  }

  const local = ensureRepliesFile();
  const initialLen = local.length;
  const filtered = local.filter((r) => r.id !== id);
  saveRepliesFile(filtered);
  return filtered.length < initialLen;
}

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
  status: "PENDING" | "SENT" | "WAITING_FOLLOWUP" | "REPLIED" | "FAILED" | "SKIPPED";
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

interface DatabaseSchema {
  inboxes: Inbox[];
  campaigns: Campaign[];
  leads: Lead[];
  logs: OutboundLog[];
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
  if (supabase) {
    try {
      const { data, error } = await supabase.from("inboxes").select("*").order("created_at", { ascending: true });
      if (!error) return (data || []) as Inbox[];
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
      if (!error) return (data || []) as Lead[];
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
export async function getNextDueLead(campaignId?: string): Promise<Lead | null> {
  const nowIso = new Date().toISOString();

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

      let query = supabase
        .from("leads")
        .select("*")
        .in("status", ["PENDING", "WAITING_FOLLOWUP"])
        .in("campaign_id", activeCampIds)
        .lte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(1);

      const { data, error } = await query;
      if (!error) {
        if (data && data.length > 0) return data[0] as Lead;
        return null;
      }
    } catch (e) {
      console.warn("Supabase getNextDueLead fallback:", e);
    }
  }

  const db = ensureDbFile();
  const now = new Date();
  
  if (campaignId && campaignId !== "all") {
    const lead = db.leads.find((l) => l.campaign_id === campaignId && (l.status === "PENDING" || l.status === "WAITING_FOLLOWUP") && new Date(l.scheduled_at) <= now);
    return lead || null;
  }

  const activeCampIds = new Set(db.campaigns.filter((c) => c.status === "ACTIVE").map((c) => c.id));
  const lead = db.leads.find((l) => activeCampIds.has(l.campaign_id) && (l.status === "PENDING" || l.status === "WAITING_FOLLOWUP") && new Date(l.scheduled_at) <= now);
  return lead || null;
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

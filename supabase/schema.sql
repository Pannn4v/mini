-- ==============================================================================
-- MINI-INSTANTLY: SOVEREIGN SEQUENCER DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- Standard: Stripe Infrastructure · Zero-Slop · Fully Idempotent
-- ==============================================================================

-- 1. CAMPAIGNS TABLE
CREATE TABLE IF NOT EXISTS public.campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market_category TEXT NOT NULL DEFAULT 'CUSTOM',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED')),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  window_start TEXT NOT NULL DEFAULT '07:30',
  window_end TEXT NOT NULL DEFAULT '18:00',
  min_interval_mins INTEGER NOT NULL DEFAULT 4,
  max_interval_mins INTEGER NOT NULL DEFAULT 8,
  subject_default TEXT,
  body_default TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. INBOXES TABLE (Multi-Sender Pool)
CREATE TABLE IF NOT EXISTS public.inboxes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  app_password TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 15,
  sent_today INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ DEFAULT '1970-01-01 00:00:00+00',
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'COOLDOWN', 'ERROR')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. LEADS TABLE (Campaign-Scoped Execution Queue)
CREATE TABLE IF NOT EXISTS public.leads (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  city TEXT NOT NULL,
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  assigned_inbox_id TEXT REFERENCES public.inboxes(id) ON DELETE SET NULL,
  attempts INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. OUTBOUND LOGS TABLE (Telemetry & Audit Sink)
CREATE TABLE IF NOT EXISTS public.outbound_logs (
  id TEXT PRIMARY KEY,
  lead_id TEXT,
  inbox_id TEXT,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
  smtp_response TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==============================================================================
-- HIGH-PERFORMANCE DISPATCH INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_leads_pending_scheduled 
  ON public.leads(campaign_id, status, scheduled_at) 
  WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_leads_campaign_id 
  ON public.leads(campaign_id);

CREATE INDEX IF NOT EXISTS idx_inboxes_round_robin 
  ON public.inboxes(status, sent_today, last_sent_at);

CREATE INDEX IF NOT EXISTS idx_logs_sent_at 
  ON public.outbound_logs(sent_at DESC);

-- ==============================================================================
-- INITIAL PRESET CAMPAIGNS SEED (IDEMPOTENT UPSERT)
-- ==============================================================================
INSERT INTO public.campaigns (
  id, 
  name, 
  market_category, 
  status, 
  timezone, 
  window_start, 
  window_end, 
  min_interval_mins, 
  max_interval_mins, 
  subject_default, 
  body_default
)
VALUES 
  (
    'campaign-school-fl',
    'School E-Rate Supply Strike (Florida)',
    'SCHOOL_WIFI',
    'ACTIVE',
    'America/New_York',
    '07:30',
    '18:00',
    4,
    8,
    '{central fl charter rfp / cabling scope|volusia charter school tender} / crew availability',
    '{Hi|Hey|Good morning} {first_name},

Reaching out directly to {company_name} regarding the Category 2 low-voltage cabling scope for Burns Science & Technology Charter School in Volusia County.

The deployment calls for Cat6A plenum drops, patch panels, 24/48-port PoE switching, and indoor/outdoor Access Point mounting (~90 AP units across the campus).

This is currently in the statutory 28-day E-Rate review window before the school locks their installation vendor.

Are you open to reviewing the spec sheet and BoQ before bidding locks?

Best,
Pandu'
  ),
  (
    'campaign-airport-paving',
    'Airport Paving Clearance (FAA AIP)',
    'AIRPORT_PAVING',
    'ACTIVE',
    'America/New_York',
    '07:30',
    '18:00',
    4,
    8,
    'airport work in {city} / paving contractor availability',
    '{Hi|Hey|Good morning} {first_name},

I have airports in {city} that want more contractors bidding on their next runway and taxiway job.

Thanks for reading (also, no call needed, I can easily make the introduction).

Best,
Pandu'
  )
ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_logs ENABLE ROW LEVEL SECURITY;

-- Allow full access to backend Service Role (used by Vercel serverless API routes)
DROP POLICY IF EXISTS "Service role full access on campaigns" ON public.campaigns;
CREATE POLICY "Service role full access on campaigns" ON public.campaigns FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on inboxes" ON public.inboxes;
CREATE POLICY "Service role full access on inboxes" ON public.inboxes FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on leads" ON public.leads;
CREATE POLICY "Service role full access on leads" ON public.leads FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role full access on outbound_logs" ON public.outbound_logs;
CREATE POLICY "Service role full access on outbound_logs" ON public.outbound_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon read/write if using anon key in sandbox
DROP POLICY IF EXISTS "Anon full access on campaigns" ON public.campaigns;
CREATE POLICY "Anon full access on campaigns" ON public.campaigns FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access on inboxes" ON public.inboxes;
CREATE POLICY "Anon full access on inboxes" ON public.inboxes FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access on leads" ON public.leads;
CREATE POLICY "Anon full access on leads" ON public.leads FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anon full access on outbound_logs" ON public.outbound_logs;
CREATE POLICY "Anon full access on outbound_logs" ON public.outbound_logs FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==============================================================================
-- 5. REPLIES TABLE (Unibox Inbound Clearinghouse)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.replies (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES public.leads(id) ON DELETE CASCADE,
  campaign_id TEXT,
  inbox_email TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  recipient_name TEXT,
  company_name TEXT,
  city TEXT,
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  outbound_subject TEXT,
  outbound_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_replies_sender_received ON public.replies(sender_email, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_replies_campaign_id ON public.replies(campaign_id);

ALTER TABLE public.replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access on replies" ON public.replies;
CREATE POLICY "Service role full access on replies" ON public.replies FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Anon full access on replies" ON public.replies;
CREATE POLICY "Anon full access on replies" ON public.replies FOR ALL TO anon USING (true) WITH CHECK (true);


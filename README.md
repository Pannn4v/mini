# MINI-INSTANTLY · THE SOVEREIGN SEQUENCER ENGINE
**Stripe Standard · Multi-Campaign · Casual Monochrome Minimalist · Zero-Ban Outbound**

Autonomous cold outbound sequencer engineered for Vercel Serverless ($0 CapEx) and Supabase PostgreSQL.

---

### Key Capabilities:

1. **Multi-Campaign Architecture (Instantly.ai Standard):**
   * Manage multiple target lanes side-by-side (`School E-Rate Supply Strike`, `Airport Paving Clearance`, `Commercial Solar EPC`, etc.).
   * Campaign-scoped queues, sequence templates, and independent status controls (`Active` / `Paused`).
2. **Anti-Timeout Vercel Cron (`/api/cron/dispatch`):**
   * Triggered every 5 minutes by Vercel Cron (`*/5 * * * *`).
   * Dispatches **strictly 1 email per tick** (~1.2s execution time). Zero 10-second serverless timeout crashes.
3. **Multi-Inbox Round-Robin Rotation:**
   * Rotates between your connected Gmail/Google Workspace accounts.
   * Enforces 15–20 minutes rest between sends per mailbox to protect sender reputation.
4. **EST Business Hours Autopilot:**
   * Gated strictly between **07:30 AM - 06:00 PM EST**. Sleeps outside US business hours.
5. **Zero-Downtime Dual-Mode Database:**
   * **Local Development**: Runs out-of-the-box using lightweight JSON storage (`data/store.json`).
   * **Production Cloud (Vercel)**: Automatically switches to Supabase PostgreSQL when environment variables are set.

---

### Supabase Cloud Setup (3 Steps):

1. **Create Project**: Go to [supabase.com](https://supabase.com) and create a free project.
2. **Execute Migration**:
   * Open the **SQL Editor** tab in your Supabase dashboard.
   * Copy the entire contents of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
   * All 4 tables (`campaigns`, `inboxes`, `leads`, `outbound_logs`), indexes, and preset seeds will be generated instantly.
3. **Copy Credentials**:
   * Go to **Project Settings** → **API**.
   * Copy `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`.
   * Copy `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`.

---

### Local Quickstart:

```bash
cd mini-instantly
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

### Git & Vercel Deployment:

1. **Initialize & Push to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: sovereign sequencer multi-campaign engine"
   git branch -M main
   git remote add origin https://github.com/<your-username>/mini-instantly.git
   git push -u origin main
   ```
2. **Import to Vercel**:
   * Link your GitHub repository in Vercel.
   * Add Environment Variables:
     * `NEXT_PUBLIC_SUPABASE_URL`
     * `SUPABASE_SERVICE_ROLE_KEY`
     * `CRON_SECRET` (optional, for securing cron endpoint)
   * Click **Deploy**. Vercel Cron will automatically pick up `vercel.json` and start scheduled execution.

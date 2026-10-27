const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const parts = line.trim().split('=');
    if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
  });
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env.local');
  process.exit(1);
}

function parseCsv(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]);
  const rows = [];
  let i = 1;
  while (i < lines.length) {
    let line = lines[i];
    while ((line.match(/"/g) || []).length % 2 !== 0 && i + 1 < lines.length) {
      i++;
      line += '\n' + lines[i];
    }
    const values = parseCsvLine(line);
    if (values.length > 0) {
      const obj = {};
      header.forEach((h, idx) => {
        obj[h.trim()] = (values[idx] || '').trim();
      });
      rows.push(obj);
    }
    i++;
  }
  return rows;
}

function parseCsvLine(line) {
  const values = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(cur);
      cur = '';
    } else {
      cur += char;
    }
  }
  values.push(cur);
  return values;
}

async function requestSupabase(endpoint, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(supabaseUrl + endpoint);
    const headers = {
      'apikey': supabaseKey,
      'Authorization': 'Bearer ' + supabaseKey,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    const req = https.request(url, { method, headers }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : null;
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('=== BEEF MARKET BATCH INGESTION ===');

  const supplyFile = 'C:\\DATA\\PANDU\\Connector OS\\beefmarket\\beef-packers-2026-10-24-232109.csv';
  const demandFile = 'C:\\DATA\\PANDU\\Connector OS\\beefmarket\\food-companies-2026-10-24-232109.csv';

  const rawSupply = parseCsv(supplyFile);
  const rawDemand = parseCsv(demandFile);

  console.log(`Loaded ${rawSupply.length} Beef Packers (Supply) and ${rawDemand.length} Food Companies (Demand).`);

  // 1. Fetch existing leads for deduplication
  const { data: existingLeads } = await requestSupabase('/rest/v1/leads?select=recipient_email');
  const existingSet = new Set((existingLeads || []).map(l => (l.recipient_email || '').toLowerCase().trim()));
  console.log(`Existing unique leads in Supabase: ${existingSet.size}`);

  const uniqueSupply = rawSupply.filter(c => c.email && !existingSet.has(c.email.toLowerCase().trim()));
  const uniqueDemand = rawDemand.filter(c => c.email && !existingSet.has(c.email.toLowerCase().trim()));

  console.log(`Unique Supply leads to inject: ${uniqueSupply.length} / ${rawSupply.length}`);
  console.log(`Unique Demand leads to inject: ${uniqueDemand.length} / ${rawDemand.length}`);

  // Base schedule: Starting Monday Oct 26, 2026 at 07:00 AM America/New_York (11:00 UTC)
  // Check if today is before Monday window
  const now = new Date();
  let baseSupplyMs = Date.UTC(2026, 9, 26, 11, 0, 0); // Monday Oct 26 11:00:00 UTC (07:00 EDT)
  if (now.getTime() > baseSupplyMs) {
    baseSupplyMs = now.getTime() + 5 * 60 * 1000;
  }
  const baseDemandMs = baseSupplyMs + 2.5 * 60 * 1000; // offset by 2.5 mins

  // 2. Format Supply Leads -> camp_1792921079852_jj4x (Beef Supply)
  const supplyCampaignId = 'camp_1792921079852_jj4x';
  const supplyLeads = uniqueSupply.map((row, idx) => {
    const scheduledAt = new Date(baseSupplyMs + idx * 5 * 60 * 1000).toISOString();
    const body = [row.p1, row.p2, row.p3, row.p4].filter(Boolean).join('\n\n');
    return {
      id: `lead_${Date.now()}_beef_s_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: supplyCampaignId,
      recipient_email: row.email.toLowerCase().trim(),
      recipient_name: row.contact || row.greeting || 'Partner',
      company_name: row.company || 'Beef Processor',
      city: row.city || row.state || 'United States',
      subject_template: row.subject,
      body_template: body,
      status: 'PENDING',
      scheduled_at: scheduledAt,
      created_at: new Date().toISOString()
    };
  });

  // 3. Format Demand Leads -> camp_1792921096362_86b6 (Beef Demand)
  const demandCampaignId = 'camp_1792921096362_86b6';
  const demandLeads = uniqueDemand.map((row, idx) => {
    const scheduledAt = new Date(baseDemandMs + idx * 5 * 60 * 1000).toISOString();
    const body = [row.p1, row.p2, row.p3, row.p4].filter(Boolean).join('\n\n');
    return {
      id: `lead_${Date.now()}_beef_d_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: demandCampaignId,
      recipient_email: row.email.toLowerCase().trim(),
      recipient_name: row.contact || row.greeting || 'Partner',
      company_name: row.company || 'Food Manufacturer',
      city: row.city || row.state || 'United States',
      subject_template: row.subject,
      body_template: body,
      status: 'PENDING',
      scheduled_at: scheduledAt,
      created_at: new Date().toISOString()
    };
  });

  console.log(`Prepared ${supplyLeads.length} Supply leads and ${demandLeads.length} Demand leads.`);

  // 4. Batch Ingestion
  async function insertChunk(items, label) {
    const chunkSize = 25;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const res = await requestSupabase('/rest/v1/leads', 'POST', chunk);
      if (res.status === 201 || res.status === 200) {
        console.log(`[+] Injected ${chunk.length} ${label} leads (chunk ${Math.floor(i / chunkSize) + 1})`);
      } else {
        console.error(`[-] Failed to inject ${label}:`, res.status, res.data || res.raw);
      }
    }
  }

  if (supplyLeads.length > 0) {
    await insertChunk(supplyLeads, 'Beef Supply');
  }
  if (demandLeads.length > 0) {
    await insertChunk(demandLeads, 'Beef Demand');
  }

  // 5. Update local store.json for offline parity
  const storePath = path.join(__dirname, '..', 'data', 'store.json');
  if (fs.existsSync(storePath)) {
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (!store.campaigns) store.campaigns = [];
      if (!store.leads) store.leads = [];

      // Ensure Beef campaigns exist in store.json
      if (!store.campaigns.some(c => c.id === supplyCampaignId)) {
        store.campaigns.push({
          id: supplyCampaignId,
          name: 'Beef Supply',
          market_category: 'CUSTOM',
          status: 'ACTIVE',
          timezone: 'America/New_York',
          window_start: '07:00',
          window_end: '18:00',
          min_interval_mins: 4,
          max_interval_mins: 8,
          subject_default: 'Partnership inquiry regarding {company_name}',
          body_default: "Hi {first_name},\n\nHope you're having a great week at {company_name}.\n\nBest,\nPandu",
          created_at: new Date().toISOString()
        });
      }

      if (!store.campaigns.some(c => c.id === demandCampaignId)) {
        store.campaigns.push({
          id: demandCampaignId,
          name: 'Beef Demand',
          market_category: 'CUSTOM',
          status: 'ACTIVE',
          timezone: 'America/New_York',
          window_start: '07:00',
          window_end: '18:00',
          min_interval_mins: 4,
          max_interval_mins: 8,
          subject_default: 'Partnership inquiry regarding {company_name}',
          body_default: "Hi {first_name},\n\nHope you're having a great week at {company_name}.\n\nBest,\nPandu",
          created_at: new Date().toISOString()
        });
      }

      store.leads.push(...supplyLeads, ...demandLeads);
      fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
      console.log(`[+] Synced ${supplyLeads.length + demandLeads.length} leads and campaigns to local store.json`);
    } catch (e) {
      console.warn('Local store sync warning:', e.message);
    }
  }

  // 6. Verify totals from Supabase
  const { data: finalSupply } = await requestSupabase(`/rest/v1/leads?select=id&campaign_id=eq.${supplyCampaignId}&status=eq.PENDING`);
  const { data: finalDemand } = await requestSupabase(`/rest/v1/leads?select=id&campaign_id=eq.${demandCampaignId}&status=eq.PENDING`);

  console.log('\n=== INGESTION SUMMARY ===');
  console.log(`Beef Supply (${supplyCampaignId}): ${(finalSupply || []).length} PENDING`);
  console.log(`Beef Demand (${demandCampaignId}): ${(finalDemand || []).length} PENDING`);
  console.log(`Target Window: 07:00 - 18:00 America/New_York`);
  console.log(`Next Batch Scheduled Start: ${new Date(baseSupplyMs).toISOString()} (Monday 07:00 EDT)`);
}

run().catch(console.error);

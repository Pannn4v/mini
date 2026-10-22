const fs = require('fs');
const path = require('path');
const https = require('https');

const envPath = path.join(__dirname, '..', '.env.local');
const env = {};
fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const parts = line.trim().split('=');
  if (parts.length >= 2) env[parts[0].trim()] = parts.slice(1).join('=').trim();
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

function parseCsv(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];

  // Parse header
  const header = parseCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length === 0) continue;
    const obj = {};
    header.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(obj);
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
  console.log('=== OIL MARKET 25/75 BATCH INGESTION ===');

  // 1. Files
  const companiesFile = path.join(__dirname, '..', 'data', 'oil-companies-2026-10-22-125721.csv');
  const crewsFile = path.join(__dirname, '..', 'data', 'crews-2026-10-22-125721.csv');

  const rawCompanies = parseCsv(companiesFile);
  const rawCrews = parseCsv(crewsFile);

  console.log(`Loaded ${rawCompanies.length} companies and ${rawCrews.length} crews from CSV.`);

  // 2. Fetch existing leads for deduplication
  const { data: existingLeads } = await requestSupabase('/rest/v1/leads?select=recipient_email');
  const existingSet = new Set((existingLeads || []).map(l => l.recipient_email.toLowerCase().trim()));
  console.log(`Existing leads in Supabase: ${existingSet.size}`);

  // Deduplicate
  const uniqueCompanies = rawCompanies.filter(c => c.email && !existingSet.has(c.email.toLowerCase().trim()));
  const uniqueCrews = rawCrews.filter(c => c.email && !existingSet.has(c.email.toLowerCase().trim()));

  console.log(`Unique Companies to inject: ${uniqueCompanies.length}`);
  console.log(`Unique Crews to inject: ${uniqueCrews.length}`);

  // 3. Prepare Batch Schedule
  // Next business window starts at 07:00 AM EDT today (11:00 UTC = 19:00 WITA)
  const now = new Date();
  const nextWindowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0));
  // If already past 11:00 UTC today, start 5 mins from now
  const baseTimeMs = nextWindowUtc.getTime() > Date.now() ? nextWindowUtc.getTime() : Date.now() + 5 * 60 * 1000;

  // 4. Transform Crews (Supply -> camp_1792481395570_qjbo)
  const supplyLeads = uniqueCrews.slice(0, 25).map((row, idx) => {
    const scheduledAt = new Date(baseTimeMs + idx * 6 * 60 * 1000).toISOString();
    const city = row.city || row.state || 'Permian Basin';
    const trucks = row.trucks || 'commercial';
    const company = row.company || 'Oilfield Services';
    const greeting = row.greeting || row.contact || 'there';

    const subject = row.subject || `{${trucks} trucks / fleet capacity in ${city}|crew availability / ${city} working radius|quick question / ${company} crews}`;
    const body = `${row.p1 || 'Hi ' + greeting + ','}\n\n${row.p2 || "Reaching out because I connect local crews with oil companies (I do this independently, I don't represent them)."}\n\n${row.p3 || "I've got a couple of oil companies that could use another crew."}\n\n${row.p4 || "Before I send anyone your way, would you let me know if you have room for more jobs?"}\n\nBest,\nPandu`;

    return {
      id: `lead_${Date.now()}_s_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: 'camp_1792481395570_qjbo',
      recipient_email: row.email.toLowerCase().trim(),
      recipient_name: row.contact || greeting,
      company_name: company,
      city: city,
      subject_template: subject,
      body_template: body,
      status: 'PENDING',
      scheduled_at: scheduledAt,
      created_at: new Date().toISOString()
    };
  });

  // 5. Transform Companies (Demand -> camp_1792481404891_wyf9)
  const demandLeads = uniqueCompanies.slice(0, 75).map((row, idx) => {
    // Interleave with supply
    const scheduledAt = new Date(baseTimeMs + idx * 4 * 60 * 1000).toISOString();
    const state = row.state || 'Texas';
    const company = row.company || 'Exploration & Production';
    const greeting = row.greeting || row.contact || 'there';

    const subject = row.subject || `{standby roustabout & hauling crews / ${state}|field service support / recent drilling permits|quick question / field service capacity}`;
    const body = `${row.p1 || 'Hi ' + greeting + ','}\n\n${row.p2 || "Reaching out because I connect oil companies with local crews looking for work (I do this independently, I don't represent them)."}\n\n${row.p3 || "I've got a couple of crews in " + state + " with their own trucks and equipment."}\n\n${row.p4 || "Do you need any extra crews to keep things running?"}\n\nBest,\nPandu`;

    return {
      id: `lead_${Date.now()}_d_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: 'camp_1792481404891_wyf9',
      recipient_email: row.email.toLowerCase().trim(),
      recipient_name: row.contact || greeting,
      company_name: company,
      city: state,
      subject_template: subject,
      body_template: body,
      status: 'PENDING',
      scheduled_at: scheduledAt,
      created_at: new Date().toISOString()
    };
  });

  console.log(`Transformed: ${supplyLeads.length} Supply leads, ${demandLeads.length} Demand leads.`);

  // 6. Inject in Chunks
  async function insertChunk(items, label) {
    const chunkSize = 25;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const res = await requestSupabase('/rest/v1/leads', 'POST', chunk);
      if (res.status === 201 || res.status === 200) {
        console.log(`[+] Injected ${chunk.length} ${label} leads (chunk ${i / chunkSize + 1})`);
      } else {
        console.error(`[-] Failed to inject ${label}:`, res.status, res.data || res.raw);
      }
    }
  }

  await insertChunk(supplyLeads, 'Supply Oil');
  await insertChunk(demandLeads, 'Demand Oil');

  // 7. Update Local store.json for parity
  const storePath = path.join(__dirname, '..', 'data', 'store.json');
  if (fs.existsSync(storePath)) {
    try {
      const store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      if (store.leads) {
        store.leads.push(...supplyLeads, ...demandLeads);
        fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
        console.log(`[+] Synced ${supplyLeads.length + demandLeads.length} leads to local store.json`);
      }
    } catch (e) {
      console.warn('Local store sync warning:', e.message);
    }
  }

  console.log('\n=== INGESTION COMPLETE ===');
  console.log(`Total New Ingested: ${supplyLeads.length + demandLeads.length} leads`);
  console.log(`Supply (Crews): ${supplyLeads.length} queued in camp_1792481395570_qjbo`);
  console.log(`Demand (Companies): ${demandLeads.length} queued in camp_1792481404891_wyf9`);
  console.log(`First scheduled_at: ${new Date(baseTimeMs).toISOString()} (Opening window 07:00 EDT / 19:00 WITA)`);
}

run().catch(console.error);

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
  console.log('=== ROCKEFELLER BATCH INGESTION (45 SUPPLY / 55 DEMAND) ===');

  const crewsFile = path.join(__dirname, '..', 'data', 'rockefeller-crews-2026-10-23-132807.csv');
  const companiesFile = path.join(__dirname, '..', 'data', 'rockefeller-companies-2026-10-23-132807.csv');

  const rawCrews = parseCsv(crewsFile);
  const rawCompanies = parseCsv(companiesFile);

  console.log(`Loaded ${rawCrews.length} Crews and ${rawCompanies.length} Companies.`);

  // 1. Fetch existing leads for deduplication
  const { data: existingLeads } = await requestSupabase('/rest/v1/leads?select=recipient_email');
  const existingSet = new Set((existingLeads || []).map(l => l.recipient_email.toLowerCase().trim()));
  console.log(`Existing leads in Supabase: ${existingSet.size}`);

  const uniqueCrews = rawCrews.filter(c => c.email && !existingSet.has(c.email.toLowerCase().trim()));
  const uniqueCompanies = rawCompanies.filter(c => c.email && !existingSet.has(c.email.toLowerCase().trim()));

  console.log(`Unique Crews to inject: ${uniqueCrews.length} / ${rawCrews.length}`);
  console.log(`Unique Companies to inject: ${uniqueCompanies.length} / ${rawCompanies.length}`);

  // Base schedule starting at opening window (11:00 UTC / 19:00 WITA today)
  const now = new Date();
  const nextWindowUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 11, 0, 0));
  const baseTimeMs = nextWindowUtc.getTime() > Date.now() ? nextWindowUtc.getTime() : Date.now() + 5 * 60 * 1000;

  // 2. Format Supply Leads (camp_1792481395570_qjbo)
  const supplyLeads = uniqueCrews.slice(0, 45).map((row, idx) => {
    const scheduledAt = new Date(baseTimeMs + idx * 5 * 60 * 1000).toISOString();
    return {
      id: `lead_${Date.now()}_rk_s_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: 'camp_1792481395570_qjbo',
      recipient_email: row.email.toLowerCase().trim(),
      recipient_name: row.contact || row.greeting || 'Partner',
      company_name: row.company || 'Oilfield Services',
      city: row.city || row.state || 'Vernal',
      subject_template: row.subject,
      body_template: row.body,
      status: 'PENDING',
      scheduled_at: scheduledAt,
      created_at: new Date().toISOString()
    };
  });

  // 3. Format Demand Leads (camp_1792481404891_wyf9)
  const demandLeads = uniqueCompanies.slice(0, 55).map((row, idx) => {
    const scheduledAt = new Date(baseTimeMs + idx * 4 * 60 * 1000).toISOString();
    return {
      id: `lead_${Date.now()}_rk_d_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: 'camp_1792481404891_wyf9',
      recipient_email: row.email.toLowerCase().trim(),
      recipient_name: row.contact || row.greeting || 'Operator',
      company_name: row.company || 'Exploration & Production',
      city: row.state || 'UT',
      subject_template: row.subject,
      body_template: row.body,
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

  await insertChunk(supplyLeads, 'Supply Oil');
  await insertChunk(demandLeads, 'Demand Oil');

  // 5. Update local store.json
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

  console.log('\n=== INGESTION SUMMARY ===');
  console.log(`Supply (Crews): ${supplyLeads.length} PENDING in camp_1792481395570_qjbo`);
  console.log(`Demand (Companies): ${demandLeads.length} PENDING in camp_1792481404891_wyf9`);
  console.log(`Opening Window: ${new Date(baseTimeMs).toISOString()} (11:00 UTC / 19:00 WITA)`);
}

run().catch(console.error);

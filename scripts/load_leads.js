const fs = require('fs');
const path = require('path');

// 1. Parse CLI Arguments
const args = process.argv.slice(2);
let campaignTarget = '';
let filePath = '';

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--campaign' || args[i] === '-c') {
    campaignTarget = args[i + 1];
    i++;
  } else if (args[i] === '--file' || args[i] === '-f') {
    filePath = args[i + 1];
    i++;
  }
}

if (!campaignTarget || !filePath) {
  console.error('\n[ERROR] Argumen tidak lengkap!');
  console.log('Usage: node load_leads.js --campaign "<Nama atau ID Campaign>" --file "<Path JSON File>"');
  process.exit(1);
}

// 2. Load Supabase Environment from mini-instantly .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error(`\n[ERROR] File .env.local tidak ditemukan di ${envPath}`);
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
let supabaseUrl = '';
let supabaseKey = '';

envContent.split('\n').forEach(line => {
  const trimmed = line.trim();
  if (trimmed.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) {
    supabaseUrl = trimmed.split('=')[1].trim();
  }
  if (trimmed.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    supabaseKey = trimmed.split('=')[1].trim();
  }
  if (!supabaseKey && trimmed.startsWith('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=')) {
    supabaseKey = trimmed.split('=')[1].trim();
  }
  if (!supabaseKey && trimmed.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
    supabaseKey = trimmed.split('=')[1].trim();
  }
});

if (!supabaseUrl || !supabaseKey) {
  console.error('\n[ERROR] Kredensial Supabase URL / Key tidak ditemukan di .env.local');
  process.exit(1);
}

if (typeof globalThis.WebSocket === "undefined") {
  try {
    globalThis.WebSocket = require("ws");
  } catch {}
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

async function execute() {
  console.log(`\n=== SOVEREIGN TERMINAL LEADS LOADER ===`);
  console.log(`Target Campaign: "${campaignTarget}"`);
  console.log(`Source File: "${filePath}"`);

  // 3. Resolve Target Campaign
  const { data: campaigns, error: campErr } = await supabase.from('campaigns').select('id, name, status');
  if (campErr) {
    console.error('[ERROR] Gagal membaca tabel campaigns:', campErr.message);
    process.exit(1);
  }

  if (!campaigns || campaigns.length === 0) {
    console.error('[ERROR] Tidak ada campaign di database.');
    process.exit(1);
  }

  // Cari exact match atau case-insensitive partial match
  const matchedCamp = campaigns.find(c => 
    c.id.toLowerCase() === campaignTarget.toLowerCase() ||
    c.name.toLowerCase() === campaignTarget.toLowerCase() ||
    c.name.toLowerCase().includes(campaignTarget.toLowerCase())
  );

  if (!matchedCamp) {
    console.error(`\n[ERROR] Campaign "${campaignTarget}" TIDAK DITEMUKAN!`);
    console.log('Daftar campaign yang tersedia di database:');
    campaigns.forEach(c => console.log(`  • [${c.id}] ${c.name} (Status: ${c.status})`));
    process.exit(1);
  }

  console.log(`[LOCKED] Target Terkunci -> ID: ${matchedCamp.id} | Nama: "${matchedCamp.name}"`);

  // 4. Read & Validate Leads File
  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`\n[ERROR] File JSON tidak ditemukan di ${fullPath}`);
    process.exit(1);
  }

  let rawLeads;
  try {
    rawLeads = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    if (!Array.isArray(rawLeads)) throw new Error('File harus berupa JSON Array');
  } catch (e) {
    console.error(`\n[ERROR] Format JSON tidak valid: ${e.message}`);
    process.exit(1);
  }

  console.log(`[READ] Membaca ${rawLeads.length} leads mentah dari disk...`);

  // 5. Transform & Map Contract
  const transformedLeads = rawLeads.map((item, idx) => {
    const email = item.recipient_email || item.email || item.contact_email;
    const name = item.recipient_name || item.name || item.contact_name || item.contact || 'Partner';
    const company = item.company_name || item.company || 'Company';
    const city = item.city || 'Permian Basin';
    const subject = item.subject_template || item.subject || 'Inquiry';
    const body = item.body_template || item.body || 'Hello';
    
    // Spread 5 minutes intervals
    const scheduledAt = new Date(Date.now() + idx * 5 * 60 * 1000).toISOString();

    return {
      id: `lead_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      campaign_id: matchedCamp.id,
      recipient_email: email,
      recipient_name: name,
      company_name: company,
      city: city,
      subject_template: subject,
      body_template: body,
      status: 'PENDING',
      scheduled_at: scheduledAt,
      created_at: new Date().toISOString()
    };
  });

  // Validasi email
  const invalid = transformedLeads.filter(l => !l.recipient_email || !l.recipient_email.includes('@'));
  if (invalid.length > 0) {
    console.error(`[ERROR] Ada ${invalid.length} leads tanpa email yang valid. Batalkan proses.`);
    process.exit(1);
  }

  // 6. Direct Batch Insertion to Supabase
  console.log(`[INJECT] Mengirim ${transformedLeads.length} leads ke Supabase...`);
  const { data: inserted, error: insertErr } = await supabase.from('leads').insert(transformedLeads).select('id, recipient_email');

  if (insertErr) {
    console.error('[DATABASE ERROR] Gagal inject leads:', insertErr.message);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`[SUCCESS] ${inserted.length} LEADS BERHASIL DIINJEKSI!`);
  console.log(`Target: ${matchedCamp.name} (${matchedCamp.id})`);
  console.log(`Status: PENDING (Siap ditembak cron)`);
  console.log(`========================================\n`);
}

execute();

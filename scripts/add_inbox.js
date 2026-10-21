const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

// 1. Parse Arguments
const args = process.argv.slice(2);
let email = '';
let appPassword = '';
let displayName = 'Pandu Utama';
let dailyLimit = 50;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email' || args[i] === '-e') {
    email = args[i + 1]?.trim();
    i++;
  } else if (args[i] === '--pass' || args[i] === '-p') {
    appPassword = args[i + 1]?.trim();
    i++;
  } else if (args[i] === '--name' || args[i] === '-n') {
    displayName = args[i + 1]?.trim();
    i++;
  } else if (args[i] === '--limit' || args[i] === '-l') {
    dailyLimit = parseInt(args[i + 1]?.trim(), 10) || 50;
    i++;
  }
}

if (!email || !appPassword) {
  console.error('\n[ERROR] Argumen tidak lengkap!');
  console.log('Usage: node scripts/add_inbox.js --email <email> --pass "<16_letter_app_password>"');
  process.exit(1);
}

const cleanedPassword = appPassword.replace(/\s+/g, '');

console.log(`\n==============================================`);
console.log(`SOVEREIGN ZERO-TRUST INBOX VERIFICATION`);
console.log(`Target Email: ${email}`);
console.log(`Plafon Harian: ${dailyLimit}`);
console.log(`==============================================`);

// 2. Step 1: Real-time Socket Verification with Google SMTP
console.log(`[1/3] Menguji koneksi soket & App Password ke Google SMTP (Port 465 SSL)...`);

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: email,
    pass: cleanedPassword,
  },
  connectionTimeout: 8000,
  greetingTimeout: 8000,
  socketTimeout: 10000,
});

async function run() {
  try {
    await transporter.verify();
    console.log(`[PASS] Autentikasi Google SMTP SUKSES 100%! Kunci valid.`);
  } catch (err) {
    console.error(`\n[FATAL ERROR] Google menolak login!`);
    console.error(`Penyebab: ${err.message}`);
    console.error(`\nSolusi:`);
    console.error(`1. Pastikan 2-Step Verification di Google aktif.`);
    console.error(`2. Buka https://myaccount.google.com/apppasswords`);
    console.error(`3. Buat App Password baru 16 huruf dan pastikan tidak salah ketik.\n`);
    process.exit(1);
  }

  // 3. Step 2: Load Supabase Credentials
  console.log(`[2/3] Membaca kredensial database dari .env.local...`);
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error(`[ERROR] .env.local tidak ditemukan di ${envPath}`);
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  let supabaseUrl = '';
  let supabaseKey = '';

  envContent.split('\n').forEach(line => {
    const t = line.trim();
    if (t.startsWith('NEXT_PUBLIC_SUPABASE_URL=')) supabaseUrl = t.split('=')[1].trim();
    if (t.startsWith('SUPABASE_SERVICE_ROLE_KEY=') || t.startsWith('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=') || t.startsWith('NEXT_PUBLIC_SUPABASE_ANON_KEY=')) {
      if (!supabaseKey) supabaseKey = t.split('=')[1].trim();
    }
  });

  if (typeof globalThis.WebSocket === 'undefined') {
    try {
      globalThis.WebSocket = require('ws');
    } catch {}
  }

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  // 4. Step 3: Upsert into Supabase
  console.log(`[3/3] Memasukkan armada terverifikasi ke tabel inboxes Supabase...`);
  const inboxPayload = {
    id: `inbox_${email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '_')}`,
    email: email,
    display_name: displayName,
    app_password: appPassword,
    daily_limit: dailyLimit,
    sent_today: 0,
    last_sent_at: new Date(0).toISOString(),
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  };

  const { data, error } = await supabase.from('inboxes').upsert(inboxPayload).select();

  if (error) {
    console.error(`[DATABASE ERROR] Gagal mendaftarkan inbox: ${error.message}`);
    process.exit(1);
  }

  console.log(`\n==============================================`);
  console.log(`[SUCCESS] ARMADA RESMI DIAKTIFKAN KE DALAM SKUADRON!`);
  console.log(`Email : ${data[0].email}`);
  console.log(`Limit : ${data[0].daily_limit} email/hari`);
  console.log(`Status: ACTIVE`);
  console.log(`==============================================\n`);
}

run();

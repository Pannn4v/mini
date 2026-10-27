/**
 * Mini-Instantly Sovereign IMAP Sync Daemon
 * Periodically polls active Gmail inboxes (Port 993 TLS) every 2.5 minutes
 * Usage: node daemon_sync.js
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const INTERVAL_MS = 150 * 1000; // 2.5 minutes

console.log('========================================================');
console.log(' [MINI-INSTANTLY SOVEREIGN SYNC DAEMON ACTIVE]');
console.log(` Target: http://localhost:${PORT}/api/cron/sync-replies`);
console.log(` Polling Interval: ${INTERVAL_MS / 1000} seconds`);
console.log('========================================================\n');

function triggerSync() {
  const req = http.request(
    {
      hostname: 'localhost',
      port: PORT,
      path: '/api/cron/sync-replies',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const time = new Date().toLocaleTimeString('id-ID');
          if (json.status === 'SYNC_SUCCESS') {
            console.log(
              `[${time}] Sync OK: ${json.checked_inboxes} inboxes checked | ${json.auto_replied_count} new replies matched (${json.duration_ms}ms)`
            );
            if (json.auto_replied_leads && json.auto_replied_leads.length > 0) {
              json.auto_replied_leads.forEach((l) => {
                console.log(`  -> MATCHED: ${l.email} (${l.company || 'Unknown'})`);
              });
            }
          } else {
            console.log(`[${time}] Sync Notice: ${json.status} - ${json.message || json.error}`);
          }
        } catch (e) {
          console.log(`[${new Date().toLocaleTimeString('id-ID')}] Response received: ${data.substring(0, 100)}`);
        }
      });
    }
  );

  req.on('error', (err) => {
    console.warn(`[${new Date().toLocaleTimeString('id-ID')}] Server unreachable (${err.message}). Is Next.js running on port ${PORT}?`);
  });

  req.end();
}

// Initial sync
triggerSync();

// Loop
setInterval(triggerSync, INTERVAL_MS);

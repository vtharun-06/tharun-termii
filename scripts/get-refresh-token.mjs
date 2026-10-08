// One-time helper: prints a Google refresh token for read-only Calendar access.
// Usage: GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/get-refresh-token.mjs
import http from 'node:http';

const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET first.'); process.exit(1); }
const redirect = 'http://127.0.0.1:8765/cb';

const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: 'code', access_type: 'offline', prompt: 'consent',
  scope: 'https://www.googleapis.com/auth/calendar.readonly',
});
console.log('\nOpen this URL in your browser and approve:\n\n' + url + '\n');

http.createServer(async (req, res) => {
  const u = new URL(req.url, redirect);
  if (u.pathname !== '/cb') { res.end(); return; }
  const code = u.searchParams.get('code');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
  });
  const j = await r.json();
  res.end(j.refresh_token ? 'Done. Go back to the terminal.' : 'Failed. See terminal.');
  console.log(j.refresh_token ? `\nGOOGLE_REFRESH_TOKEN=${j.refresh_token}\n` : j);
  process.exit(0);
}).listen(8765);

/**
 * Sets up the DineroYard test desk through the app's own API, so it works the
 * same against local dev or a deployed copy. Safe to re-run: anything that
 * already exists is left alone.
 *
 *   node --env-file=.env.local scripts/setup-dineroyard.mjs [baseUrl]
 *
 * Needs DINEROYARD_EMAIL and DINEROYARD_PASSWORD in the environment (owner
 * login for the test desk). The bank and MoMo accounts below are placeholders
 * for testing; replace them with the desk's real accounts before going live.
 */

const BASE = (process.argv[2] ?? 'http://localhost:3010').replace(/\/+$/, '');
const EMAIL = process.env.DINEROYARD_EMAIL;
const PASSWORD = process.env.DINEROYARD_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Set DINEROYARD_EMAIL and DINEROYARD_PASSWORD first.');
  process.exit(1);
}

let cookie = '';
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
const ok = (label, r, allow = []) => {
  const fine = r.status < 300 || allow.includes(r.status);
  console.log(`${fine ? '✓' : '✗'} ${label}${r.status >= 300 ? ` (${r.status}: ${r.data?.error?.message ?? ''})` : ''}`);
  if (!fine) process.exit(1);
};

let r = await call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
if (r.status === 200) ok('Signed in to existing DineroYard desk', r);
else {
  r = await call('POST', '/api/auth/signup', { deskName: 'DineroYard', name: 'DineroYard Owner', email: EMAIL, password: PASSWORD });
  ok('Created DineroYard desk', r);
}

ok('Desk settings', await call('PUT', '/api/settings', { timezone: 'Africa/Accra', quoteTtlMinutes: 15, fundsWindowMinutes: 60, supportPhone: '+233 54 750 0381', customerNote: 'Always use your trade reference as the transfer narration.' }));

ok('Rate NGN → GHS', await call('PUT', '/api/rates', { corridor: 'NGN_GHS', customerRate: '106.20', referenceRate: '105.06', fee: '0', minPay: '0', maxPay: '', active: true }));
ok('Rate GHS → NGN', await call('PUT', '/api/rates', { corridor: 'GHS_NGN', customerRate: '103.80', referenceRate: '105.06', fee: '0', minPay: '0', maxPay: '', active: true }));

const rails = [
  { label: 'Providus collections (TEST)', currency: 'NGN', kind: 'BANK', provider: 'Providus Bank', accountNumber: '9912345678', accountName: 'DineroYard Ltd', canCollect: true, canPay: true, openingBalance: '5000000' },
  { label: 'MTN MoMo float (TEST)', currency: 'GHS', kind: 'MOMO', provider: 'MTN MoMo', accountNumber: '0551234567', accountName: 'DineroYard Ventures', canCollect: true, canPay: true, openingBalance: '200000' },
];
for (const rail of rails) ok(`Account: ${rail.label}`, await call('POST', '/api/rails', rail), [409]);

ok('WhatsApp Sandbox number', await call('POST', '/api/channels', { kind: 'WHATSAPP', number: (process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886').replace('whatsapp:', ''), label: 'WhatsApp (Sandbox)' }), [409]);
if (process.env.TWILIO_SMS_FROM) ok('SMS number', await call('POST', '/api/channels', { kind: 'SMS', number: process.env.TWILIO_SMS_FROM, label: 'SMS +1 620' }), [409]);

console.log(`\nDone. Sign in at ${BASE}/login as ${EMAIL} (password in .env.local).`);

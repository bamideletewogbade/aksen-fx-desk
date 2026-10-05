/**
 * Invites people to the DineroYard test desk as admins, signed in as its
 * password owner. They see the invite on /onboarding after signing up with
 * Clerk using that email. No email is sent.
 *
 *   node --env-file=.env.local scripts/invite-to-dineroyard.mjs you@example.com [more@example.com]
 */
const BASE = process.env.SETUP_BASE_URL ?? 'http://localhost:3010';
const emails = process.argv.slice(2);
if (!emails.length || !process.env.DINEROYARD_EMAIL || !process.env.DINEROYARD_PASSWORD) {
  console.error('Usage: node --env-file=.env.local scripts/invite-to-dineroyard.mjs email [email…] (needs DINEROYARD_EMAIL/PASSWORD)');
  process.exit(1);
}
const login = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.DINEROYARD_EMAIL, password: process.env.DINEROYARD_PASSWORD }) });
if (!login.ok) throw new Error(`Owner sign-in failed (${login.status})`);
const cookie = login.headers.get('set-cookie').split(';')[0];
for (const email of emails) {
  const r = await fetch(`${BASE}/api/team`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ email, role: 'ADMIN' }) });
  const d = await r.json().catch(() => ({}));
  console.log(r.ok ? `✓ Invited ${email} to DineroYard as admin` : `✗ ${email}: ${d?.error?.message ?? r.status}`);
}

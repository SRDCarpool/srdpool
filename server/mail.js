// Email delivery for sign-in codes.
//  1. BREVO_API_KEY set → Brevo's HTTPS API (port 443). Works on hosts that block SMTP
//     ports, e.g. Render's free instances. Recommended.
//  2. SMTP_HOST/USER/PASS set → any SMTP provider (Google Workspace, Zoho, SES…).
//  3. Neither → development: emails print to the server console.
import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
// Strip spaces/quotes that sneak in when pasting the key into a dashboard.
const BREVO_API_KEY = String(process.env.BREVO_API_KEY || '').trim().replace(/^["']|["']$/g, '').trim();
const useBrevoApi = !!BREVO_API_KEY;
const useSmtp = !useBrevoApi && !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
export const mailConfigured = useBrevoApi || useSmtp;
export const mailMode = useBrevoApi ? 'brevo-api' : useSmtp ? 'smtp' : 'console';

/** "SRDPool <codes@example.com>" → { name, email } */
function parseFrom(from) {
  const m = String(from || '').match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, '') || 'SRDPool', email: m[2] };
  return { name: 'SRDPool', email: String(from || SMTP_USER || '').trim() };
}
const sender = parseFrom(MAIL_FROM);

const transport = useSmtp
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  })
  : null;

async function sendViaBrevo(to, subject, text, html) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, textContent: text, htmlContent: html }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 300)}`);
  }
}

export async function sendMail(to, subject, text, html) {
  if (useBrevoApi) return sendViaBrevo(to, subject, text, html);
  if (useSmtp) {
    await transport.sendMail({ from: MAIL_FROM || `SRDPool <${SMTP_USER}>`, to, subject, text, html });
    return;
  }
  console.log(`\n✉️  [dev email → ${to}] ${subject}\n${text}\n`);
}

/** Startup check so problems show up in the host's logs straight away. */
export async function checkMail() {
  if (useBrevoApi) {
    try {
      const res = await fetch('https://api.brevo.com/v3/account', { headers: { 'api-key': BREVO_API_KEY, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
      if (res.ok) console.log(`[mail] Brevo API ready · sending as ${sender.email}`);
      else {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        const kind = BREVO_API_KEY.startsWith('xkeysib-') ? 'API key (xkeysib-…)'
          : BREVO_API_KEY.startsWith('xsmtpsib-') ? 'SMTP key (xsmtpsib-…) — this is the wrong kind; generate an API key instead'
          : 'unrecognised format — Brevo API keys start with xkeysib-';
        console.log(`[mail] Brevo API key rejected (${res.status}) · key looks like: ${kind} · length ${BREVO_API_KEY.length} · Brevo says: ${body}`);
      }
    } catch (e) { console.log('[mail] cannot reach Brevo API:', e.message); }
  } else if (useSmtp) {
    try { await transport.verify(); console.log(`[mail] SMTP ready (${SMTP_HOST}:${SMTP_PORT || 587}) · sending as ${MAIL_FROM || SMTP_USER}`); } catch (e) {
      console.log(`[mail] SMTP check failed (${SMTP_HOST}:${SMTP_PORT || 587}): ${e.message}. If your host blocks SMTP ports, set BREVO_API_KEY instead.`);
    }
  } else {
    console.log('[mail] no email service configured — sign-in codes print to this console');
  }
}

export function sendEmailOtp(email, code) {
  const text = `${code} is your SRDPool sign-in code. It expires in 10 minutes.\n\nIf you didn't try to sign in, you can ignore this email.`;
  const html = `<div style="font-family:system-ui,Segoe UI,Roboto,sans-serif;max-width:420px;margin:auto;padding:24px;color:#0f1b2d">
  <h2 style="margin:0 0 8px;color:#0b8a6b">SRDPool</h2>
  <p style="margin:0 0 16px">Your sign-in code is</p>
  <p style="font-size:32px;font-weight:800;letter-spacing:6px;margin:0 0 16px">${code}</p>
  <p style="margin:0;color:#6b7a90;font-size:14px">It expires in 10 minutes. If you didn't try to sign in, you can ignore this email.</p>
</div>`;
  return sendMail(email, `${code} is your SRDPool sign-in code`, text, html);
}

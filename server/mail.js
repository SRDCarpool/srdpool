// Email delivery for sign-in codes. Works with any SMTP provider (Google Workspace / Gmail
// app password, Zoho, Amazon SES, Brevo…). Without SMTP settings, emails print to the
// server console in development; production refuses to send codes until it is configured.
import nodemailer from 'nodemailer';

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
export const mailConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transport = mailConfigured
  ? nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })
  : null;

export async function sendMail(to, subject, text, html) {
  if (!transport) {
    console.log(`\n✉️  [dev email → ${to}] ${subject}\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: MAIL_FROM || `SRDPool <${SMTP_USER}>`, to, subject, text, html });
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

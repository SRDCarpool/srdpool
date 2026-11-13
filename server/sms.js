// SMS delivery (OTP codes, SOS alerts). Configure Twilio via env for real SMS,
// or swap in MSG91 etc. Without credentials, messages print to the server console.
const { TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: TOKEN, TWILIO_FROM: FROM } = process.env;

export const smsConfigured = !!(SID && TOKEN && FROM);

export async function sendSms(phone, text) {
  if (!smsConfigured) {
    console.log(`\n📱 [dev SMS → ${phone}] ${text}\n`);
    return;
  }
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${SID}:${TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: phone.replace(/\s/g, ''), From: FROM, Body: text }),
  });
  if (!res.ok) throw new Error('SMS provider error');
}

export const sendOtp = (phone, code) =>
  sendSms(phone, `${code} is your SRDPool verification code. It expires in 5 minutes. Do not share it with anyone.`);

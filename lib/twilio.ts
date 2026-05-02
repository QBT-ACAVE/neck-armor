// lib/twilio.ts — server-only
import twilioClient from 'twilio';

export type SendResult = {
  success: boolean;
  providerMessageId?: string;
  error?: string;
};

export async function sendSms(toE164: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    return { success: false, error: 'Twilio env vars missing' };
  }
  try {
    const client = twilioClient(sid, token);
    const msg = await client.messages.create({ from, to: toE164, body });
    return { success: true, providerMessageId: msg.sid };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

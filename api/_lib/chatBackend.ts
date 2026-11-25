import { GoogleGenAI } from '@google/genai';
import nodemailer from 'nodemailer';

export interface ChatHistoryTurn {
  senderRole: 'passenger' | 'ai' | 'admin' | 'counter_staff';
  text: string;
}

export interface AiReplyResult {
  reply: string;
  escalateToHuman: boolean;
  provider: 'gemini' | 'fallback';
}

const HUMAN_INTENT_PATTERNS = [
  /মানুষ/,
  /প্রতিনিধি/,
  /এজেন্ট/,
  /কাউন্টারের?\s*(লোক|কেউ|সাথে)/,
  /অ্যাডমিন/,
  /সাপোর্ট\s*টিম/,
  /\bmanus(h|er|her)?\b/i,
  /\bmanush\b/i,
  /\bhuman\b/i,
  /\breal\s*person\b/i,
  /\blive\s*(agent|person|support|staff)\b/i,
  /\btalk\s*to\s*(a\s*)?(human|agent|admin|staff|counter|someone|representative|operator)\b/i,
  /\bspeak\s*(with|to)\s*(a\s*)?(human|agent|admin|staff|counter|someone)\b/i,
  /\bconnect\s*(me\s*)?(to|with)\s*(a\s*)?(human|agent|admin|staff|counter)\b/i,
  /\b(admin|counter\s*staff|representative|customer\s*care)\b.*\b(talk|chat|help|hlp|lagbe|lagbhe|chai|kotha|kota)\b/i,
  /\b(kotha|kota)\s*(bolte|blte)\s*(chai|cay)\b/i,
];

export function detectHumanEscalationIntent(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  return HUMAN_INTENT_PATTERNS.some((re) => re.test(normalized));
}

function buildFallbackReply(message: string, routeSummary?: string): string {
  const lower = message.toLowerCase();

  if (/pnr|track|verify|টিকিট|টিকেট\s*চেক|ভেরিফাই/.test(lower)) {
    return 'আপনার PNR নম্বর দিয়ে সরাসরি "Track Ticket" (/track) পেজ থেকে টিকেটের স্ট্যাটাস দেখতে পারবেন এবং Passenger Dashboard (/passenger/bookings) থেকে QR E-Ticket PDF ডাউনলোড করতে পারবেন।';
  }
  if (/refund|cancel|বাতিল|রিফান্ড|ফেরত/.test(lower)) {
    return 'DeshLine বাতিল ও রিফান্ড নীতিমালা: যাত্রার ২৪ ঘণ্টার বেশি আগে বাতিল করলে ৮৫% রিফান্ড, ১২-২৪ ঘণ্টার মধ্যে ৫০% রিফান্ড, এবং ১২ ঘণ্টার কম সময়ে ০% রিফান্ড প্রযোজ্য। Passenger Dashboard -> My Bookings থেকে বাতিল/রিফান্ড রিকোয়েস্ট করতে পারবেন।';
  }
  if (/pay|payment|bkash|ssl|aamarpay|পেমেন্ট|টাকা|বিকাশ|নগদ/.test(lower)) {
    return 'আপনি অনলাইনে SSLCommerz অথবা aamarPay-এর মাধ্যমে (bKash, Nagad, Card) অথবা আমাদের অনুমোদিত বাস কাউন্টার থেকে নগদে (Counter Cash) টিকেট কিনতে পারবেন। সিট সিলেক্ট করলে ৫ মিনিটের জন্য সিট লক থাকে।';
  }
  if (/fare|price|route|dhaka|cox|chattogram|sylhet|ভাড়া|রুট|কক্সবাজার|ঢাকা|চট্টগ্রাম|সিলেট/.test(lower)) {
    const routesInfo = routeSummary
      ? `আমাদের সক্রিয় রুটসমূহ: ${routeSummary}।`
      : 'আমাদের প্রধান রুট: ঢাকা ↔ কক্সবাজার, ঢাকা ↔ চট্টগ্রাম, ঢাকা ↔ সিলেট, ঢাকা ↔ রাজশাহী, ঢাকা ↔ খুলনা, ঢাকা ↔ রংপুর এবং ঢাকা ↔ বরিশাল।';
    return `${routesInfo} হোমপেজ বা Search পেজ (/search) থেকে যাত্রার তারিখ দিয়ে লাইভ সিট ও ভাড়া দেখে বুকিং করতে পারবেন।`;
  }
  if (/counter|address|phone|হটলাইন|ঠিকানা|কাউন্টার/.test(lower)) {
    return 'আমাদের প্রধান অফিস: ১৪৮ মিরপুর রোড, কল্যাণপুর, ঢাকা ১২০৭। ২৪/৭ হটলাইন: +880 1700-000999 ও ইমেইল: support@deshline.com.bd। অনুমোদিত সব কাউন্টারের তালিকা Contact (/contact) পেজে পাবেন।';
  }

  return 'ধন্যবাদ আপনার প্রশ্নের জন্য! DeshLine Paribahan-এ আপনি /search থেকে বাস খুঁজতে, সিট সিলেক্ট করে অনলাইন পেমেন্টে টিকেট কাটতে এবং /track থেকে PNR ভেরিফাই করতে পারবেন। কোনো নির্দিষ্ট সমস্যায় সরাসরি Admin বা Bus Counter Staff-এর সাহায্য চাইলে "Talk to Human" বাটনে ক্লিক করুন অথবা লিখুন "মানুষের সাহায্য লাগবে"।';
}

export async function generateAiSupportReply(params: {
  message: string;
  history?: ChatHistoryTurn[];
  visitorName?: string;
  routeSummary?: string;
}): Promise<AiReplyResult> {
  const message = params.message.trim();

  if (detectHumanEscalationIntent(message)) {
    return {
      reply:
        'অবশ্যই, আমি আপনাকে এখনই আমাদের Admin ও Bus Counter Support টিমের সাথে যুক্ত করে দিচ্ছি এবং সাইটের ইমেইলে নোটিফিকেশন পাঠাচ্ছি।',
      escalateToHuman: true,
      provider: 'fallback',
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return {
      reply: buildFallbackReply(message, params.routeSummary),
      escalateToHuman: false,
      provider: 'fallback',
    };
  }

  const systemInstruction = `You are the official 24/7 AI Customer Support Assistant for DeshLine Paribahan, an intercity bus ticket booking and counter management platform in Bangladesh.
Language rule: Always reply in the exact language the passenger uses (Bangla, Banglish/Romanized Bengali, or English). Be polite, concise, clear, and helpful.

Key Platform Facts:
- Brand: DeshLine Paribahan Ltd. Head Office: 148 Mirpur Road, Kalyanpur, Dhaka 1207. Hotline: +880 1700-000999. Email: support@deshline.com.bd.
- Fleet Types: Scania AC Business Class (2+1), Double-Deck Royal Sleeper, and Hino Express (2+2 Non-AC).
- How to Book: Go to Home (/) or Search (/search), select origin, destination, and journey date -> pick a coach & seat on the real-time seat map (seats lock for 5 minutes during checkout) -> pay via SSLCommerz, aamarPay (bKash/Nagad/Cards), or buy in cash at an Authorized Counter -> receive QR E-Ticket PDF & PNR.
- Track / Verify Ticket: Visit /track and enter PNR, or open Passenger Portal (/passenger/bookings) to download E-Ticket PDF.
- Cancellation & Refund Policy:
  * More than 24 hours before departure: 85% refund.
  * 12 to 24 hours before departure: 50% refund.
  * Under 12 hours before departure: 0% refund.
  Passengers can request cancellation/refund from /passenger/bookings or /passenger/payments.
- Active Routes Summary: ${params.routeSummary || 'Dhaka, Chattogram, Cox’s Bazar, Sylhet, Rajshahi, Khulna, Rangpur, Barishal'}.

Escalation Rule:
If the passenger asks to speak with a human, counter staff, admin, or customer care agent, OR has a complex complaint/payment failure that requires manual verification, include the exact token [ESCALATE_HUMAN] at the end of your helpful short message.`;

  const historyLines = (params.history || [])
    .slice(-10)
    .map((turn) => `${turn.senderRole.toUpperCase()}: ${turn.text}`)
    .join('\n');

  const prompt = [
    params.visitorName ? `Passenger Name: ${params.visitorName}` : '',
    historyLines ? `Recent Conversation:\n${historyLines}` : '',
    `Current Passenger Message: ${message}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.4,
        maxOutputTokens: 600,
      },
    });

    const rawText = (response.text || '').trim();
    if (!rawText) {
      return {
        reply: buildFallbackReply(message, params.routeSummary),
        escalateToHuman: false,
        provider: 'fallback',
      };
    }

    const shouldEscalate = rawText.includes('[ESCALATE_HUMAN]');
    const cleanReply = rawText.replace(/\[ESCALATE_HUMAN\]/g, '').trim();
    return {
      reply: cleanReply || buildFallbackReply(message, params.routeSummary),
      escalateToHuman: shouldEscalate,
      provider: 'gemini',
    };
  } catch (err) {
    console.error('Gemini AI chat error:', err);
    return {
      reply: buildFallbackReply(message, params.routeSummary),
      escalateToHuman: false,
      provider: 'fallback',
    };
  }
}

export interface HumanNotificationPayload {
  sessionId: string;
  visitorName: string;
  visitorEmail?: string;
  visitorPhone?: string;
  lastMessage: string;
  transcript?: Array<{ senderRole: string; senderName: string; text: string }>;
}

export interface HumanNotificationResult {
  notified: boolean;
  channel: 'smtp' | 'resend' | 'console_log';
  recipient: string;
  note: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function sendHumanSupportEmailNotification(
  payload: HumanNotificationPayload
): Promise<HumanNotificationResult> {
  const recipient =
    process.env.SUPPORT_NOTIFY_EMAIL ||
    process.env.SMTP_USER ||
    'support@deshline.com.bd';
  const appUrl =
    process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
      ? process.env.APP_URL.replace(/\/$/, '')
      : 'http://localhost:3000';
  const dashboardUrl = `${appUrl}/admin/live-chat?session=${encodeURIComponent(payload.sessionId)}`;

  const subject = `[DeshLine Live Chat] Human Support Requested by ${payload.visitorName}`;

  const transcriptLines = (payload.transcript || [])
    .slice(-10)
    .map((t) => `[${t.senderRole}] ${t.senderName}: ${t.text}`)
    .join('\n');

  const textBody = [
    'DeshLine Paribahan - Live Chat Human Handoff Alert',
    '--------------------------------------------------',
    `Passenger Name: ${payload.visitorName}`,
    `Phone: ${payload.visitorPhone || 'Not provided'}`,
    `Email: ${payload.visitorEmail || 'Not provided'}`,
    `Session ID: ${payload.sessionId}`,
    `Latest Message: ${payload.lastMessage}`,
    '',
    `Open Live Chat Dashboard (Admin & Counter Staff): ${dashboardUrl}`,
    '',
    transcriptLines ? `Recent Transcript:\n${transcriptLines}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const htmlBody = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#0B1F3A;color:#ffffff;padding:18px 24px;">
        <h2 style="margin:0;font-size:18px;">DeshLine Live Chat — Human Support Requested</h2>
        <p style="margin:4px 0 0;font-size:12px;color:#cbd5e1;">Visible to Admin &amp; Authorized Counter Staff only</p>
      </div>
      <div style="padding:20px 24px;color:#0f172a;font-size:14px;line-height:1.6;">
        <p><strong>Passenger:</strong> ${escapeHtml(payload.visitorName)}</p>
        <p><strong>Phone:</strong> ${escapeHtml(payload.visitorPhone || 'Not provided')}</p>
        <p><strong>Email:</strong> ${escapeHtml(payload.visitorEmail || 'Not provided')}</p>
        <p><strong>Latest Message:</strong><br/>
          <span style="display:inline-block;margin-top:4px;padding:10px 12px;background:#fff7ed;border-left:3px solid #ea580c;border-radius:6px;">
            ${escapeHtml(payload.lastMessage)}
          </span>
        </p>
        ${
          transcriptLines
            ? `<pre style="background:#f8fafc;padding:12px;border-radius:8px;font-size:12px;white-space:pre-wrap;border:1px solid #e2e8f0;">${escapeHtml(transcriptLines)}</pre>`
            : ''
        }
        <p style="margin-top:20px;">
          <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">
            Reply in Live Chat Dashboard
          </a>
        </p>
      </div>
    </div>
  `;

  // 1. Try SMTP via nodemailer if configured
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const smtpHost = process.env.SMTP_HOST || (smtpUser?.includes('@gmail.com') ? 'smtp.gmail.com' : '');

  if (smtpHost && smtpUser && smtpPass) {
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: smtpUser, pass: smtpPass },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || `"DeshLine Support" <${smtpUser}>`,
        to: recipient,
        subject,
        text: textBody,
        html: htmlBody,
      });

      return {
        notified: true,
        channel: 'smtp',
        recipient,
        note: `Email notification sent via SMTP to ${recipient}`,
      };
    } catch (err) {
      console.error('SMTP email notification failed:', err);
    }
  }

  // 2. Try Resend REST API if configured
  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    try {
      const resp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.SMTP_FROM || 'DeshLine Support <onboarding@resend.dev>',
          to: [recipient],
          subject,
          html: htmlBody,
          text: textBody,
        }),
      });
      if (resp.ok) {
        return {
          notified: true,
          channel: 'resend',
          recipient,
          note: `Email notification sent via Resend to ${recipient}`,
        };
      }
      console.error('Resend API returned status:', resp.status);
    } catch (err) {
      console.error('Resend email notification failed:', err);
    }
  }

  // 3. Always log cleanly if SMTP/Resend env variables are not configured yet
  console.info('[LIVE CHAT HUMAN NOTIFICATION - EMAIL PREVIEW]', {
    to: recipient,
    subject,
    dashboardUrl,
    visitorName: payload.visitorName,
    lastMessage: payload.lastMessage,
  });

  return {
    notified: false,
    channel: 'console_log',
    recipient,
    note: 'Email transport (SMTP or RESEND_API_KEY) not configured in .env; logged on server and alerted in Admin/Counter dashboard.',
  };
}

const nodemailer = require('nodemailer');
const dns = require('dns');
console.log('=== SEND EMAIL FILE LOADED ===');
console.log('=== VERSION 1 ===');


dns.setDefaultResultOrder('ipv4first');

const RESEND_API_URL = 'https://api.resend.com/emails';
const EMAIL_RETRY_ATTEMPTS = Math.max(Number(process.env.EMAIL_RETRY_ATTEMPTS || 3), 1);
const EMAIL_RETRY_BASE_DELAY_MS = Math.max(Number(process.env.EMAIL_RETRY_BASE_DELAY_MS || 750), 0);
const RESEND_TIMEOUT_MS = Math.max(Number(process.env.RESEND_TIMEOUT_MS || 15000), 1000);
const SMTP_FORCE_IPV4 = String(process.env.SMTP_FORCE_IPV4 || 'true').toLowerCase() !== 'false';
const SMTP_DNS_TIMEOUT_MS = Math.max(Number(process.env.SMTP_DNS_TIMEOUT_MS || 5000), 1000);

const smtpLookup = (hostname, options, callback) => {
  const lookupOptions = {
    ...options,
    family: SMTP_FORCE_IPV4 ? 4 : options?.family,
    all: false,
    
  };

  console.log('[email:smtp-lookup] resolving SMTP host', {
    hostname,
    requestedFamily: lookupOptions.family || 'any',
    ipv4Forced: SMTP_FORCE_IPV4,
    nodeDefaultResultOrder: 'ipv4first',
  });

  dns.lookup(hostname, lookupOptions, (error, address, family) => {
    if (error) {
      console.error('[email:smtp-lookup] SMTP host resolution failed', {
        hostname,
        requestedFamily: lookupOptions.family || 'any',
        message: error.message,
        code: error.code,
      });
      return callback(error);
    }
    console.log('[email:smtp-lookup] SMTP host resolved', {
      hostname,
      address,
      family: family === 4 ? 'IPv4' : 'IPv6',
      ipv4Forced: SMTP_FORCE_IPV4,
    });

    return callback(null, address, family);
  });
  console.log('[email:smtp-lookup] CALLED', {
  hostname,
  options,
});
};

const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true'
    || Number(process.env.SMTP_PORT || 587) === 465,
  requireTLS: Number(process.env.SMTP_PORT || 587) !== 465,
  family: SMTP_FORCE_IPV4 ? 4 : undefined,
  lookup: smtpLookup,
  dnsTimeout: SMTP_DNS_TIMEOUT_MS,
  pool: true,
  maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 3),
  maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 50),
  connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
};
const createEmailTransporter = (overrides = {}) => nodemailer.createTransport({
  ...emailConfig,
  ...overrides,
});

const transporter = createEmailTransporter();
console.log('TRANSPORT CONFIG', {
  host: emailConfig.host,
  port: emailConfig.port,
  family: emailConfig.family,
  hasLookup: typeof emailConfig.lookup === 'function',
});
const escapeHtml = value => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const money = value => `BDT ${Number(value || 0).toFixed(2)}`;
const configuredSenderEmail = String(process.env.EMAIL_FROM || '').trim();
const senderEmail = configuredSenderEmail && configuredSenderEmail !== 'noreply@yourapp.com'
  ? configuredSenderEmail
  : process.env.EMAIL_USER;
const sender = `"MealMate" <${senderEmail}>`;
let smtpVerifyPromise = null;
const hasResendApiKey = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY !== 'kkkk');
const emailProvider = (process.env.EMAIL_PROVIDER || 'auto').toLowerCase();
const activeEmailProvider = emailProvider === 'resend' || (emailProvider === 'auto' && hasResendApiKey)
  ? 'resend'
  : 'smtp';

const isValidEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

const logEmailError = (label, error) => {
  console.error(`[email:${label}] delivery failure`, {
    message: error?.message || String(error),
    code: error?.code,
    command: error?.command,
    responseCode: error?.responseCode,
    response: error?.response,
    stack: error?.stack,
  });
};

const logProviderConfig = (label) => {
  console.log(`[email:${label}] provider config:`, {
    activeEmailProvider,
    requestedEmailProvider: emailProvider,
    hasResendApiKey,
    smtpHost: emailConfig.host,
    smtpPort: emailConfig.port,
    smtpSecure: emailConfig.secure,
    hasEmailUser: Boolean(process.env.EMAIL_USER),
    hasEmailPass: Boolean(process.env.EMAIL_PASS),
    hasEmailFrom: Boolean(process.env.EMAIL_FROM),
    senderDomain: senderEmail?.split('@')[1] || null,
  });
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const isTransientEmailError = (error) => {
  const code = String(error?.code || '').toUpperCase();
  const responseCode = Number(error?.responseCode || 0);

  const networkTemporary = [
    'ETIMEDOUT',
    'ECONNECTION',
    'ECONNRESET',
    'ECONNREFUSED',
    'EAI_AGAIN',
    'ESOCKET',
    'ENOTFOUND',
    'RESEND_TIMEOUT',
  ].includes(code);
  const smtpTemporary = responseCode === 421 || responseCode === 450 || responseCode === 451 || responseCode === 452;
  const resendTemporary = code === 'RESEND_SEND_FAILED' && responseCode >= 500;

  return networkTemporary || smtpTemporary || resendTemporary;
};

const withEmailRetries = async (label, operation) => {
  let lastError = null;

  for (let attempt = 1; attempt <= EMAIL_RETRY_ATTEMPTS; attempt += 1) {
    try {
      console.log(`[email:${label}] attempt ${attempt}/${EMAIL_RETRY_ATTEMPTS} started`);
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      logEmailError(label, error);

      if (attempt >= EMAIL_RETRY_ATTEMPTS || !isTransientEmailError(error)) {
        throw error;
      }

      const delay = EMAIL_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
      if (delay > 0) await wait(delay);
    }
  }

  throw lastError;
};

const verifySmtpConnection = async (label) => {
dns.lookup('smtp.gmail.com', { all: true }, (err, addresses) => {

  console.log('GMAIL DNS RESULTS', err, addresses);

});
dns.lookup('smtp.gmail.com', { family: 4 }, (err, address) => {

  console.log('GMAIL IPV4', err, address);

});

  logProviderConfig(label);

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('EMAIL_USER and EMAIL_PASS must be configured before sending email');
  }

  if (!isValidEmail(senderEmail)) {
    throw new Error(`Invalid sender email configured: ${senderEmail || '(empty)'}`);
  }

  if (!smtpVerifyPromise) {
    console.log(`[email:${label}] SMTP connection verify started`);
    smtpVerifyPromise = transporter.verify()
      .then(result => {
        console.log(`[email:${label}] SMTP connection verify succeeded:`, result);
        return result;
      })
      .catch(error => {
        smtpVerifyPromise = null;
        logEmailError(label, error);
        throw error;
      });
  } else {
    console.log(`[email:${label}] SMTP connection verify using cached successful connection`);
  }

  return smtpVerifyPromise;
};

const ensureSmtpConfigured = (label) => {
  logProviderConfig(label);

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('EMAIL_USER and EMAIL_PASS must be configured before sending email');
  }

  if (!isValidEmail(senderEmail)) {
    throw new Error(`Invalid sender email configured: ${senderEmail || '(empty)'}`);
  }
};

const verifyEmailTransporter = async () => verifySmtpConnection('startup');

const verifyEmailProvider = async () => {
  logProviderConfig('startup');

  if (activeEmailProvider === 'resend') {
    if (!hasResendApiKey) {
      throw new Error('RESEND_API_KEY must be configured when EMAIL_PROVIDER is resend');
    }
    if (!configuredSenderEmail || configuredSenderEmail === 'noreply@yourapp.com') {
      throw new Error('EMAIL_FROM must be set to a verified sender address when using Resend');
    }
    if (!isValidEmail(senderEmail)) {
      throw new Error(`Invalid sender email configured: ${senderEmail || '(empty)'}`);
    }
    console.log('[email:startup] Resend HTTPS provider configured');
    return true;
  }

  return verifySmtpConnection('startup');
};

const normalizeRecipients = to => Array.isArray(to) ? to : [to];

const toResendAttachments = attachments => (attachments || []).map(attachment => ({
  filename: attachment.filename,
  content: Buffer.isBuffer(attachment.content)
    ? attachment.content.toString('base64')
    : attachment.content,
}));

const sendWithResend = async (label, mailOptions) => {
  if (!hasResendApiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  if (!configuredSenderEmail || configuredSenderEmail === 'noreply@yourapp.com') {
    throw new Error('EMAIL_FROM must be set to a verified sender address when using Resend');
  }

  console.log(`[email:${label}] Resend HTTPS send request started`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESEND_TIMEOUT_MS);

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: normalizeRecipients(mailOptions.to),
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      attachments: toResendAttachments(mailOptions.attachments),
    }),
    signal: controller.signal,
  }).catch(error => {
    if (error?.name === 'AbortError') {
      throw Object.assign(new Error(`Resend request timed out after ${RESEND_TIMEOUT_MS}ms`), {
        code: 'RESEND_TIMEOUT',
      });
    }
    throw error;
  }).finally(() => clearTimeout(timeout));

  const data = await response.json().catch(() => null);

  console.log(`[email:${label}] Resend HTTPS response:`, {
    status: response.status,
    ok: response.ok,
    data,
  });

  if (!response.ok) {
    const message = data?.message || data?.error || `Resend send failed (${response.status})`;
    const error = Object.assign(new Error(message), {
      response: data,
      responseCode: response.status,
      code: 'RESEND_SEND_FAILED',
    });
    throw error;
  }

  return {
    accepted: normalizeRecipients(mailOptions.to),
    rejected: [],
    response: `Resend accepted email ${data?.id || ''}`.trim(),
    messageId: data?.id,
    envelope: {
      from: senderEmail,
      to: normalizeRecipients(mailOptions.to),
    },
    provider: 'resend',
  };
};

const sendMailWithLogging = async (label, mailOptions) => {
  console.log(`[email:${label}] recipient email:`, mailOptions.to);
  console.log(`[email:${label}] email subject:`, mailOptions.subject);
  console.log(`[email:${label}] email body generation status:`, {
    hasText: Boolean(mailOptions.text),
    textLength: mailOptions.text ? mailOptions.text.length : 0,
    hasHtml: Boolean(mailOptions.html),
    htmlLength: mailOptions.html ? mailOptions.html.length : 0,
    attachmentCount: Array.isArray(mailOptions.attachments) ? mailOptions.attachments.length : 0,
  });

  if (!isValidEmail(mailOptions.to)) {
    throw new Error(`Invalid recipient email: ${mailOptions.to || '(empty)'}`);
  }

  if (activeEmailProvider === 'resend') {
    return withEmailRetries(label, () => sendWithResend(label, mailOptions));
  }

  ensureSmtpConfigured(label);

  return withEmailRetries(label, async () => {
    console.log(`[email:${label}] sendMail request started`);
    const info = await transporter.sendMail(mailOptions);
    console.log(`[email:${label}] sendMail response:`, {
      accepted: info.accepted,
      rejected: info.rejected,
      pending: info.pending,
      response: info.response,
      messageId: info.messageId,
      envelope: info.envelope,
    });
    return info;
  });
};

const sendOTP = async (to, otp, options = {}) => {
  const isReset = options.purpose === 'password-reset';
  const title = isReset ? 'Reset your password' : 'Verify your email';
  const intro = isReset
    ? 'Use this secure code to continue resetting your MealMate password.'
    : 'Use this secure code to finish creating your MealMate account.';

  return sendMailWithLogging('otp', {
    from: sender,
    to,
    subject: `${otp} is your MealMate security code`,
    text: `${title}\n\nYour MealMate code is ${otp}. It expires in 10 minutes. Do not share this code.`,
    html: `
      <div style="margin:0;background:#f1f5f9;padding:36px 12px;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:520px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.10);">
          <div style="padding:26px 32px;background:linear-gradient(135deg,#0f172a,#312e81);">
            <div style="color:#ffffff;font-size:22px;font-weight:800;">MealMate</div>
            <div style="color:#c4b5fd;font-size:12px;margin-top:4px;letter-spacing:1.2px;">SECURE ACCOUNT ACCESS</div>
          </div>
          <div style="padding:34px 32px;">
            <h1 style="font-size:24px;margin:0 0 12px;color:#0f172a;">${title}</h1>
            <p style="font-size:15px;line-height:1.7;color:#475569;margin:0;">${intro}</p>
            <div style="margin:28px 0;padding:24px;text-align:center;border-radius:16px;background:#eef2ff;border:1px solid #c7d2fe;">
              <div style="font-size:11px;font-weight:700;color:#6366f1;letter-spacing:1.6px;">YOUR ONE-TIME CODE</div>
              <div style="font-size:40px;line-height:1.2;font-weight:800;letter-spacing:10px;color:#312e81;margin-top:10px;">${escapeHtml(otp)}</div>
            </div>
            <div style="padding:14px 16px;border-radius:12px;background:#fff7ed;color:#9a3412;font-size:13px;line-height:1.6;">
              This code expires in 10 minutes. MealMate will never ask you to share it.
            </div>
            <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:24px 0 0;">If you did not request this code, you can safely ignore this email.</p>
          </div>
        </div>
      </div>`,
  });
};

const sendReportEmail = async ({ to, firstName, month, pdfBuffer }) => {
  return sendMailWithLogging('report', {
    from: sender,
    to,
    subject: `Your MealMate report for ${month}`,
    text: `Hi ${firstName}, your MealMate report for ${month} is attached.`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
        <h2 style="color:#312e81;margin:0 0 14px;">Monthly report</h2>
        <p>Hi <strong>${escapeHtml(firstName)}</strong>,</p>
        <p style="color:#475569;line-height:1.7;">Your meal expense report for <strong>${escapeHtml(month)}</strong> is attached.</p>
        <p style="color:#94a3b8;font-size:12px;">Generated securely by MealMate.</p>
      </div>`,
    attachments: [{
      filename: `MealMate_Report_${String(month).replace(/[^a-z0-9]+/gi, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
};

const sendBillEmail = async ({
  to,
  firstName,
  month,
  totalBill,
  perMeal,
  userMeals,
  share,
  breakdown,
  costSummary,
  pdfBuffer,
  homeName,
}) => {
  const {
    eggPrice = 0,
    perEgg = 0,
    consumedCost = 0,
    remainingEggCost = 0,
    other = 0,
  } = costSummary || {};

  const rows = (breakdown || []).map(member => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(member.name)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;color:#475569;">${Number(member.meals || 0)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;color:#0f172a;">${money(member.share)}</td>
    </tr>`).join('');

  return sendMailWithLogging('bill', {
    from: sender,
    to,
    subject: `Your MealMate bill for ${month}: ${money(share)}`,
    text: `Hi ${firstName}, your MealMate bill for ${month} is ${money(share)}. Your detailed PDF statement is attached.`,
    html: `
      <div style="margin:0;background:#f1f5f9;padding:36px 12px;font-family:Arial,sans-serif;color:#0f172a;">
        <div style="max-width:620px;margin:auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.10);">
          <div style="padding:28px 34px;background:linear-gradient(135deg,#0f172a,#312e81);">
            <div style="color:#ffffff;font-size:24px;font-weight:800;">MealMate</div>
            <div style="color:#c4b5fd;font-size:12px;margin-top:5px;letter-spacing:1.2px;">MONTHLY MEAL STATEMENT</div>
          </div>
          <div style="padding:32px 34px;">
            <p style="font-size:16px;color:#334155;margin:0 0 8px;">Hi <strong>${escapeHtml(firstName)}</strong>,</p>
            <p style="font-size:14px;line-height:1.7;color:#64748b;margin:0;">Your statement for <strong>${escapeHtml(month)}</strong> is ready. A detailed PDF is attached for your records.</p>

            <div style="margin:24px 0;padding:22px;border-radius:16px;background:#eef2ff;border:1px solid #c7d2fe;">
              <div style="font-size:11px;font-weight:700;color:#6366f1;letter-spacing:1.4px;">YOUR AMOUNT DUE</div>
              <div style="font-size:34px;font-weight:800;color:#312e81;margin-top:7px;">${money(share)}</div>
              <div style="font-size:13px;color:#64748b;margin-top:8px;">${Number(userMeals || 0)} meals at ${money(perMeal)} per meal</div>
            </div>

            <h3 style="font-size:15px;margin:0 0 10px;color:#0f172a;">Cost summary</h3>
            <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;">
              <tr><td style="padding:7px 0;color:#64748b;">Egg purchases</td><td style="text-align:right;font-weight:600;">${money(eggPrice)}</td></tr>
              <tr><td style="padding:7px 0;color:#64748b;">Price per egg</td><td style="text-align:right;font-weight:600;">${money(perEgg)}</td></tr>
              <tr><td style="padding:7px 0;color:#64748b;">Consumed egg cost</td><td style="text-align:right;font-weight:600;">${money(consumedCost)}</td></tr>
              <tr><td style="padding:7px 0;color:#64748b;">Remaining egg cost</td><td style="text-align:right;font-weight:600;">${money(remainingEggCost)}</td></tr>
              <tr><td style="padding:7px 0;color:#64748b;">Other cost</td><td style="text-align:right;font-weight:600;">${money(other)}</td></tr>
              <tr><td style="padding:11px 0;border-top:2px solid #c7d2fe;font-weight:800;">Home total</td><td style="padding:11px 0;border-top:2px solid #c7d2fe;text-align:right;font-weight:800;color:#4f46e5;">${money(totalBill)}</td></tr>
            </table>

            <h3 style="font-size:15px;margin:0 0 10px;color:#0f172a;">Member breakdown</h3>
            <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;">
              <thead><tr style="background:#f8fafc;">
                <th style="padding:10px 12px;text-align:left;color:#64748b;">Member</th>
                <th style="padding:10px 12px;text-align:center;color:#64748b;">Meals</th>
                <th style="padding:10px 12px;text-align:right;color:#64748b;">Amount</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table>

            <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:24px 0 0;">Home: ${escapeHtml(homeName || 'MealMate Home')}. This email was generated automatically by MealMate.</p>
          </div>
        </div>
      </div>`,
    attachments: pdfBuffer ? [{
      filename: `MealMate_Bill_${String(month).replace(/[^a-z0-9]+/gi, '_')}.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf',
    }] : [],
  });
};

module.exports = { sendOTP, sendReportEmail, sendBillEmail, verifyEmailTransporter, verifyEmailProvider };

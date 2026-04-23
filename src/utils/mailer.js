const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS   // Use Gmail App Password (not your real password)
  }
});

// ─────────────────────────────────────────
// 🔐 Send OTP
// ─────────────────────────────────────────
const sendOTP = async (to, otp) => {
  await transporter.sendMail({
    from: `"MealApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: '🔐 Your MealApp Verification Code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;
                  padding:32px;border:1px solid #e5e7eb;border-radius:10px;">
        <h2 style="margin:0 0 8px;color:#111827;">Verify your email</h2>
        <p style="color:#6b7280;margin:0 0 24px;">
          Use the code below to complete your registration. It expires in <strong>10 minutes</strong>.
        </p>
        <div style="letter-spacing:12px;font-size:36px;font-weight:700;
                    color:#4f46e5;text-align:center;padding:16px;
                    background:#f5f3ff;border-radius:8px;">
          ${otp}
        </div>
        <p style="color:#9ca3af;font-size:13px;margin-top:24px;">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `
  });
};

// ─────────────────────────────────────────
// 📊 Send Monthly Report PDF
// ─────────────────────────────────────────
const sendReportEmail = async ({ to, firstName, month, pdfBuffer }) => {
  await transporter.sendMail({
    from: `"MealApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: `📊 Your Monthly Report — ${month}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:32px;">
        <h2 style="color:#111827;">Hi ${firstName} 👋</h2>
        <p style="color:#374151;">
          Your meal expense report for <strong>${month}</strong> is ready.
          Find the PDF attached below.
        </p>
        <p style="color:#9ca3af;font-size:13px;margin-top:32px;">— MealApp Team</p>
      </div>
    `,
    attachments: [
      {
        filename: `mealapp-report-${month}.pdf`,
        content:  pdfBuffer,
        contentType: 'application/pdf'
      }
    ]
  });
};

module.exports = { sendOTP, sendReportEmail };
// utils/sendEmail.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Send OTP ──────────────────────────────────────────────
const sendOTP = async (to, otp) => {
  await transporter.sendMail({
    from: `"MealApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your MealApp Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                  border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#4F46E5;margin-bottom:8px;">MealApp</h2>
        <p>Your one-time verification code is:</p>
        <div style="font-size:36px;font-weight:700;letter-spacing:8px;
                    color:#111827;margin:24px 0;">${otp}</div>
        <p style="color:#6b7280;font-size:13px;">Expires in 10 minutes. Do not share this code.</p>
      </div>`,
  });
};

// ── Send monthly report PDF ───────────────────────────────
const sendReportEmail = async ({ to, firstName, month, pdfBuffer }) => {
  await transporter.sendMail({
    from: `"MealApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: `MealApp – Your Report for ${month}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:32px;
                  border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#4F46E5;">Monthly Report</h2>
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Please find your meal expense report for <strong>${month}</strong> attached.</p>
        <p style="color:#6b7280;font-size:13px;">— The MealApp Team</p>
      </div>`,
    attachments: [
      {
        filename: `MealApp_Report_${month.replace(' ', '_')}.pdf`,
        content:  pdfBuffer,
        contentType: 'application/pdf',
      },
    ],
  });
};

// ── Send bill email ───────────────────────────────────────
/**
 * @param {Object} opts
 * @param {string}   opts.to
 * @param {string}   opts.firstName
 * @param {string}   opts.month
 * @param {number}   opts.totalBill       – total home bill
 * @param {number}   opts.perMeal         – cost per meal
 * @param {number}   opts.userMeals       – this user's meal count (incl. penalties)
 * @param {number}   opts.share           – this user's amount due
 * @param {Array}    opts.breakdown        – [{ name, meals, share }]
 * @param {Object}   opts.costSummary     – { eggPrice, perEgg, consumedCost, remainingEggCost, other }
 */
const sendBillEmail = async ({
  to, firstName, month,
  totalBill, perMeal, userMeals, share,
  breakdown, costSummary,
}) => {
  const { eggPrice, perEgg, consumedCost, remainingEggCost, other } = costSummary;

  const rows = breakdown.map(m => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 12px;">${m.name}</td>
      <td style="padding:8px 12px;text-align:center;">${m.meals}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600;">৳${m.share.toFixed(2)}</td>
    </tr>`).join('');

  await transporter.sendMail({
    from: `"MealApp" <${process.env.EMAIL_USER}>`,
    to,
    subject: `MealApp – Your Bill for ${month}`,
    html: `
    <div style="font-family:sans-serif;max-width:580px;margin:auto;">

      <!-- Header -->
      <div style="background:#4F46E5;padding:28px 32px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;margin:0;font-size:22px;">MealApp</h1>
        <p style="color:#c7d2fe;margin:4px 0 0;">Monthly Bill · ${month}</p>
      </div>

      <!-- Body -->
      <div style="padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Your bill for <strong>${month}</strong> is ready.</p>

        <!-- Your amount -->
        <div style="background:#f5f3ff;border-radius:10px;padding:20px 24px;margin:20px 0;
                    display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="color:#6b7280;font-size:13px;">YOUR AMOUNT DUE</div>
            <div style="color:#4F46E5;font-size:32px;font-weight:700;">৳${share.toFixed(2)}</div>
          </div>
          <div style="text-align:right;">
            <div style="color:#6b7280;font-size:13px;">Your meals</div>
            <div style="font-size:22px;font-weight:600;">${userMeals}</div>
            <div style="color:#6b7280;font-size:12px;">৳${perMeal.toFixed(2)} / meal</div>
          </div>
        </div>

        <!-- Cost breakdown -->
        <h3 style="color:#111827;margin-bottom:8px;">Cost Breakdown</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
          <tr><td style="padding:6px 0;color:#6b7280;">Total Egg Price</td>
              <td style="text-align:right;">৳${eggPrice.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Per Egg</td>
              <td style="text-align:right;">৳${perEgg.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Consumed Egg Cost</td>
              <td style="text-align:right;">৳${consumedCost.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Remaining Egg Cost</td>
              <td style="text-align:right;">৳${remainingEggCost.toFixed(2)}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280;">Other Cost</td>
              <td style="text-align:right;">৳${other.toFixed(2)}</td></tr>
          <tr style="border-top:2px solid #4F46E5;">
            <td style="padding:10px 0;font-weight:700;">Total Bill</td>
            <td style="text-align:right;font-weight:700;color:#4F46E5;">৳${totalBill.toFixed(2)}</td>
          </tr>
        </table>

        <!-- All members -->
        <h3 style="color:#111827;margin-bottom:8px;">All Members</h3>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <thead>
            <tr style="background:#f9fafb;">
              <th style="padding:10px 12px;text-align:left;color:#6b7280;">Name</th>
              <th style="padding:10px 12px;text-align:center;color:#6b7280;">Meals</th>
              <th style="padding:10px 12px;text-align:right;color:#6b7280;">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <p style="color:#6b7280;font-size:12px;margin-top:24px;">
          — The MealApp Team
        </p>
      </div>
    </div>`,
  });
};

module.exports = { sendOTP, sendReportEmail, sendBillEmail };
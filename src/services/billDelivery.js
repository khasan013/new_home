const { sendBillEmail } = require('../utils/sendEmail');
const { generateBillPDF } = require('../utils/billPdf');

async function deliverBillEmails({
  recipients,
  homeName,
  month,
  totalBill,
  totalMeals,
  perMeal,
  breakdown,
  costSummary,
}) {
  const jobs = recipients
    .filter(recipient => recipient.email)
    .map(async recipient => {
      const pdfBuffer = await generateBillPDF({
        homeName,
        month,
        memberName: recipient.name,
        userMeals: recipient.meals,
        userEggs: recipient.eggs,
        share: recipient.share,
        totalBill,
        totalMeals,
        perMeal,
        breakdown,
        costSummary,
      });

      await sendBillEmail({
        to: recipient.email,
        firstName: recipient.firstName || recipient.name?.split(' ')[0] || 'there',
        month,
        totalBill,
        perMeal,
        userMeals: recipient.meals,
        share: recipient.share,
        breakdown,
        costSummary,
        pdfBuffer,
        homeName,
      });

      return recipient.email;
    });

  const results = await Promise.allSettled(jobs);
  const failures = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);

  failures.forEach(error => {
    console.error('Bill email delivery failed:', error?.message || error);
  });

  return {
    sent: results.length - failures.length,
    failed: failures.length,
  };
}

module.exports = { deliverBillEmails };

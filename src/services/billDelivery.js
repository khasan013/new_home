const { sendBillEmail } = require('../utils/sendEmail');
const { generateBillPDF } = require('../utils/billPdf');

const BILL_EMAIL_MAX_ATTEMPTS = Math.max(Number(process.env.BILL_EMAIL_MAX_ATTEMPTS || 3), 1);
const BILL_EMAIL_RETRY_DELAY_MS = Math.max(Number(process.env.BILL_EMAIL_RETRY_DELAY_MS || 1500), 0);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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
  const validRecipients = [];
  const skippedRecipients = [];

  (recipients || []).forEach(recipient => {
    const email = String(recipient.email || '').trim();
    if (!email) {
      skippedRecipients.push({ recipient, reason: 'Missing recipient email' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      skippedRecipients.push({ recipient, reason: `Invalid recipient email: ${email}` });
      return;
    }

    validRecipients.push({ ...recipient, email });
  });

  console.log('Bill email delivery started:', {
    homeName,
    month,
    recipientCount: recipients?.length || 0,
    validRecipientCount: validRecipients.length,
    skippedRecipientCount: skippedRecipients.length,
    recipients: validRecipients.map(recipient => recipient.email),
  });

  skippedRecipients.forEach(({ recipient, reason }) => {
    console.error('Bill email recipient skipped:', {
      reason,
      name: recipient?.name,
      email: recipient?.email,
      userId: recipient?.userId,
    });
  });

  const sendToRecipient = async (recipient) => {
    try {
      console.log('Bill email PDF generation started:', {
        email: recipient.email,
        name: recipient.name,
        month,
        share: recipient.share,
      });

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

      console.log('Bill email PDF generation completed:', {
        email: recipient.email,
        pdfBytes: pdfBuffer?.length || 0,
      });

      let info = null;
      let lastError = null;

      for (let attempt = 1; attempt <= BILL_EMAIL_MAX_ATTEMPTS; attempt += 1) {
        try {
          console.log('Bill email send attempt started:', {
            email: recipient.email,
            attempt,
            maxAttempts: BILL_EMAIL_MAX_ATTEMPTS,
          });

          info = await sendBillEmail({
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

          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          console.error('Bill email send attempt failed:', {
            email: recipient.email,
            attempt,
            maxAttempts: BILL_EMAIL_MAX_ATTEMPTS,
            message: error?.message || error,
            stack: error?.stack || error,
          });

          if (attempt < BILL_EMAIL_MAX_ATTEMPTS && BILL_EMAIL_RETRY_DELAY_MS > 0) {
            await wait(BILL_EMAIL_RETRY_DELAY_MS);
          }
        }
      }

      if (lastError) {
        throw lastError;
      }

      console.log('Bill email send completed:', {
        email: recipient.email,
        accepted: info?.accepted,
        rejected: info?.rejected,
        response: info?.response,
        messageId: info?.messageId,
      });

      return { status: 'fulfilled', value: recipient.email };
    } catch (error) {
      return { status: 'rejected', reason: error };
    }
  };

  const results = await Promise.all(validRecipients.map(sendToRecipient));

  const failures = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);

  failures.forEach(error => {
    console.error('Bill email delivery failed:', error?.message || error);
    console.error('Bill email delivery failed stack:', error?.stack || error);
  });

  const summary = {
    sent: results.length - failures.length,
    failed: failures.length + skippedRecipients.length,
  };

  console.log('Bill email delivery finished:', summary);

  return summary;
}

module.exports = { deliverBillEmails };

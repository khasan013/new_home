const { sendBillEmail } = require('../utils/sendEmail');
const { generateBillPDF } = require('../utils/billPdf');

const BILL_EMAIL_CONCURRENCY = Math.max(Number(process.env.BILL_EMAIL_CONCURRENCY || 2), 1);

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });

  await Promise.all(runners);
  return results;
}

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
        waterShare: recipient.waterShare || 0,
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

      const info = await sendBillEmail({
        to: recipient.email,
        firstName: recipient.firstName || recipient.name?.split(' ')[0] || 'there',
        month,
        totalBill,
        perMeal,
        userMeals: recipient.meals,
        share: recipient.share,
        waterShare: recipient.waterShare || 0,
        breakdown,
        costSummary,
        pdfBuffer,
        homeName,
      });

      console.log('Bill email send completed:', {
        email: recipient.email,
        accepted: info?.accepted,
        rejected: info?.rejected,
        response: info?.response,
        messageId: info?.messageId,
      });

      const accepted = (info?.accepted || []).some(address =>
        String(address).trim().toLowerCase() === recipient.email.toLowerCase()
      );
      const rejected = (info?.rejected || []).some(address =>
        String(address).trim().toLowerCase() === recipient.email.toLowerCase()
      );
      if (rejected || !accepted) {
        throw new Error(rejected
          ? `Mail provider rejected ${recipient.email}`
          : `Mail provider did not confirm acceptance for ${recipient.email}`);
      }

      return { status: 'fulfilled', value: recipient.email };
    } catch (error) {
      return { status: 'rejected', email: recipient.email, reason: error };
    }
  };

  const results = await mapWithConcurrency(validRecipients, BILL_EMAIL_CONCURRENCY, sendToRecipient);

  const failures = results
    .filter(result => result.status === 'rejected')
    .map(result => ({
      email: result.email,
      reason: result.reason?.message || String(result.reason),
    }));

  failures.forEach(failure => {
    console.error('Bill email delivery failed:', failure);
  });

  const skipped = skippedRecipients.map(({ recipient, reason }) => ({
    email: String(recipient?.email || '').trim() || null,
    reason,
  }));

  const summary = {
    sent: results.length - failures.length,
    failed: failures.length + skippedRecipients.length,
    failures: [...failures, ...skipped],
  };

  console.log('Bill email delivery finished:', summary);

  return summary;
}

module.exports = { deliverBillEmails };

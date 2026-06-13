const PDFDocument = require('pdfkit');

const money = value => `BDT ${Number(value || 0).toFixed(2)}`;

function generateBillPDF(data) {
  return new Promise((resolve, reject) => {
    const {
      homeName = 'MealMate Home',
      month,
      memberName,
      userMeals,
      userEggs = 0,
      share,
      totalBill,
      totalMeals,
      perMeal,
      breakdown = [],
      costSummary = {},
    } = data;

    const doc = new PDFDocument({
      margin: 46,
      size: 'A4',
      info: {
        Title: `MealMate Bill - ${month}`,
        Author: 'MealMate',
        Subject: `Monthly meal bill for ${memberName}`,
      },
    });
    const chunks = [];
    const pageWidth = 595.28;
    const contentWidth = pageWidth - 92;
    const navy = '#0F172A';
    const indigo = '#6366F1';
    const violet = '#8B5CF6';
    const slate = '#64748B';
    const border = '#E2E8F0';
    const soft = '#F8FAFC';
    const white = '#FFFFFF';

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const drawHeader = () => {
      doc.rect(0, 0, pageWidth, 92).fill(navy);
      doc.fillColor(white).font('Helvetica-Bold').fontSize(24).text('MealMate', 46, 25);
      doc.fillColor('#C4B5FD').font('Helvetica').fontSize(10)
        .text('MONTHLY MEAL STATEMENT', 46, 57, { characterSpacing: 1.4 });
      doc.fillColor(white).font('Helvetica-Bold').fontSize(12)
        .text(month, pageWidth - 206, 31, { width: 160, align: 'right' });
      doc.fillColor('#CBD5E1').font('Helvetica').fontSize(9)
        .text(homeName, pageWidth - 246, 53, { width: 200, align: 'right' });
    };

    drawHeader();
    doc.y = 116;
    doc.fillColor(slate).font('Helvetica').fontSize(10).text('Prepared for');
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(18).text(memberName || 'Member');

    const amountY = doc.y + 18;
    doc.roundedRect(46, amountY, contentWidth, 96, 12).fillAndStroke('#EEF2FF', '#C7D2FE');
    doc.fillColor(slate).font('Helvetica-Bold').fontSize(9)
      .text('AMOUNT DUE', 66, amountY + 20, { characterSpacing: 1 });
    doc.fillColor(indigo).font('Helvetica-Bold').fontSize(27)
      .text(money(share), 66, amountY + 39, { width: 230 });
    doc.fillColor(slate).font('Helvetica').fontSize(9)
      .text('YOUR USAGE', 334, amountY + 20, { width: 190, align: 'right' });
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(14)
      .text(`${Number(userMeals || 0)} meals | ${Number(userEggs || 0)} eggs`,
        304, amountY + 39, { width: 220, align: 'right' });
    doc.fillColor(slate).font('Helvetica').fontSize(9)
      .text(`${money(perMeal)} per meal`, 304, amountY + 62, {
        width: 220,
        align: 'right',
      });

    doc.y = amountY + 122;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(14).text('Statement summary');
    const summaryY = doc.y + 10;
    const gap = 10;
    const cardWidth = (contentWidth - gap * 2) / 3;
    [
      ['Home total', money(totalBill)],
      ['Total meals', String(Number(totalMeals || 0))],
      ['Cost per meal', money(perMeal)],
    ].forEach(([label, value], index) => {
      const x = 46 + index * (cardWidth + gap);
      doc.roundedRect(x, summaryY, cardWidth, 62, 8).fillAndStroke(soft, border);
      doc.fillColor(slate).font('Helvetica').fontSize(8)
        .text(label.toUpperCase(), x + 12, summaryY + 13, { width: cardWidth - 24 });
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(12)
        .text(value, x + 12, summaryY + 31, { width: cardWidth - 24 });
    });

    doc.y = summaryY + 84;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(14).text('Cost details');
    const details = [
      ['Egg purchases', money(costSummary.eggPrice)],
      ['Price per egg', money(costSummary.perEgg)],
      ['Consumed egg cost', money(costSummary.consumedCost)],
      ['Remaining egg cost', money(costSummary.remainingEggCost)],
      ['Other household cost', money(costSummary.other)],
    ];
    const detailY = doc.y + 10;
    details.forEach(([label, value], index) => {
      const y = detailY + index * 24;
      if (index % 2 === 0) doc.rect(46, y, contentWidth, 24).fill(soft);
      doc.fillColor(slate).font('Helvetica').fontSize(9)
        .text(label, 58, y + 7, { width: 250 });
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(9)
        .text(value, 330, y + 7, { width: 202, align: 'right' });
    });

    doc.y = detailY + details.length * 24 + 24;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(14).text('Member breakdown');
    let tableY = doc.y + 10;

    const drawTableHeader = () => {
      doc.rect(46, tableY, contentWidth, 28).fill(violet);
      doc.fillColor(white).font('Helvetica-Bold').fontSize(9);
      doc.text('Member', 58, tableY + 9, { width: 215 });
      doc.text('Meals', 280, tableY + 9, { width: 58, align: 'right' });
      doc.text('Eggs', 348, tableY + 9, { width: 52, align: 'right' });
      doc.text('Amount', 410, tableY + 9, { width: 122, align: 'right' });
      tableY += 28;
    };

    drawTableHeader();
    breakdown.forEach((member, index) => {
      if (tableY + 28 > doc.page.height - 58) {
        doc.addPage();
        drawHeader();
        tableY = 116;
        drawTableHeader();
      }
      doc.rect(46, tableY, contentWidth, 28)
        .fillAndStroke(index % 2 === 0 ? white : soft, border);
      doc.fillColor(navy).font('Helvetica').fontSize(9);
      doc.text(member.name || 'Member', 58, tableY + 9, { width: 215 });
      doc.text(String(Number(member.meals || 0)), 280, tableY + 9, {
        width: 58,
        align: 'right',
      });
      doc.text(String(Number(member.eggs || 0)), 348, tableY + 9, {
        width: 52,
        align: 'right',
      });
      doc.font('Helvetica-Bold').text(money(member.share), 410, tableY + 9, {
        width: 122,
        align: 'right',
      });
      tableY += 28;
    });

    doc.fillColor(slate).font('Helvetica').fontSize(8)
      .text(
        `Generated securely by MealMate on ${new Date().toLocaleDateString('en-GB')}`,
        46,
        doc.page.height - 36,
        { width: contentWidth, align: 'center' }
      );
    doc.end();
  });
}

module.exports = { generateBillPDF };

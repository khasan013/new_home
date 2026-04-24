const cron = require('node-cron');
const Home    = require('../models/Home');
const User    = require('../models/User');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const { generateReportPDF } = require('../utils/pdfReport');
const { sendReportEmail }   = require('../utils/sendEmail');

/**
 * Builds and emails the monthly report for a single home.
 * @param {Object} home   - populated Home document
 * @param {Date}   from   - start of period
 * @param {Date}   to     - end of period
 * @param {string} month  - human label, e.g. "March 2025"
 */
const processHome = async (home, from, to, month) => {
  const meals    = await Meal.find({ homeId: home._id, date: { $gte: from, $lt: to } })
                             .populate('userId', 'firstName lastName email');
  const expenses = await Expense.find({ homeId: home._id, createdAt: { $gte: from, $lt: to } });

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMeals   = meals.reduce((s, m) => s + m.mealCount, 0);
  const perMeal      = totalMeals ? totalExpense / totalMeals : 0;

  // Build per-member breakdown map
  const memberMap = {};
  for (const meal of meals) {
    const uid  = meal.userId._id.toString();
    const name = `${meal.userId.firstName || ''} ${meal.userId.lastName || ''}`.trim()
                 || meal.userId.email;
    if (!memberMap[uid]) memberMap[uid] = { name, meals: 0, share: 0 };
    memberMap[uid].meals += meal.mealCount;
  }
  // Calculate fair share for each member
  Object.values(memberMap).forEach(m => {
    m.share = totalMeals ? (m.meals / totalMeals) * totalExpense : 0;
  });

  const memberBreakdown = Object.values(memberMap);

  // Generate PDF
  const pdfBuffer = await generateReportPDF({
    homeName: home.name,
    month,
    totalExpense,
    totalMeals,
    perMeal,
    memberBreakdown
  });

  // Email every verified member
  for (const member of home.members) {
    const user = await User.findById(member.user);
    if (!user || !user.isVerified) continue;

    await sendReportEmail({
      to:        user.email,
      firstName: user.firstName || 'there',
      month,
      pdfBuffer
    });

    console.log(`📧 Report sent to ${user.email} for home "${home.name}"`);
  }
};

/**
 * Fires on the 1st of every month at 08:00.
 * Processes the previous calendar month.
 */
cron.schedule('0 8 1 * *', async () => {
  console.log('⏰ Monthly report cron started...');

  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);  // 1st of last month
  const to   = new Date(now.getFullYear(), now.getMonth(),     1);  // 1st of this month
  const month = from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  try {
    const homes = await Home.find();
    for (const home of homes) {
      await processHome(home, from, to, month);
    }
    console.log(`✅ Monthly reports done for ${month}`);
  } catch (err) {
    console.error('❌ Monthly report cron failed:', err);
  }
});

console.log('📅 Monthly report cron registered (runs 1st of each month at 08:00)');
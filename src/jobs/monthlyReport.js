const cron = require('node-cron');
const Home    = require('../models/Home');
const User    = require('../models/User');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const { generateReportPDF } = require('../utils/pdfReport');
const { sendReportEmail }   = require('../utils/sendEmail');

const processHome = async (home, from, to, month) => {
  const meals    = await Meal.find({ homeId: home._id, date: { $gte: from, $lt: to } })
                             .populate('userId', 'firstName lastName email');
  const expenses = await Expense.find({ homeId: home._id, createdAt: { $gte: from, $lt: to } });

  const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
  const totalMeals   = meals.reduce((s, m) => s + m.mealCount, 0);
  const perMeal      = totalMeals ? totalExpense / totalMeals : 0;

  const memberMap = {};
  for (const meal of meals) {
    const uid  = meal.userId._id.toString();
    const name = `${meal.userId.firstName || ''} ${meal.userId.lastName || ''}`.trim()
                 || meal.userId.email;
    if (!memberMap[uid]) memberMap[uid] = { name, meals: 0, share: 0 };
    memberMap[uid].meals += meal.mealCount;
  }
  Object.values(memberMap).forEach(m => {
    m.share = totalMeals ? (m.meals / totalMeals) * totalExpense : 0;
  });

  const memberBreakdown = Object.values(memberMap);

  const pdfBuffer = await generateReportPDF({
    homeName: home.name,
    month,
    totalExpense,
    totalMeals,
    perMeal,
    memberBreakdown
  });

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

cron.schedule('1 18 28-31 * *', async () => {
  // Skip if today is not the last day of the month
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (tomorrow.getDate() !== 1) return;

  console.log('⏰ Monthly report cron started...');

  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);      // 1st of this month ✅
  const to   = new Date(now.getFullYear(), now.getMonth() + 1, 1);  // 1st of next month ✅
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

console.log('📅 Monthly report cron registered (runs last day of each month at 18:01 UTC = 12:01 AM BDT)');

module.exports = { processHome };

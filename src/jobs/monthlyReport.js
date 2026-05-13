const cron = require('node-cron');
const Home    = require('../models/Home');
const User    = require('../models/User');
const Meal    = require('../models/Meal');
const Expense = require('../models/Expense');
const { generateReportPDF } = require('../utils/pdfReport');
const { sendReportEmail }   = require('../utils/sendEmail');

const processHome = async (home, from, to, month) => {
  const [mealTotals, expenseTotals, mealByUser] = await Promise.all([
    Meal.aggregate([
      { $match: { homeId: home._id, date: { $gte: from, $lt: to } } },
      { $group: { _id: null, totalMeals: { $sum: '$mealCount' } } }
    ]),
    Expense.aggregate([
      { $match: { homeId: home._id, createdAt: { $gte: from, $lt: to } } },
      { $group: { _id: null, totalExpense: { $sum: '$amount' } } }
    ]),
    Meal.aggregate([
      { $match: { homeId: home._id, date: { $gte: from, $lt: to } } },
      { $group: { _id: '$userId', meals: { $sum: '$mealCount' } } }
    ])
  ]);

  const totalExpense = expenseTotals[0]?.totalExpense || 0;
  const totalMeals   = mealTotals[0]?.totalMeals || 0;
  const perMeal      = totalMeals ? totalExpense / totalMeals : 0;

  const userIds = mealByUser.map((entry) => entry._id);
  const users = await User.find({ _id: { $in: userIds } })
    .select('firstName lastName email')
    .lean();
  const usersById = new Map(users.map((user) => [user._id.toString(), user]));

  const memberBreakdown = mealByUser.map((entry) => {
    const user = usersById.get(entry._id.toString());
    const name = user
      ? `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email
      : 'Unknown member';
    return { name, meals: entry.meals, share: 0 };
  });

  memberBreakdown.forEach(m => {
    m.share = totalMeals ? (m.meals / totalMeals) * totalExpense : 0;
  });

  const pdfBuffer = await generateReportPDF({
    homeName: home.name,
    month,
    totalExpense,
    totalMeals,
    perMeal,
    memberBreakdown
  });

  const verifiedUsers = await User.find({
    _id: { $in: home.members.map((member) => member.user) },
    isVerified: true
  }).select('email firstName isVerified').lean();

  for (const user of verifiedUsers) {
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

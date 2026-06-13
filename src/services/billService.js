const Bill = require('../models/Bill');
const Expense = require('../models/Expense');
const Home = require('../models/Home');
const Meal = require('../models/Meal');
const { deliverBillEmails } = require('./billDelivery');

function getPreviousMonthPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year').value);
  const currentMonth = Number(parts.find(part => part.type === 'month').value);
  const previousMonthDate = new Date(Date.UTC(year, currentMonth - 2, 1));
  const periodStart = new Date(Date.UTC(year, currentMonth - 2, 1, -6));
  const periodEnd = new Date(Date.UTC(year, currentMonth - 1, 1, -6));
  const month = previousMonthDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return { periodStart, periodEnd, month };
}

function userName(user) {
  return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unknown';
}

async function pruneBillHistory(homeId) {
  const oldBills = await Bill.find({ homeId })
    .sort({ periodStart: -1, createdAt: -1 })
    .skip(3)
    .select('_id')
    .lean();

  if (oldBills.length) {
    await Bill.deleteMany({ _id: { $in: oldBills.map(bill => bill._id) } });
  }
}

async function calculateAndSendMonthlyBill(home, period, options = {}) {
  const homeId = home._id;
  const { periodStart, periodEnd, month } = period;
  const force = options.force === true;

  const existing = await Bill.findOne({ homeId, month }).lean();
  if (existing && !force) {
    await pruneBillHistory(homeId);
    return { skipped: true, reason: 'Bill already exists', bill: existing };
  }

  const fullHome = await Home.findById(homeId)
    .populate('members.user', 'firstName lastName email')
    .lean();

  if (!fullHome || !fullHome.members?.length) {
    return { skipped: true, reason: 'No home members' };
  }

  const [meals, expenses] = await Promise.all([
    Meal.find({
      homeId,
      isPenalty: false,
      date: { $gte: periodStart, $lt: periodEnd },
    })
      .select('userId mealCount eggsCount')
      .populate('userId', 'firstName lastName email')
      .lean(),
    Expense.find({
      homeId,
      createdAt: { $gte: periodStart, $lt: periodEnd },
    })
      .select('amount category eggQty')
      .lean(),
  ]);

  const totalEggPrice = expenses
    .filter(expense => expense.category === 'Egg')
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
  const totalEggCount = expenses
    .filter(expense => expense.category === 'Egg')
    .reduce((sum, expense) => sum + (Number(expense.eggQty) || 0), 0);
  const otherCost = expenses
    .filter(expense => expense.category !== 'Egg')
    .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

  const totalMeals = meals.reduce((sum, meal) => sum + (Number(meal.mealCount) || 0), 0);
  if (totalMeals <= 0) {
    return { skipped: true, reason: 'No meals found for this bill' };
  }

  const consumedEgg = meals.reduce((sum, meal) => sum + (Number(meal.eggsCount) || 0), 0);
  const perEgg = totalEggCount > 0 ? totalEggPrice / totalEggCount : 0;
  const consumedCost = consumedEgg * perEgg;
  const remainingEggCost = Math.max(totalEggPrice - consumedCost, 0);
  const totalBill = remainingEggCost + otherCost;
  const perMeal = totalBill / totalMeals;

  const memberMap = {};
  for (const { user } of fullHome.members) {
    if (!user) continue;
    const uid = user._id.toString();
    memberMap[uid] = {
      userId: uid,
      name: userName(user),
      email: user.email,
      meals: 0,
      eggs: 0,
      share: 0,
    };
  }

  for (const meal of meals) {
    if (!meal.userId) continue;
    const uid = meal.userId._id.toString();
    if (!memberMap[uid]) {
      memberMap[uid] = {
        userId: uid,
        name: userName(meal.userId),
        email: meal.userId.email,
        meals: 0,
        eggs: 0,
        share: 0,
      };
    }
    memberMap[uid].meals += Number(meal.mealCount) || 0;
    memberMap[uid].eggs += Number(meal.eggsCount) || 0;
  }

  Object.values(memberMap).forEach(member => {
    member.share = (perMeal * member.meals) + (perEgg * member.eggs);
  });

  const breakdown = Object.values(memberMap);
  const costSummary = {
    eggPrice: totalEggPrice,
    perEgg,
    consumedCost,
    remainingEggCost,
    other: otherCost,
  };

  const { sent, failed } = await deliverBillEmails({
    recipients: breakdown,
    homeName: fullHome.name,
    month,
    totalBill,
    totalMeals,
    perMeal,
    breakdown,
    costSummary,
  });
  const deliveryStatus = failed === 0
    ? 'sent'
    : sent === 0
      ? 'failed'
      : 'partial';

  const adminMember = fullHome.members.find(member => member.role === 'admin' && member.user)
    || fullHome.members.find(member => member.user);

  const bill = await Bill.findOneAndUpdate(
    { homeId, month },
    {
      homeId,
      month,
      periodStart,
      periodEnd,
      totalEggPrice,
      totalEggCount,
      consumedEgg,
      otherCost,
      totalMeals,
      totalBill,
      perEgg,
      perMeal,
      sentCount: sent,
      failedCount: failed,
      deliveryStatus,
      deliveryCompletedAt: new Date(),
      sentBy: adminMember?.user?._id || adminMember?.user,
      breakdown,
      costSummary,
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();

  await pruneBillHistory(homeId);

  return {
    skipped: false,
    bill,
    sent,
    failed,
    totalBill,
    perMeal,
    breakdown,
  };
}

async function processMonthlyBills(options = {}) {
  const period = options.period || getPreviousMonthPeriod(options.now);
  const homes = await Home.find().lean();
  const results = [];

  for (const home of homes) {
    try {
      const result = await calculateAndSendMonthlyBill(home, period, options);
      results.push({ homeId: home._id, homeName: home.name, ...result });
    } catch (err) {
      results.push({
        homeId: home._id,
        homeName: home.name,
        error: err.message,
      });
      console.error(`Monthly bill failed for home "${home.name}":`, err);
    }
  }

  return { period, results };
}

module.exports = {
  calculateAndSendMonthlyBill,
  getPreviousMonthPeriod,
  processMonthlyBills,
  pruneBillHistory,
};

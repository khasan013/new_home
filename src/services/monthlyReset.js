const Expense = require('../models/Expense');
const Bill = require('../models/Bill');
const Meal = require('../models/Meal');
const Penalty = require('../models/Penalty');

async function resetMonthlyWorkingData() {
  const [meals, expenses, penalties, bills] = await Promise.all([
    Meal.deleteMany({}),
    Expense.deleteMany({}),
    Penalty.deleteMany({}),
    Bill.deleteMany({}),
  ]);

  return {
    mealsDeleted: meals.deletedCount || 0,
    expensesDeleted: expenses.deletedCount || 0,
    penaltiesDeleted: penalties.deletedCount || 0,
    billsDeleted: bills.deletedCount || 0,
  };
}

module.exports = { resetMonthlyWorkingData };

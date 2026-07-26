const Expense = require('../models/Expense');
const Meal = require('../models/Meal');
const Penalty = require('../models/Penalty');

async function resetMonthlyWorkingData() {
  const [meals, expenses, penalties] = await Promise.all([
    Meal.deleteMany({}),
    Expense.deleteMany({}),
    Penalty.deleteMany({}),
  ]);

  return {
    mealsDeleted: meals.deletedCount || 0,
    expensesDeleted: expenses.deletedCount || 0,
    penaltiesDeleted: penalties.deletedCount || 0,
  };
}

module.exports = { resetMonthlyWorkingData };

// =========================================
// COMPLETE BACKEND (MONGODB + EXPRESS)
// FULL FIXED VERSION
// =========================================

// INSTALL:
// npm install express mongoose bcryptjs jsonwebtoken dotenv cors helmet morgan uuid

// =========================================
// FILE: server.js
// =========================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/home', require('./routes/home.routes'));
app.use('/api/meal', require('./routes/meal.routes'));
app.use('/api/expense', require('./routes/expense.routes'));
app.use('/api/report', require('./routes/report.routes'));

// DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error(err));

app.listen(5000, () => console.log('🚀 Server running'));

// =========================================
// FILE: models/User.js
// =========================================
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  firstName: String,
  lastName: String,
  isVerified: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);

// =========================================
// FILE: models/Home.js
// =========================================
const homeSchema = new mongoose.Schema({
  name: String,
  description: String,
  members: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      role: { type: String, enum: ['admin', 'member'], default: 'member' }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Home', homeSchema);

// =========================================
// FILE: models/Meal.js
// =========================================
const mealSchema = new mongoose.Schema({
  homeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Home' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: Date,
  mealCount: Number,
  eggsCount: Number
}, { timestamps: true });

module.exports = mongoose.model('Meal', mealSchema);

// =========================================
// FILE: models/Expense.js
// =========================================
const expenseSchema = new mongoose.Schema({
  homeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Home' },
  title: String,
  amount: Number,
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Expense', expenseSchema);

// =========================================
// FILE: middleware/auth.js
// =========================================
const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// =========================================
// FILE: routes/auth.routes.js
// =========================================
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password, firstName } = req.body;

  const hash = await bcrypt.hash(password, 10);
  await User.create({ email, password: hash, firstName });

  res.json({ message: 'Registered' });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(400).json({ message: 'Wrong password' });

  const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);

  res.json({ token });
});

module.exports = router;

// =========================================
// FILE: routes/home.routes.js
// =========================================
const Home = require('../models/Home');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  const home = await Home.create({
    name: req.body.name,
    members: [{ user: req.user.userId, role: 'admin' }]
  });

  res.json(home);
});

router.get('/', auth, async (req, res) => {
  const homes = await Home.find({ 'members.user': req.user.userId });
  res.json(homes);
});

module.exports = router;

// =========================================
// FILE: routes/meal.routes.js
// =========================================
const Meal = require('../models/Meal');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/:homeId', auth, async (req, res) => {
  const meal = await Meal.create({
    homeId: req.params.homeId,
    userId: req.user.userId,
    date: req.body.date,
    mealCount: req.body.mealCount,
    eggsCount: req.body.eggsCount
  });

  res.json(meal);
});

router.get('/:homeId', auth, async (req, res) => {
  const meals = await Meal.find({ homeId: req.params.homeId });
  res.json(meals);
});

module.exports = router;

// =========================================
// FILE: routes/expense.routes.js
// =========================================
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/:homeId', auth, async (req, res) => {
  const expense = await Expense.create({
    homeId: req.params.homeId,
    title: req.body.title,
    amount: req.body.amount,
    paidBy: req.user.userId
  });

  res.json(expense);
});

router.get('/:homeId', auth, async (req, res) => {
  const expenses = await Expense.find({ homeId: req.params.homeId });
  res.json(expenses);
});

module.exports = router;

// =========================================
// FILE: routes/report.routes.js
// =========================================
const Meal = require('../models/Meal');
const Expense = require('../models/Expense');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/:homeId', auth, async (req, res) => {
  const meals = await Meal.find({ homeId: req.params.homeId });
  const expenses = await Expense.find({ homeId: req.params.homeId });

  const totalExpense = expenses.reduce((sum, e) => sum + e.amount, 0);
  const totalMeals = meals.reduce((sum, m) => sum + m.mealCount, 0);

  const perMeal = totalMeals ? totalExpense / totalMeals : 0;

  res.json({ totalExpense, totalMeals, perMeal });
});

module.exports = router;

// =========================================
// FILE: .env
// =========================================
// MONGO_URI=mongodb://127.0.0.1:27017/mealapp
// JWT_SECRET=supersecret

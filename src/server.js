require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const app = express();

// ── Middleware ─────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(express.json());
app.use(morgan('dev'));


// ── Routes ─────────────────────────────────────────────
app.use('/api/auth',    require('./routes/auth.routes'));
app.use('/api/home',    require('./routes/home.routes'));
app.use('/api/meal',    require('./routes/meal.routes'));
app.use('/api/expense', require('./routes/expense.routes'));
app.use('/api/report',  require('./routes/report.routes'));
app.use('/api/admin',   require('./routes/admin.routes'));


// ── Health check (optional but useful) ─────────────────
app.get('/', (req, res) => {
  res.send('API is running...');
});


// ── MongoDB connection (serverless safe) ───────────────
let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      bufferCommands: false,
    });

    isConnected = true;
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err.message);
    throw err;
  }
}


// ── Vercel handler ─────────────────────────────────────
module.exports = async (req, res) => {
  await connectDB();
  return app(req, res);
};
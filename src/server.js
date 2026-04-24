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
app.use('/api/cron', require('./routes/cron.routes'));


// ── Health check ───────────────────────────────────────
app.get('/', (req, res) => {
  res.send('API is running...');
});


// ── 🔥 FIXED MongoDB connection (CACHED) ───────────────
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  // already connected
  if (cached.conn) return cached.conn;

  // create connection promise if not exists
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      bufferCommands: false,
    }).then((mongooseInstance) => {
      console.log('✅ MongoDB Connected');
      return mongooseInstance;
    });
  }

  // wait for connection
  cached.conn = await cached.promise;
  return cached.conn;
}


// ── Vercel handler ─────────────────────────────────────
module.exports = async (req, res) => {
  try {
    await connectDB(); // 🔥 MUST await before using DB
    return app(req, res);
  } catch (err) {
    console.error('❌ Server error:', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
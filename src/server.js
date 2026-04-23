require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
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

// ✅ DB Connection function
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB Connected');
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  }
};

// ✅ Start server (LOCAL only)
const startServer = async () => {
  await connectDB();

  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

// ❗ Only run server locally (NOT in Vercel)
if (process.env.NODE_ENV !== 'production') {
  startServer();
}

// ✅ Export app for Vercel
module.exports = app;
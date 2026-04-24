require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',    require('./routes/auth.routes'));
app.use('/api/home',    require('./routes/home.routes'));
app.use('/api/meal',    require('./routes/meal.routes'));
app.use('/api/expense', require('./routes/expense.routes'));
app.use('/api/report',  require('./routes/report.routes'));
app.use('/api/admin',   require('./routes/admin.routes'));  // ← admin

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    require('./jobs/monthlyReport');
    app.listen(5000, () => console.log('🚀 Server running on port 5000'));
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err);
    process.exit(1);
  });

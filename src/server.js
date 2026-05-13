require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const crypto = require('crypto');

const app = express();

// ── Security & App Settings ───────────────────────────
app.use(helmet());
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── CORS Configuration ────────────────────────────────
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'https://home-three-khaki-60.vercel.app'
)
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow Postman, mobile apps, server-to-server requests
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },

  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
};

app.use(cors(corsOptions));

// ── Body Parser ───────────────────────────────────────
app.use(express.json({
  limit: process.env.JSON_LIMIT || '1mb',
}));

// ── Request ID Middleware ─────────────────────────────
app.use((req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();

  res.setHeader('X-Request-Id', req.id);

  next();
});

// ── Logger ────────────────────────────────────────────
app.use(
  morgan(
    process.env.NODE_ENV === 'production'
      ? 'combined'
      : 'dev'
  )
);

// ── Routes ────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/home', require('./routes/home.routes'));
app.use('/api/meal', require('./routes/meal.routes'));
app.use('/api/expense', require('./routes/expense.routes'));
app.use('/api/report', require('./routes/report.routes'));
app.use('/api/admin', require('./routes/admin.routes'));
app.use('/api/cron', require('./routes/cron.routes'));

// ── Health Check Routes ───────────────────────────────
app.get('/', (req, res) => {
  res.send('✅ API is running...');
});

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/readyz', (req, res) => {
  const ready = mongoose.connection.readyState === 1;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'not_ready',
    mongoReadyState: mongoose.connection.readyState,
  });
});

// ── MongoDB Connection Cache ──────────────────────────
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = {
    conn: null,
    promise: null,
  };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        bufferCommands: false,

        maxPoolSize: Number(
          process.env.MONGO_MAX_POOL_SIZE || 50
        ),

        minPoolSize: Number(
          process.env.MONGO_MIN_POOL_SIZE || 0
        ),

        serverSelectionTimeoutMS: Number(
          process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 5000
        ),

        socketTimeoutMS: Number(
          process.env.MONGO_SOCKET_TIMEOUT_MS || 45000
        ),
      })
      .then((mongooseInstance) => {
        console.log('✅ MongoDB Connected');
        return mongooseInstance;
      })
      .catch((err) => {
        cached.promise = null;
        throw err;
      });
  }

  cached.conn = await cached.promise;

  return cached.conn;
}

// ── Global Error Handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ REQUEST ERROR:', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    message: err.message,
  });

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message:
      err.status
        ? err.message
        : 'Internal server error',

    requestId: req.id,
  });
});

// ── Start Server ──────────────────────────────────────
const PORT = process.env.PORT || 8080;

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

// ── Graceful Shutdown ─────────────────────────────────
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received');

  try {
    await mongoose.connection.close(false);

    console.log('✅ MongoDB connection closed');

    process.exit(0);

  } catch (err) {
    console.error('❌ Error during shutdown:', err);

    process.exit(1);
  }
});
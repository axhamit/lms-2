const env = require('./config/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const connectDB = require('./config/db');

const app = express();
app.set('trust proxy', 1);                                   // running behind Nginx / load balancer
app.use(helmet());
app.use(compression());
app.use(morgan(env.isProd ? 'combined' : 'dev'));
app.use(cors({
  origin: (origin, cb) => (!origin || env.clientUrls.includes(origin) ? cb(null, true) : cb(new Error('Origin not allowed by CORS'))),
}));
app.use(express.json({ limit: '100kb' }));

const limiter = (windowMs, max) => rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests, please try again later' } });
app.use('/api', limiter(60 * 1000, 600));
app.use(['/api/auth/login', '/api/auth/forgot', '/api/auth/reset'], limiter(15 * 60 * 1000, 30));

app.get('/api/health', (_, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ ok: mongoose.connection.readyState === 1 }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/certificates', require('./routes/certificates'));
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));

app.use((err, req, res, next) => { // eslint-disable-line
  if (err.name === 'CastError') return res.status(400).json({ message: 'Invalid ID' });
  if (err.name === 'ValidationError') return res.status(400).json({ message: Object.values(err.errors).map((e) => e.message).join(', ') });
  if (err.code === 11000) return res.status(409).json({ message: 'Already exists' });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 && env.isProd ? 'Server error' : err.message || 'Server error' });
});

let server;
connectDB().then(() => {
  server = app.listen(env.port, () => console.log(`API listening on ${env.port}`));
  if (env.runJobs) require('./jobs/reminders').start();
}).catch((e) => { console.error('Startup failed:', e.message); process.exit(1); });

const shutdown = () => { console.log('Shutting down…'); (server ? server.close.bind(server) : (f) => f())(() => mongoose.connection.close(false).then(() => process.exit(0))); setTimeout(() => process.exit(1), 10000).unref(); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);

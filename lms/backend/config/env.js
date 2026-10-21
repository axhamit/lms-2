require('dotenv').config();
const e = process.env;
const isProd = e.NODE_ENV === 'production';

for (const k of ['MONGO_URI', 'JWT_SECRET']) if (!e[k]) throw new Error(`Missing required env var: ${k}`);
if (isProd && e.JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be at least 32 characters in production');

const num = (k, d) => (e[k] !== undefined && e[k] !== '' ? Number(e[k]) : d);
const urls = (e.CLIENT_URL || 'http://localhost:3000').split(',').map((s) => s.trim());

module.exports = {
  isProd,
  port: num('PORT', 5000),
  mongoUri: e.MONGO_URI,
  jwtSecret: e.JWT_SECRET,
  jwtExpires: e.JWT_EXPIRES_IN || '1d',
  clientUrls: urls,
  clientUrl: urls[0],
  joinEarlyMin: num('JOIN_EARLY_MINUTES', 10),
  reminderMin: num('REMINDER_MINUTES', 30),
  attendMinPercent: num('ATTEND_MIN_PERCENT', 75),
  passPercent: num('PASS_PERCENT', 0),
  runJobs: e.RUN_JOBS !== 'false',
  jitsi: {
    domain: e.JITSI_DOMAIN || 'meet.jit.si',
    appId: e.JAAS_APP_ID, kid: e.JAAS_KID,
    privateKey: (e.JAAS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  s3: { bucket: e.S3_BUCKET, region: e.AWS_REGION },
  smtp: { host: e.SMTP_HOST, port: num('SMTP_PORT', 587), user: e.SMTP_USER, pass: e.SMTP_PASS, from: e.MAIL_FROM || 'GSN Foundation <no-reply@example.com>' },
};

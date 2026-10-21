const router = require('express').Router();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User } = require('../models');
const { protect, wrap } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');

const safe = (u) => ({ id: u._id, userId: u.userId, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword });
const sign = (u) => jwt.sign({ id: u._id, tv: u.tokenVersion }, env.jwtSecret, { expiresIn: env.jwtExpires });
const strong = (p) => typeof p === 'string' && p.length >= 8 && p.length <= 100;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Login with email OR user ID (e.g. STU482913)
router.post('/login', wrap(async (req, res) => {
  const identifier = String(req.body.identifier || '').trim();
  const password = String(req.body.password || '');
  if (!identifier || !password) return res.status(400).json({ message: 'Enter your ID/email and password' });
  const user = await User.findOne({ $or: [{ email: identifier.toLowerCase() }, { userId: identifier.toUpperCase() }] }).select('+password');
  if (!user || !(await user.matches(password))) return res.status(401).json({ message: 'Wrong ID/email or password' });
  if (!user.active) return res.status(403).json({ message: 'Your account is disabled. Contact your admin.' });
  user.lastLoginAt = new Date();
  await user.save();
  res.json({ token: sign(user), user: safe(user) });
}));

router.get('/me', protect, (req, res) => res.json({ user: safe(req.user) }));

// Change password (also logs out every other device)
router.post('/change-password', protect, wrap(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.matches(String(oldPassword || '')))) return res.status(400).json({ message: 'Old password is wrong' });
  if (!strong(newPassword)) return res.status(400).json({ message: 'New password must be at least 8 characters' });
  user.password = newPassword; user.mustChangePassword = false; user.tokenVersion += 1;
  await user.save();
  res.json({ token: sign(user), user: safe(user) });
}));

// Forgot password: always answers the same so nobody can discover which emails exist
router.post('/forgot', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = email && (await User.findOne({ email, active: true }));
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetTokenHash = sha(token); user.resetExpires = new Date(Date.now() + 30 * 60000);
    await user.save();
    const link = `${env.clientUrl}/reset-password?token=${token}`;
    await sendMail({ to: user.email, subject: 'Reset your GSN Foundation password',
      text: `Open this link within 30 minutes to set a new password: ${link}`,
      html: `<p>Hi ${user.name},</p><p><a href="${link}">Set a new password</a> (link works for 30 minutes).</p><p>If you did not ask for this, ignore this email.</p>` });
    if (!env.isProd && !process.env.SMTP_HOST) console.log('DEV reset link:', link);
  }
  res.json({ message: 'If that email is registered, a reset link has been sent.' });
}));

router.post('/reset', wrap(async (req, res) => {
  const { token, password } = req.body;
  if (!strong(password)) return res.status(400).json({ message: 'Password must be at least 8 characters' });
  const user = await User.findOne({ resetTokenHash: sha(String(token || '')), resetExpires: { $gt: new Date() } }).select('+resetTokenHash +resetExpires');
  if (!user) return res.status(400).json({ message: 'This reset link is invalid or has expired' });
  user.password = password; user.mustChangePassword = false; user.tokenVersion += 1;
  user.resetTokenHash = undefined; user.resetExpires = undefined;
  await user.save();
  res.json({ message: 'Password updated. You can log in now.' });
}));

module.exports = router;

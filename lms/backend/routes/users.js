const router = require('express').Router();
const { User, Course } = require('../models');
const { protect, allow, wrap } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const env = require('../config/env');

router.use(protect, allow('admin'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[char]));

// GET /api/users?role=&q=&page=&limit=
router.get('/', wrap(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 25);
  const q = {};
  if (req.query.role) q.role = String(req.query.role);
  if (req.query.active === 'true') q.active = true;
  if (req.query.active === 'false') q.active = false;
  if (req.query.q) { const r = new RegExp(esc(String(req.query.q)), 'i'); q.$or = [{ name: r }, { email: r }, { userId: r }]; }
  const [items, total] = await Promise.all([User.find(q).sort('-createdAt').skip((page - 1) * limit).limit(limit), User.countDocuments(q)]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
}));

router.get('/student-ids', wrap(async (req, res) => {
  const q = { role: 'student', active: true };
  if (req.query.q) { const r = new RegExp(esc(String(req.query.q)), 'i'); q.$or = [{ name: r }, { email: r }, { userId: r }]; }
  const students = await User.find(q).select('_id').lean();
  res.json(students.map((student) => String(student._id)));
}));

// Dropdown lists for course forms (id + name only)
router.get('/options', wrap(async (req, res) => {
  res.json(await User.find({ role: String(req.query.role), active: true }).select('name userId').sort('name').limit(2000));
}));

router.post('/', wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || typeof password !== 'string' || password.length < 8) return res.status(400).json({ message: 'Name, email and a password of 8+ characters are required' });
  if (!['admin', 'trainer', 'student'].includes(role)) return res.status(400).json({ message: 'Choose a valid role' });
  if (await User.findOne({ email: String(email).toLowerCase() })) return res.status(400).json({ message: 'Email already exists' });

  const user = await User.create({ name, email, password, role, mustChangePassword: true });

  // Send welcome email with login URL
  const loginUrl = `${env.clientUrl}/login`;
  const emailSent = await sendMail({
    to: user.email,
    subject: 'Welcome to GSN Foundation LMS',
    text: `Hi ${user.name},\n\nYour account has been created.\n\nLogin URL: ${loginUrl}\n\nEmail: ${user.email}\nPassword: ${password}\n\nPlease log in and change your password.\n\nBest regards,\nGSN Foundation Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e40af;">Welcome to GSN Foundation LMS</h2>
        <p>Hi <strong>${escapeHtml(user.name)}</strong>,</p>
        <p>Your account has been successfully created. You can now log in to access your courses.</p>
        <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0 0 10px;"><strong>Login Details:</strong></p>
          <p style="margin: 5px 0;">Email: ${escapeHtml(user.email)}</p>
          <p style="margin: 5px 0;">Password: ${escapeHtml(password)}</p>
        </div>
        <p>
          <a href="${escapeHtml(loginUrl)}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Log In Now</a>
        </p>
        <p style="color: #64748b; font-size: 14px;">After logging in, you will be prompted to change your password for security.</p>
        <p style="margin-top: 30px; color: #64748b; font-size: 14px;">Best regards,<br>GSN Foundation Team</p>
      </div>
    `
  });

  res.status(201).json({ ...user.toJSON(), emailSent });
}));

router.patch('/:id', wrap(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ message: 'User not found' });
  if (req.body.name) u.name = req.body.name;
  if (req.body.active !== undefined) {
    if (String(u._id) === String(req.user._id) && !req.body.active) return res.status(400).json({ message: 'You cannot disable yourself' });
    u.active = !!req.body.active;
  }
  if (req.body.password) {
    if (String(req.body.password).length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });
    u.password = req.body.password; u.mustChangePassword = true; u.tokenVersion += 1;

    // Send password reset email
    const loginUrl = `${env.clientUrl}/login`;
    await sendMail({
      to: u.email,
      subject: 'Your GSN Foundation LMS Password Has Been Reset',
      text: `Hi ${u.name},\n\nYour password has been reset by an admin.\n\nNew password: ${req.body.password}\n\nLogin URL: ${loginUrl}\n\nPlease log in and change your password.\n\nBest regards,\nGSN Foundation Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e40af;">Password Reset</h2>
          <p>Hi <strong>${u.name}</strong>,</p>
          <p>Your password has been reset by an administrator.</p>
          <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
            <p style="margin: 0;"><strong>New Password:</strong> ${req.body.password}</p>
          </div>
          <p>
            <a href="${loginUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Log In Now</a>
          </p>
          <p style="color: #64748b; font-size: 14px;">For security, please change your password after logging in.</p>
          <p style="margin-top: 30px; color: #64748b; font-size: 14px;">Best regards,<br>GSN Foundation Team</p>
        </div>
      `
    });
  }
  await u.save();
  res.json(u);
}));

router.delete('/:id', wrap(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) return res.status(400).json({ message: 'You cannot delete yourself' });
  await User.findByIdAndDelete(req.params.id);
  await Course.updateMany({}, { $pull: { students: req.params.id } });
  await Course.updateMany({ trainer: req.params.id }, { $unset: { trainer: 1 } });
  res.json({ message: 'Deleted' });
}));

module.exports = router;

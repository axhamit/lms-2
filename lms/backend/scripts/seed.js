require('../config/env');
const connectDB = require('../config/db');
const { User } = require('../models');

(async () => {
  await connectDB();
  const email = String(process.env.ADMIN_EMAIL || '').toLowerCase();
  if (!email || !process.env.ADMIN_PASSWORD) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  if (await User.findOne({ email })) console.log('Admin already exists:', email);
  else {
    const a = await User.create({ name: process.env.ADMIN_NAME || 'Admin', email, password: process.env.ADMIN_PASSWORD, role: 'admin', mustChangePassword: false });
    console.log(`Admin created. Log in with ${a.email} (or ${a.userId}) and your ADMIN_PASSWORD`);
  }
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });

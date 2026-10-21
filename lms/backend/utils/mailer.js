const nodemailer = require('nodemailer');
const { smtp } = require('../config/env');

const transport = smtp.host
  ? nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined })
  : null;

// Never throws: a failed email must not break an API request.
exports.sendMail = async ({ to, subject, html, text }) => {
  if (!transport) { console.log(`[mail not configured] to=${to} subject="${subject}"`); return false; }
  try { await transport.sendMail({ from: smtp.from, to, subject, html, text }); return true; }
  catch (e) { console.error('Email failed:', to, e.message); return false; }
};

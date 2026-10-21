const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { User } = require('../models');

exports.protect = async (req, res, next) => {
  try {
    const h = req.headers.authorization || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Please log in' });
    const d = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(d.id);
    if (!user || !user.active || d.tv !== user.tokenVersion) return res.status(401).json({ message: 'Session expired, please log in again' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Session expired, please log in again' });
  }
};

exports.allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ message: 'You do not have access to this' });

exports.wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

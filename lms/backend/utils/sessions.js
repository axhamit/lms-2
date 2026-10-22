const env = require('../config/env');
const t = (d) => +new Date(d);
const endTime = (s) => new Date(t(s.startTime) + s.durationMinutes * 60000);
const countsAsPresent = (seconds, s) => seconds > (s.durationMinutes * 60 * env.attendMinPercent) / 100;
// upcoming | live | completed
const statusOf = (s, now = Date.now()) => (now < t(s.startTime) ? 'upcoming' : now <= +endTime(s) ? 'live' : 'completed');
// Students may enter from (start - JOIN_EARLY_MINUTES) until the class ends
const joinable = (s, now = Date.now()) => now >= t(s.startTime) - env.joinEarlyMin * 60000 && now <= +endTime(s);
module.exports = { endTime, statusOf, joinable, countsAsPresent };

const router = require('express').Router();
const crypto = require('crypto');
const s3 = require('../config/s3');
const { Course, Assignment, Session } = require('../models');
const { protect, wrap } = require('../middleware/auth');
const { isOwner, isSessionOwner, isMember } = require('../utils/access');

router.use(protect, s3.require);
const bad = (res, msg, code = 400) => res.status(code).json({ message: msg });
const MB = 1024 * 1024;

const DOCS = ['application/pdf', 'image/png', 'image/jpeg', 'application/zip', 'text/plain', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-powerpoint', 'application/vnd.ms-excel'];
const RULES = {
  submission: { types: DOCS, max: 25 * MB },
  material: { types: [...DOCS, 'video/mp4'], max: 100 * MB },
  recording: { types: ['video/mp4', 'video/webm'], max: 2048 * MB },
};
const safeName = (n) => String(n || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

// Step 1 of every upload: browser asks for a short-lived upload URL, then PUTs the file straight to S3
router.post('/presign', wrap(async (req, res) => {
  const { purpose, courseId, refId, filename, contentType, size } = req.body;
  const rule = RULES[purpose];
  if (!rule) return bad(res, 'Invalid upload type');
  const c = await Course.findById(courseId);
  if (!c) return bad(res, 'Not allowed', 403);
  if (!rule.types.includes(contentType)) return bad(res, 'This file type is not allowed');
  if (!(size > 0 && size <= rule.max)) return bad(res, `File must be smaller than ${Math.round(rule.max / MB)} MB`);

  let prefix;
  if (purpose === 'submission') {
    if (!isMember(req.user, c)) return bad(res, 'Not allowed', 403);
    if (req.user.role !== 'student') return bad(res, 'Only students submit assignments', 403);
    const a = await Assignment.findOne({ _id: refId, course: c._id });
    if (!a) return bad(res, 'Assignment not found', 404);
    prefix = `courses/${c._id}/submissions/${a._id}/${req.user._id}/`;
  } else if (purpose === 'recording') {
    const s = await Session.findOne({ _id: refId, course: c._id });
    if (!s) return bad(res, 'Class not found', 404);
    if (!isSessionOwner(req.user, c, s)) return bad(res, 'Only the assigned trainer can upload this', 403);
    prefix = `courses/${c._id}/recordings/${s._id}/`;
  } else {
    if (!isMember(req.user, c)) return bad(res, 'Not allowed', 403);
    if (!isOwner(req.user, c)) return bad(res, 'Only the trainer can upload this', 403);
    prefix = `courses/${c._id}/materials/`;
  }
  const key = `${prefix}${crypto.randomUUID()}-${safeName(filename)}`;
  res.json({ key, url: await s3.presignPut(key, contentType), headers: { 'Content-Type': contentType } });
}));

// Short-lived download / streaming URL. Access is decided from the course the file belongs to.
router.get('/download', wrap(async (req, res) => {
  const key = String(req.query.key || '');
  const p = key.split('/');
  if (p[0] !== 'courses' || p.length < 4) return bad(res, 'Invalid file');
  const c = await Course.findById(p[1]);
  if (!c) return bad(res, 'Not allowed', 403);
  if (p[2] === 'recordings') {
    const s = await Session.findOne({ _id: p[3], course: c._id });
    if (!s || (!isMember(req.user, c) && !isSessionOwner(req.user, c, s))) return bad(res, 'Not allowed', 403);
  } else if (!isMember(req.user, c)) return bad(res, 'Not allowed', 403);
  if (p[2] === 'submissions' && req.user.role === 'student' && p[4] !== String(req.user._id)) return bad(res, 'Not allowed', 403);
  const filename = p[p.length - 1].replace(/^[0-9a-f-]{36}-/, '');
  res.json({ url: await s3.presignGet(key, { filename, inline: req.query.inline === '1' }) });
}));

/* ---- multipart upload for browser-recorded classes (trainer only) ---- */
const ownedKey = async (req, key) => {
  const p = String(key || '').split('/');
  if (p[0] !== 'courses' || p[2] !== 'recordings') return null;
  const c = await Course.findById(p[1]);
  const s = await Session.findOne({ _id: p[3], course: p[1] });
  return c && s && isSessionOwner(req.user, c, s) ? { c, sessionId: p[3] } : null;
};

router.post('/multipart/start', wrap(async (req, res) => {
  const s = await Session.findById(req.body.sessionId);
  const c = s && (await Course.findById(s.course));
  if (!c || !isSessionOwner(req.user, c, s)) return bad(res, 'Not allowed', 403);
  const key = `courses/${c._id}/recordings/${s._id}/${crypto.randomUUID()}-class-recording.webm`;
  res.json({ key, uploadId: await s3.mpStart(key, 'video/webm') });
}));

router.post('/multipart/part-url', wrap(async (req, res) => {
  const { key, uploadId, partNumber } = req.body;
  const n = parseInt(partNumber);
  if (!(await ownedKey(req, key)) || !(n >= 1 && n <= 10000)) return bad(res, 'Not allowed', 403);
  res.json({ url: await s3.mpPartUrl(key, uploadId, n) });
}));

router.post('/multipart/complete', wrap(async (req, res) => {
  const { key, uploadId, parts, durationSeconds, name } = req.body;
  const owned = await ownedKey(req, key);
  if (!owned || !Array.isArray(parts) || !parts.length) return bad(res, 'Not allowed', 403);
  const Parts = parts.map((p) => ({ PartNumber: parseInt(p.PartNumber), ETag: String(p.ETag) })).sort((a, b) => a.PartNumber - b.PartNumber);
  await s3.mpComplete(key, uploadId, Parts);
  const size = await s3.verify(key, RULES.recording.max);
  await Session.updateOne({ _id: owned.sessionId }, { $push: { recordings: { key, name: String(name || 'Class recording').slice(0, 120), size, durationSeconds: Number(durationSeconds) || undefined, source: 'browser' } } });
  res.json({ ok: true });
}));

router.post('/multipart/abort', wrap(async (req, res) => {
  if (await ownedKey(req, req.body.key)) await s3.mpAbort(req.body.key, req.body.uploadId);
  res.json({ ok: true });
}));

module.exports = router;

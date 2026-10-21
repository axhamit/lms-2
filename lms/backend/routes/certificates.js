const router = require('express').Router();
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const env = require('../config/env');
const { Certificate, Course } = require('../models');
const { protect, allow, wrap } = require('../middleware/auth');
const progressFor = require('../utils/progress');

// Public: anyone can verify a certificate by its ID
router.get('/verify/:certId', wrap(async (req, res) => {
  const c = await Certificate.findOne({ certId: String(req.params.certId).toUpperCase() }).populate('student', 'name userId').populate('course', 'title');
  if (!c) return res.status(404).json({ valid: false, message: 'No certificate found with this ID' });
  res.json({ valid: true, certId: c.certId, student: c.student.name, studentId: c.student.userId, course: c.course.title, issuedAt: c.issuedAt });
}));

router.use(protect);

router.get('/mine', allow('student'), wrap(async (req, res) => {
  res.json(await Certificate.find({ student: req.user._id }).populate('course', 'title').sort('-issuedAt'));
}));

// Only after the course is 100% complete
router.post('/generate/:courseId', allow('student'), wrap(async (req, res) => {
  const course = await Course.findById(req.params.courseId);
  if (!course || !course.students.some((s) => String(s) === String(req.user._id))) return res.status(403).json({ message: 'You are not enrolled in this course' });
  const p = await progressFor(course._id, req.user._id);
  if (!p.completed) return res.status(400).json({ message: `Course not complete yet (${p.percent}%). Attend all classes and finish all assignments.` });
  let cert = await Certificate.findOne({ student: req.user._id, course: course._id });
  if (!cert) cert = await Certificate.create({ student: req.user._id, course: course._id, certId: 'CERT-' + crypto.randomBytes(4).toString('hex').toUpperCase() });
  res.json(cert);
}));

router.get('/:certId/pdf', wrap(async (req, res) => {
  const cert = await Certificate.findOne({ certId: req.params.certId }).populate('student', 'name userId').populate('course', 'title');
  if (!cert) return res.status(404).json({ message: 'Certificate not found' });
  if (req.user.role === 'student' && String(cert.student._id) !== String(req.user._id)) return res.status(403).json({ message: 'Not yours' });

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${cert.certId}.pdf`);
  doc.pipe(res);
  const W = doc.page.width, H = doc.page.height;
  const center = (t, y, o = {}) => doc.text(t, 60, y, { align: 'center', width: W - 120, ...o });
  doc.rect(20, 20, W - 40, H - 40).lineWidth(4).stroke('#0f4c5c');
  doc.rect(32, 32, W - 64, H - 64).lineWidth(1).stroke('#c9a227');
  doc.fillColor('#0f4c5c').font('Helvetica-Bold').fontSize(36); center('CERTIFICATE OF COMPLETION', 85);
  doc.fillColor('#444').font('Helvetica').fontSize(16); center('This is to certify that', 160);
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(34); center(cert.student.name, 192);
  doc.fillColor('#444').font('Helvetica').fontSize(15); center(`(Student ID: ${cert.student.userId}) has successfully completed the course`, 247);
  doc.fillColor('#0f4c5c').font('Helvetica-Bold').fontSize(26); center(cert.course.title, 285);
  doc.fillColor('#444').font('Helvetica').fontSize(12);
  center(`Issued on ${cert.issuedAt.toDateString()}   |   Certificate ID: ${cert.certId}`, 400);
  center(`Verify this certificate at ${env.clientUrl}/verify/${cert.certId}`, 420);
  doc.end();
}));

module.exports = router;

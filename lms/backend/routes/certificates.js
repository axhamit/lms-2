const router = require('express').Router();
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const env = require('../config/env');
const { Certificate, Course, CourseEnrollment, User } = require('../models');
const { protect, allow, wrap } = require('../middleware/auth');

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

// Only admins can issue a certificate after approving course completion.
router.post('/generate/:courseId/:studentId', allow('admin'), wrap(async (req, res) => {
  const [course, student] = await Promise.all([
    Course.findById(req.params.courseId).select('students'),
    User.findOne({ _id: req.params.studentId, role: 'student' }).select('_id'),
  ]);
  if (!course || !student || !course.students.some((id) => String(id) === String(student._id))) {
    return res.status(404).json({ message: 'Enrolled student not found for this course' });
  }
  const enrollment = await CourseEnrollment.findOne({ course: course._id, student: student._id }).select('approvedCourseCompletion').lean();
  if (enrollment?.approvedCourseCompletion !== 100) {
    return res.status(400).json({ message: 'Certificate generation requires 100% admin-approved course completion' });
  }
  const existing = await Certificate.findOne({ student: student._id, course: course._id }).select('_id');
  if (existing) return res.status(409).json({ message: 'A certificate has already been issued for this student and course' });
  const cert = await Certificate.create({
    student: student._id,
    course: course._id,
    certId: 'CERT-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
  });
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

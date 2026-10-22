const router = require('express').Router();
const env = require('../config/env');
const s3 = require('../config/s3');
const { Course, CourseEnrollment, Session, Attendance, Assignment, Submission, Certificate, Material, User } = require('../models');
const { protect, allow, wrap } = require('../middleware/auth');
const { same, isOwner, isMember } = require('../utils/access');
const { endTime, statusOf, joinable, countsAsPresent } = require('../utils/sessions');
const progressFor = require('../utils/progress');
const jitsi = require('../utils/jitsi');
const { sendMail } = require('../utils/mailer');

router.use(protect);
const bad = (res, msg, code = 400) => res.status(code).json({ message: msg });
const MB = 1024 * 1024;
const LIMITS = { submission: 25 * MB, material: 100 * MB, recording: 2048 * MB };

const sessionAndCourse = async (sid) => {
  const s = await Session.findById(sid);
  const c = s && (await Course.findById(s.course));
  return { s, c };
};
const pct = (secs, s) => Math.min(100, Math.round((secs / (s.durationMinutes * 60)) * 100));

/* ================= COURSES ================= */
router.get('/', wrap(async (req, res) => {
  const u = req.user;
  const q = u.role === 'admin' ? {} : u.role === 'trainer' ? { trainer: u._id } : { students: u._id };
  let query = Course.find(q).populate('trainer', 'name email userId').sort('-createdAt');
  query = u.role === 'student' ? query.select('-students') : query.populate('students', 'name email userId');
  let courses = await query.lean();
  if (u.role === 'student' && courses.length) {
    const courseIds = courses.map((course) => course._id);
    const [enrollments, certificates] = await Promise.all([
      CourseEnrollment.find({ course: { $in: courseIds }, student: u._id }).select('course approvedCourseCompletion').lean(),
      Certificate.find({ course: { $in: courseIds }, student: u._id }).select('course certId issuedAt').lean(),
    ]);
    const approvalByCourse = new Map(enrollments.map((enrollment) => [String(enrollment.course), enrollment.approvedCourseCompletion]));
    const certificateByCourse = new Map(certificates.map((certificate) => [String(certificate.course), certificate]));
    courses = await Promise.all(courses.map(async (course) => ({
      ...course,
      progress: await progressFor(course._id, u._id),
      approvedCourseCompletion: approvalByCourse.get(String(course._id)) || 0,
      certificate: certificateByCourse.get(String(course._id)) || null,
    })));
  }
  res.json(courses);
}));

router.post('/', allow('admin'), wrap(async (req, res) => {
  const { title, description, trainer, students } = req.body;
  if (!title) return bad(res, 'Course title is required');
  const course = await Course.create({ title, description, trainer: trainer || undefined, students: students || [] });

  // Send enrollment emails to students
  if (students && students.length > 0) {
    const enrolledStudents = await User.find({ _id: { $in: students } }).select('name email');
    const loginUrl = `${env.clientUrl}/login`;

    for (const student of enrolledStudents) {
      await sendMail({
        to: student.email,
        subject: `You've been enrolled in ${title}`,
        text: `Hi ${student.name},\n\nYou have been enrolled in a new course: ${title}\n\nLogin URL: ${loginUrl}\n\nBest regards,\nGSN Foundation Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e40af;">Course Enrollment</h2>
            <p>Hi <strong>${student.name}</strong>,</p>
            <p>You have been enrolled in a new course:</p>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;">
              <h3 style="margin: 0 0 10px; color: #1e40af;">${title}</h3>
              ${description ? `<p style="margin: 0; color: #64748b;">${description}</p>` : ''}
            </div>
            <p>
              <a href="${loginUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Log In to View Course</a>
            </p>
            <p style="margin-top: 30px; color: #64748b; font-size: 14px;">Best regards,<br>GSN Foundation Team</p>
          </div>
        `
      });
    }
  }

  res.status(201).json(course);
}));

router.patch('/:id', allow('admin'), wrap(async (req, res) => {
  const { title, description, trainer, students } = req.body;
  const course = await Course.findByIdAndUpdate(req.params.id, { title, description, trainer: trainer || null, students: students || [] }, { new: true, runValidators: true });

  // Send enrollment emails to newly added students
  if (students && students.length > 0) {
    const enrolledStudents = await User.find({ _id: { $in: students } }).select('name email');
    const loginUrl = `${env.clientUrl}/login`;

    for (const student of enrolledStudents) {
      await sendMail({
        to: student.email,
        subject: `You've been enrolled in ${title || 'a course'}`,
        text: `Hi ${student.name},\n\nYou have been enrolled in a course: ${title || 'a course'}\n\nLogin URL: ${loginUrl}\n\nBest regards,\nGSN Foundation Team`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #1e40af;">Course Enrollment</h2>
            <p>Hi <strong>${student.name}</strong>,</p>
            <p>You have been enrolled in a course.</p>
            <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;">
              <h3 style="margin: 0 0 10px; color: #1e40af;">${title || 'Course'}</h3>
              ${description ? `<p style="margin: 0; color: #64748b;">${description}</p>` : ''}
            </div>
            <p>
              <a href="${loginUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">Log In to View Course</a>
            </p>
            <p style="margin-top: 30px; color: #64748b; font-size: 14px;">Best regards,<br>GSN Foundation Team</p>
          </div>
        `
      });
    }
  }

  res.json(course);
}));

router.delete('/:id', allow('admin'), wrap(async (req, res) => {
  const ass = await Assignment.find({ course: req.params.id }).select('_id');
  await Submission.deleteMany({ assignment: { $in: ass.map((a) => a._id) } });
  await Promise.all([Assignment.deleteMany({ course: req.params.id }), Session.deleteMany({ course: req.params.id }), Attendance.deleteMany({ course: req.params.id }),
    Material.deleteMany({ course: req.params.id }), Certificate.deleteMany({ course: req.params.id }),
    CourseEnrollment.deleteMany({ course: req.params.id }), Course.findByIdAndDelete(req.params.id)]);
  s3.deletePrefix(`courses/${req.params.id}/`).catch((e) => console.error('S3 cleanup failed', e.message));
  res.json({ message: 'Deleted' });
}));

/* ================= LIVE CLASSES ================= */
router.post('/:id/sessions', allow('admin'), wrap(async (req, res) => {
  const c = await Course.findById(req.params.id);
  if (!c) return bad(res, 'Course not found', 404);
  const { title, startTime, durationMinutes = 60, provider = 'jitsi', meetingLink } = req.body;
  const start = new Date(startTime);
  const dur = Number(durationMinutes);
  if (!title || isNaN(start)) return bad(res, 'Title and a valid start time are required');
  if (!(dur >= 5 && dur <= 480)) return bad(res, 'Duration must be between 5 and 480 minutes');
  const external = provider === 'external';
  if (external && !/^https?:\/\/\S+$/i.test(meetingLink || '')) return bad(res, 'Enter a valid meeting link starting with https://');
  const session = await Session.create({
    course: c._id, title, startTime: start, durationMinutes: dur, createdBy: req.user._id,
    provider: external ? 'external' : 'jitsi', meetingLink: external ? meetingLink : undefined, roomName: external ? undefined : jitsi.newRoom(),
  });

  // Send class notification emails to enrolled students
  const students = await User.find({ _id: { $in: c.students } }).select('name email');
  const loginUrl = `${env.clientUrl}/login`;
  const courseUrl = `${env.clientUrl}/student/courses/${c._id}`;

  for (const student of students) {
    await sendMail({
      to: student.email,
      subject: `New Class Scheduled: ${title}`,
      text: `Hi ${student.name},\n\nA new class has been scheduled for your course: ${c.title}\n\nClass: ${title}\nDate: ${start.toLocaleString()}\nDuration: ${dur} minutes\n\nLogin URL: ${loginUrl}\n\nBest regards,\nGSN Foundation Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e40af;">New Class Scheduled</h2>
          <p>Hi <strong>${student.name}</strong>,</p>
          <p>A new class has been scheduled for your course.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;">
            <h3 style="margin: 0 0 10px; color: #1e40af;">${c.title}</h3>
            <p style="margin: 5px 0;"><strong>Class:</strong> ${title}</p>
            <p style="margin: 5px 0;"><strong>Date:</strong> ${start.toLocaleString()}</p>
            <p style="margin: 5px 0;"><strong>Duration:</strong> ${dur} minutes</p>
          </div>
          <p>
            <a href="${courseUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">View Course</a>
          </p>
          <p style="margin-top: 30px; color: #64748b; font-size: 14px;">Best regards,<br>GSN Foundation Team</p>
        </div>
      `
    });
  }

  res.status(201).json(session);
}));

router.delete('/sessions/:sid', allow('trainer', 'admin'), wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  await Promise.all([Attendance.deleteMany({ session: s._id }), ...s.recordings.map((r) => s3.remove(r.key))]);
  await s.deleteOne();
  res.json({ message: 'Deleted' });
}));

const roomPayload = (s, c, user, moderator) => ({
  sessionId: s._id, courseId: c._id, courseTitle: c.title, title: s.title, startTime: s.startTime, endTime: endTime(s),
  durationMinutes: s.durationMinutes, provider: s.provider,
  ...(s.provider === 'external' ? { meetingLink: s.meetingLink } : jitsi.joinInfo(s, user, moderator)),
});

// Trainer / admin enters the room (moderator)
router.get('/sessions/:sid/room', allow('trainer', 'admin'), wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  res.json(roomPayload(s, c, req.user, true));
}));

// Student joins: allowed only inside the join window; starts attendance tracking
router.post('/sessions/:sid/join', allow('student'), wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isMember(req.user, c)) return bad(res, 'You are not enrolled in this class', 403);
  if (!joinable(s)) return bad(res, statusOf(s) === 'completed' ? 'This class has ended' : `This class opens ${env.joinEarlyMin} minutes before the start time`, 403);
  const now = new Date();
  const update = { $inc: { joins: 1 }, $set: { lastSeenAt: now }, $setOnInsert: { course: c._id, firstJoinedAt: now } };
  if (s.provider === 'external') { update.$max = { totalSeconds: s.durationMinutes * 60 }; update.$set.manual = true; }   // time on external tools can't be measured
  else update.$setOnInsert.totalSeconds = 0;
  await Attendance.updateOne({ session: s._id, student: req.user._id }, update, { upsert: true });
  res.json(roomPayload(s, c, req.user, false));
}));

// Called every ~20s by the classroom page while the student is inside the video room, and once on leaving.
// Only time between class start and end is counted, and each tick adds at most 60s.
const track = wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isMember(req.user, c)) return bad(res, 'Not allowed', 403);
  const a = await Attendance.findOne({ session: s._id, student: req.user._id });
  if (!a || s.provider === 'external') return bad(res, 'Join the class first');
  const now = Date.now();
  const from = Math.max(+a.lastSeenAt, +s.startTime);
  const to = Math.min(now, +endTime(s));
  const delta = Math.max(0, Math.min((to - from) / 1000, 60));
  await Attendance.updateOne({ _id: a._id }, { $set: { lastSeenAt: new Date(now) }, $inc: { totalSeconds: delta } });
  res.json({ ok: true, seconds: Math.round(a.totalSeconds + delta) });
});
router.post('/sessions/:sid/heartbeat', allow('student'), track);
router.post('/sessions/:sid/leave', allow('student'), track);

// Attendance report for one class (JSON, or CSV with ?format=csv)
router.get('/sessions/:sid/attendance', allow('trainer', 'admin'), wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  const [students, att] = await Promise.all([User.find({ _id: { $in: c.students } }).select('name userId email').sort('name').lean(), Attendance.find({ session: s._id }).lean()]);
  const map = new Map(att.map((a) => [String(a.student), a]));
  const rows = students.map((u) => {
    const a = map.get(String(u._id));
    const secs = Math.round(a?.totalSeconds || 0);
    return { studentId: u.userId, name: u.name, email: u.email, joins: a?.joins || 0, firstJoinedAt: a?.firstJoinedAt || null,
      minutes: Math.round(secs / 60), percent: pct(secs, s), present: countsAsPresent(secs, s), measured: a ? !a.manual : true };
  });
  if (req.query.format === 'csv') {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Student ID,Name,Email,Joins,First joined,Minutes in class,% of class,Present',
      ...rows.map((r) => [r.studentId, r.name, r.email, r.joins, r.firstJoinedAt ? new Date(r.firstJoinedAt).toISOString() : '', r.minutes, r.percent, r.present ? 'Yes' : 'No'].map(q).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    return res.send(csv);
  }
  res.json({ session: { title: s.title, startTime: s.startTime, durationMinutes: s.durationMinutes, requiredPercent: env.attendMinPercent }, rows });
}));

/* ---- recordings (files live in S3) ---- */
router.post('/sessions/:sid/recordings', allow('trainer', 'admin'), s3.require, wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  const f = req.body.file || {};
  if (!String(f.key).startsWith(`courses/${c._id}/recordings/${s._id}/`)) return bad(res, 'Invalid file');
  const size = await s3.verify(f.key, LIMITS.recording);
  s.recordings.push({ key: f.key, name: String(f.name || 'Recording').slice(0, 120), size, source: 'upload' });
  await s.save();
  res.status(201).json(s.recordings);
}));

router.delete('/sessions/:sid/recordings', allow('trainer', 'admin'), wrap(async (req, res) => {
  const { s, c } = await sessionAndCourse(req.params.sid);
  if (!s || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  const key = String(req.query.key || '');
  if (!s.recordings.some((r) => r.key === key)) return bad(res, 'Recording not found', 404);
  s.recordings = s.recordings.filter((r) => r.key !== key);
  await s.save(); await s3.remove(key);
  res.json({ message: 'Deleted' });
}));

/* ================= STUDY MATERIAL ================= */
router.post('/:id/materials', allow('trainer', 'admin'), s3.require, wrap(async (req, res) => {
  const c = await Course.findById(req.params.id);
  if (!c || !isOwner(req.user, c)) return bad(res, 'Not your course', 403);
  const { title, file: f = {} } = req.body;
  if (!title || !String(f.key).startsWith(`courses/${c._id}/materials/`)) return bad(res, 'Title and file are required');
  const size = await s3.verify(f.key, LIMITS.material);
  res.status(201).json(await Material.create({ course: c._id, title, uploadedBy: req.user._id, file: { key: f.key, name: String(f.name || 'file').slice(0, 120), size, contentType: f.contentType } }));
}));

router.delete('/materials/:mid', allow('trainer', 'admin'), wrap(async (req, res) => {
  const m = await Material.findById(req.params.mid);
  const c = m && (await Course.findById(m.course));
  if (!c || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  await s3.remove(m.file.key); await m.deleteOne();
  res.json({ message: 'Deleted' });
}));

/* ================= ASSIGNMENTS ================= */
router.post('/:id/assignments', allow('trainer', 'admin'), wrap(async (req, res) => {
  const c = await Course.findById(req.params.id);
  if (!c || !isOwner(req.user, c)) return bad(res, 'Not your course', 403);
  const { title, description, dueDate, maxMarks } = req.body;
  if (!title) return bad(res, 'Title is required');
  const assignment = await Assignment.create({ course: c._id, title, description, dueDate: dueDate || undefined, maxMarks: Number(maxMarks) || 100 });

  // Send assignment notification emails to enrolled students
  const students = await User.find({ _id: { $in: c.students } }).select('name email');
  const loginUrl = `${env.clientUrl}/login`;
  const courseUrl = `${env.clientUrl}/student/courses/${c._id}`;

  for (const student of students) {
    await sendMail({
      to: student.email,
      subject: `New Assignment: ${title}`,
      text: `Hi ${student.name},\n\nA new assignment has been posted for your course: ${c.title}\n\nAssignment: ${title}\n${dueDate ? `Due Date: ${new Date(dueDate).toLocaleDateString()}` : ''}\n\nLogin URL: ${loginUrl}\n\nBest regards,\nGSN Foundation Team`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e40af;">New Assignment Posted</h2>
          <p>Hi <strong>${student.name}</strong>,</p>
          <p>A new assignment has been posted for your course.</p>
          <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #1e40af;">
            <h3 style="margin: 0 0 10px; color: #1e40af;">${c.title}</h3>
            <p style="margin: 5px 0;"><strong>Assignment:</strong> ${title}</p>
            ${description ? `<p style="margin: 5px 0; color: #64748b;">${description}</p>` : ''}
            ${dueDate ? `<p style="margin: 5px 0;"><strong>Due Date:</strong> ${new Date(dueDate).toLocaleDateString()}</p>` : ''}
            <p style="margin: 5px 0;"><strong>Max Marks:</strong> ${Number(maxMarks) || 100}</p>
          </div>
          <p>
            <a href="${courseUrl}" style="background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0;">View Assignment</a>
          </p>
          <p style="margin-top: 30px; color: #64748b; font-size: 14px;">Best regards,<br>GSN Foundation Team</p>
        </div>
      `
    });
  }

  res.status(201).json(assignment);
}));

router.delete('/assignments/:aid', allow('trainer', 'admin'), wrap(async (req, res) => {
  const a = await Assignment.findById(req.params.aid);
  const c = a && (await Course.findById(a.course));
  if (!c || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  const subs = await Submission.find({ assignment: a._id });
  await Promise.all(subs.flatMap((s) => s.files.map((f) => s3.remove(f.key))));
  await Submission.deleteMany({ assignment: a._id }); await a.deleteOne();
  res.json({ message: 'Deleted' });
}));

router.post('/assignments/:aid/submit', allow('student'), wrap(async (req, res) => {
  const a = await Assignment.findById(req.params.aid);
  const c = a && (await Course.findById(a.course));
  if (!c || !isMember(req.user, c)) return bad(res, 'You are not enrolled in this course', 403);
  const content = String(req.body.content || '').trim();
  const files = Array.isArray(req.body.files) ? req.body.files.slice(0, 5) : [];
  if (!content && !files.length) return bad(res, 'Write your answer or attach a file');
  const existing = await Submission.findOne({ assignment: a._id, student: req.user._id });
  if (existing?.gradedAt) return bad(res, 'Already graded, cannot resubmit');
  const prefix = `courses/${c._id}/submissions/${a._id}/${req.user._id}/`;
  const clean = [];
  for (const f of files) {
    if (!String(f.key).startsWith(prefix)) return bad(res, 'Invalid file');
    clean.push({ key: f.key, name: String(f.name || 'file').slice(0, 120), size: await s3.verify(f.key, LIMITS.submission), contentType: f.contentType });
  }
  const now = new Date();
  res.json(await Submission.findOneAndUpdate({ assignment: a._id, student: req.user._id },
    { content, files: clean, submittedAt: now, late: !!a.dueDate && now > new Date(new Date(a.dueDate).setHours(23, 59, 59, 999)) },
    { upsert: true, new: true, setDefaultsOnInsert: true }));
}));

router.get('/assignments/:aid/submissions', allow('trainer', 'admin'), wrap(async (req, res) => {
  const a = await Assignment.findById(req.params.aid);
  const c = a && (await Course.findById(a.course));
  if (!c || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  res.json(await Submission.find({ assignment: a._id }).populate('student', 'name userId email').sort('-updatedAt'));
}));

router.patch('/submissions/:sid/grade', allow('trainer', 'admin'), wrap(async (req, res) => {
  const sub = await Submission.findById(req.params.sid).populate('assignment');
  const c = sub && (await Course.findById(sub.assignment.course));
  if (!c || !isOwner(req.user, c)) return bad(res, 'Not allowed', 403);
  const marks = Number(req.body.marks);
  if (req.body.marks === '' || Number.isNaN(marks) || marks < 0 || marks > sub.assignment.maxMarks) return bad(res, `Marks must be between 0 and ${sub.assignment.maxMarks}`);
  Object.assign(sub, { marks, feedback: req.body.feedback, gradedAt: new Date(), gradedBy: req.user._id });
  await sub.save();
  res.json(sub);
}));

/* ================= ONE COURSE (detail page) ================= */
router.get('/:id', wrap(async (req, res) => {
  const u = req.user;
  const c = await Course.findById(req.params.id).populate('trainer', 'name email').populate('students', 'name email userId').lean();
  if (!c) return bad(res, 'Course not found', 404);
  if (!isMember(u, c)) return bad(res, 'You do not have access to this course', 403);

  const [sessions, assignments, materials] = await Promise.all([
    Session.find({ course: c._id }).sort('startTime').lean(), Assignment.find({ course: c._id }).sort('createdAt').lean(), Material.find({ course: c._id }).sort('-createdAt').lean(),
  ]);
  const base = (s) => ({ _id: s._id, title: s.title, startTime: s.startTime, endTime: endTime(s), durationMinutes: s.durationMinutes, provider: s.provider, status: statusOf(s), joinable: joinable(s), recordings: s.recordings || [], hasRecording: s.recordings && s.recordings.length > 0 });
  const out = { course: c, assignments, materials, rules: { attendPercent: env.attendMinPercent, passPercent: env.passPercent, joinEarlyMinutes: env.joinEarlyMin } };

  if (u.role === 'student') {
    delete out.course.students;
    const att = await Attendance.find({ course: c._id, student: u._id }).lean();
    const map = new Map(att.map((a) => [String(a.session), a]));
    out.sessions = sessions.map((s) => {
      const secs = Math.round(map.get(String(s._id))?.totalSeconds || 0);
      return { ...base(s), myAttendance: { minutes: Math.round(secs / 60), percent: pct(secs, s), counted: countsAsPresent(secs, s), measured: s.provider === 'jitsi' } };
    });
    out.submissions = await Submission.find({ student: u._id, assignment: { $in: assignments.map((a) => a._id) } }).lean();
    out.progress = await progressFor(c._id, u._id);
    const enrollment = await CourseEnrollment.findOne({ course: c._id, student: u._id }).select('approvedCourseCompletion').lean();
    out.approvedCourseCompletion = enrollment?.approvedCourseCompletion || 0;
    out.certificate = await Certificate.findOne({ student: u._id, course: c._id }).lean();
  } else {
    const counts = await Attendance.aggregate([{ $match: { course: c._id } }, { $group: { _id: '$session', n: { $sum: 1 } } }]);
    const cm = new Map(counts.map((x) => [String(x._id), x.n]));
    out.sessions = sessions.map((s) => ({ ...base(s), meetingLink: s.meetingLink, attendeeCount: cm.get(String(s._id)) || 0 }));
    const enrollments = await CourseEnrollment.find({ course: c._id }).select('student approvedCourseCompletion').lean();
    const approvalByStudent = new Map(enrollments.map((enrollment) => [String(enrollment.student), enrollment.approvedCourseCompletion]));
    out.studentsProgress = await Promise.all(c.students.map(async (s) => ({
      student: s,
      progress: await progressFor(c._id, s._id),
      approvedCourseCompletion: approvalByStudent.get(String(s._id)) || 0,
    })));
  }
  res.json(out);
}));

module.exports = router;

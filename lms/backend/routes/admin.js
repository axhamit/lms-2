const router = require('express').Router();
const env = require('../config/env');
const { User, Course, Session, Attendance, Assignment, Submission, Certificate } = require('../models');
const { protect, allow, wrap } = require('../middleware/auth');
const { statusOf } = require('../utils/sessions');

router.use(protect, allow('admin'));

router.get('/dashboard', wrap(async (req, res) => {
  const [students, trainers, courses, sessions, assignments, certificates] = await Promise.all([
    User.find({ role: 'student' }).select('name email userId active').sort('name').lean(),
    User.countDocuments({ role: 'trainer', active: true }),
    Course.find().populate('trainer', 'name email userId').populate('students', 'name email userId active').sort('title').lean(),
    Session.find().sort('startTime').lean(),
    Assignment.find().sort('dueDate').lean(),
    Certificate.countDocuments(),
  ]);
  const courseIds = courses.map((course) => course._id);
  const assignmentIds = assignments.map((assignment) => assignment._id);
  const [attendance, submissions] = await Promise.all([
    Attendance.find({ course: { $in: courseIds } }).select('course session student totalSeconds').lean(),
    Submission.find({ assignment: { $in: assignmentIds } })
      .select('assignment student submittedAt marks gradedAt')
      .populate('student', 'name email userId')
      .lean(),
  ]);

  const sessionsByCourse = new Map();
  const assignmentsByCourse = new Map();
  const coursesById = new Map(courses.map((course) => [String(course._id), course]));
  const attendanceByStudentSession = new Map();
  const submissionsByAssignmentStudent = new Map();
  const studentCourses = new Map(students.map((student) => [String(student._id), []]));

  for (const session of sessions) {
    const key = String(session.course);
    sessionsByCourse.set(key, [...(sessionsByCourse.get(key) || []), session]);
  }
  for (const assignment of assignments) {
    const key = String(assignment.course);
    assignmentsByCourse.set(key, [...(assignmentsByCourse.get(key) || []), assignment]);
  }
  for (const record of attendance) {
    attendanceByStudentSession.set(`${record.student}:${record.session}`, record.totalSeconds || 0);
  }
  for (const submission of submissions) {
    submissionsByAssignmentStudent.set(`${submission.assignment}:${submission.student?._id}`, submission);
  }

  const courseProgress = new Map();
  for (const course of courses) {
    const courseSessions = sessionsByCourse.get(String(course._id)) || [];
    const courseAssignments = assignmentsByCourse.get(String(course._id)) || [];
    for (const student of course.students) {
      const studentId = String(student._id);
      const attended = courseSessions.filter((session) => {
        const seconds = attendanceByStudentSession.get(`${studentId}:${session._id}`) || 0;
        return seconds >= (session.durationMinutes * 60 * env.attendMinPercent) / 100;
      }).length;
      const assignmentsDone = courseAssignments.filter((assignment) => {
        const submission = submissionsByAssignmentStudent.get(`${assignment._id}:${studentId}`);
        return submission && (env.passPercent === 0 || (
          submission.gradedAt && (submission.marks / assignment.maxMarks) * 100 >= env.passPercent
        ));
      }).length;
      const total = courseSessions.length + courseAssignments.length;
      const progress = {
        attended,
        totalSessions: courseSessions.length,
        assignmentsDone,
        totalAssignments: courseAssignments.length,
        percent: total ? Math.round(((attended + assignmentsDone) / total) * 100) : 0,
      };
      progress.completed = total > 0 && progress.percent === 100;
      courseProgress.set(`${course._id}:${studentId}`, progress);
      studentCourses.get(studentId)?.push({
        _id: course._id,
        title: course.title,
        trainer: course.trainer?.name || 'Not assigned',
        ...progress,
        assignmentStatuses: courseAssignments.map((assignment) => {
          const submission = submissionsByAssignmentStudent.get(`${assignment._id}:${studentId}`);
          let status = 'Not submitted';
          if (submission?.gradedAt) {
            const passed = env.passPercent === 0 || (submission.marks / assignment.maxMarks) * 100 >= env.passPercent;
            status = `${passed ? 'Passed' : 'Below passing score'} · ${submission.marks}/${assignment.maxMarks}`;
          } else if (submission) {
            status = 'Submitted · awaiting grade';
          }
          return { _id: assignment._id, title: assignment.title, status };
        }),
      });
    }
  }

  const classesReport = sessions.map((session) => {
    const course = coursesById.get(String(session.course));
    return {
      _id: session._id,
      title: session.title,
      startTime: session.startTime,
      durationMinutes: session.durationMinutes,
      status: statusOf(session),
      course: course ? { _id: course._id, title: course.title } : null,
      trainer: course?.trainer?.name || 'Not assigned',
      hasRecording: session.recordings && session.recordings.length > 0,
    };
  });
  const assignmentsReport = assignments.map((assignment) => {
    const course = coursesById.get(String(assignment.course));
    const assignmentSubmissions = submissions.filter((submission) => String(submission.assignment) === String(assignment._id));
    return {
      _id: assignment._id,
      title: assignment.title,
      dueDate: assignment.dueDate,
      maxMarks: assignment.maxMarks,
      course: course ? { _id: course._id, title: course.title } : null,
      trainer: course?.trainer?.name || 'Not assigned',
      submitted: assignmentSubmissions.length,
      graded: assignmentSubmissions.filter((submission) => submission.gradedAt).length,
      submissions: assignmentSubmissions.map((submission) => ({
        student: submission.student,
        submittedAt: submission.submittedAt,
        marks: submission.marks,
        graded: !!submission.gradedAt,
      })),
      students: (course?.students || []).map((student) => ({
        _id: student._id,
        name: student.name,
        userId: student.userId,
        status: (() => {
          const submission = submissionsByAssignmentStudent.get(`${assignment._id}:${student._id}`);
          if (!submission) return 'Not submitted';
          return submission.gradedAt ? `Graded · ${submission.marks}/${assignment.maxMarks}` : 'Submitted · awaiting grade';
        })(),
      })),
    };
  });

  const now = new Date();
  res.json({
    stats: {
      students: students.filter((student) => student.active).length,
      trainers,
      courses: courses.length,
      classes: sessions.length,
      upcoming: sessions.filter((session) => new Date(session.startTime) > now).length,
      certificates,
      toGrade: submissions.filter((submission) => !submission.gradedAt).length,
    },
    students: students.map((student) => ({
      ...student,
      courses: studentCourses.get(String(student._id)) || [],
    })),
    courses: courses.map((course) => ({
      _id: course._id,
      title: course.title,
      trainer: course.trainer?.name || 'Not assigned',
      students: course.students.length,
      completed: course.students.filter((student) => courseProgress.get(`${course._id}:${student._id}`)?.completed).length,
    })),
    classes: classesReport,
    assignments: assignmentsReport,
  });
}));

router.get('/stats', wrap(async (req, res) => {
  const [students, trainers, courses, classes, upcoming, certificates, toGrade] = await Promise.all([
    User.countDocuments({ role: 'student', active: true }), User.countDocuments({ role: 'trainer', active: true }),
    Course.countDocuments(), Session.countDocuments(), Session.countDocuments({ startTime: { $gt: new Date() } }),
    Certificate.countDocuments(), Submission.countDocuments({ gradedAt: { $exists: false } }),
  ]);
  res.json({ students, trainers, courses, classes, upcoming, certificates, toGrade });
}));

module.exports = router;

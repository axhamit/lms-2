const env = require('../config/env');
const { Session, Assignment, Submission, Attendance } = require('../models');
const { statusOf } = require('./sessions');

/**
 * Learning progress = (classes attended + assignments done) / (all classes + all assignments)
 *  - class counts when the student stayed >= ATTEND_MIN_PERCENT of the class time
 *  - assignment counts when submitted (PASS_PERCENT=0) or graded with score >= PASS_PERCENT
 * This activity-based metric does not represent approved course completion.
 */
module.exports = async function progressFor(courseId, studentId) {
  const [sessions, assignments, att] = await Promise.all([
    Session.find({ course: courseId }).select('durationMinutes startTime').lean(),
    Assignment.find({ course: courseId }).select('maxMarks').lean(),
    Attendance.find({ course: courseId, student: studentId }).select('session totalSeconds').lean(),
  ]);
  const attMap = new Map(att.map((a) => [String(a.session), a.totalSeconds]));
  let attended = 0, completedClasses = 0, seconds = 0;
  for (const s of sessions) {
    const secs = attMap.get(String(s._id)) || 0;
    seconds += secs;
    if (secs >= (s.durationMinutes * 60 * env.attendMinPercent) / 100) {
      attended++;
      if (statusOf(s) === 'completed') completedClasses++;
    }
  }
  const subs = await Submission.find({ student: studentId, assignment: { $in: assignments.map((a) => a._id) } }).select('assignment marks gradedAt').lean();
  const maxMap = new Map(assignments.map((a) => [String(a._id), a.maxMarks]));
  const assignmentsDone = subs.filter((s) =>
    env.passPercent === 0 || (s.gradedAt && (s.marks / maxMap.get(String(s.assignment))) * 100 >= env.passPercent)).length;

  const total = sessions.length + assignments.length;
  const percent = total ? Math.round(((attended + assignmentsDone) / total) * 100) : 0;
  return {
    attended, completedClasses, totalSessions: sessions.length,
    assignmentsDone, totalAssignments: assignments.length,
    minutesInClass: Math.round(seconds / 60),
    percent,
  };
};

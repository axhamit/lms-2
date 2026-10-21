const cron = require('node-cron');
const env = require('../config/env');
const { Session, Course } = require('../models');
const { sendMail } = require('../utils/mailer');

async function run() {
  const now = new Date();
  const until = new Date(now.getTime() + env.reminderMin * 60000);
  const due = await Session.find({ reminderSent: false, startTime: { $gt: now, $lte: until } }).select('_id').lean();
  for (const { _id } of due) {
    // atomic claim so only one server instance sends this reminder
    const s = await Session.findOneAndUpdate({ _id, reminderSent: false }, { reminderSent: true });
    if (!s) continue;
    const course = await Course.findById(s.course).populate('students', 'name email active').populate('trainer', 'name email');
    if (!course) continue;
    const when = new Date(s.startTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
    const people = [...course.students.map((u) => ({ u, role: 'student' })), ...(course.trainer ? [{ u: course.trainer, role: 'trainer' }] : [])];
    await Promise.allSettled(people.filter(({ u }) => u.email && u.active !== false).map(({ u, role }) => sendMail({
      to: u.email,
      subject: `Reminder: "${s.title}" starts at ${when}`,
      text: `Hi ${u.name}, your class "${s.title}" (${course.title}) starts at ${when} IST. Join: ${env.clientUrl}/${role}/classes/${s._id}`,
      html: `<p>Hi ${u.name},</p><p>Your class <b>${s.title}</b> (${course.title}) starts at <b>${when} IST</b> and lasts ${s.durationMinutes} minutes.</p>
             <p><a href="${env.clientUrl}/${role}/courses/${course._id}">Open the course</a> to join. Joining opens ${env.joinEarlyMin} minutes before start.</p>`,
    })));
    console.log(`Reminder sent for session ${s._id} to ${people.length} people`);
  }
}

exports.start = () => {
  cron.schedule('* * * * *', () => run().catch((e) => console.error('Reminder job error:', e.message)));
  console.log('Reminder job started');
};

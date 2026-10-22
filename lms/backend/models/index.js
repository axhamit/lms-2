const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Schema } = mongoose;
const ref = (name, extra = {}) => ({ type: Schema.Types.ObjectId, ref: name, ...extra });
const fileSchema = new Schema({ key: String, name: String, size: Number, contentType: String }, { _id: false });

/* ---------- User ---------- */
const userSchema = new Schema({
  userId: { type: String, unique: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'trainer', 'student'], default: 'student', index: true },
  active: { type: Boolean, default: true },
  mustChangePassword: { type: Boolean, default: true },   // true for admin-issued passwords
  tokenVersion: { type: Number, default: 0 },             // bump to log out all devices
  resetTokenHash: { type: String, select: false },
  resetExpires: { type: Date, select: false },
  lastLoginAt: Date,
}, { timestamps: true });

userSchema.pre('validate', function (next) {
  if (!this.userId) {
    const prefix = { admin: 'ADM', trainer: 'TRN', student: 'STU' }[this.role];
    this.userId = prefix + crypto.randomInt(100000, 999999);
  }
  next();
});
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 11);
  next();
});
userSchema.methods.matches = function (plain) { return bcrypt.compare(plain, this.password); };

/* ---------- Course ---------- */
const courseSchema = new Schema({
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, maxlength: 1000 },
  trainer: ref('User', { index: true }),
  students: [ref('User')],
}, { timestamps: true });
courseSchema.index({ students: 1 });

/* ---------- Course enrollment approval ---------- */
const courseEnrollmentSchema = new Schema({
  course: ref('Course', { required: true }),
  student: ref('User', { required: true }),
  approvedCourseCompletion: { type: Number, default: 0, min: 0, max: 100 },
}, { timestamps: true });
courseEnrollmentSchema.index({ course: 1, student: 1 }, { unique: true });

/* ---------- Live class ---------- */
const sessionSchema = new Schema({
  course: ref('Course', { required: true }),
  trainer: ref('User', { index: true }),
  title: { type: String, required: true, maxlength: 150 },
  startTime: { type: Date, required: true },
  durationMinutes: { type: Number, default: 60, min: 5, max: 480 },
  provider: { type: String, enum: ['jitsi', 'external'], default: 'jitsi' },
  roomName: String,                    // jitsi room (hidden from students until they join)
  meetingLink: String,                 // only for provider = external (Zoom / Meet / Teams)
  reminderSent: { type: Boolean, default: false },
  recordings: [{ key: String, name: String, size: Number, durationSeconds: Number, source: String, createdAt: { type: Date, default: Date.now }, _id: false }],
  createdBy: ref('User'),
}, { timestamps: true });
sessionSchema.index({ course: 1, startTime: 1 });
sessionSchema.index({ reminderSent: 1, startTime: 1 });

/* ---------- Attendance (time spent in class) ---------- */
const attendanceSchema = new Schema({
  session: ref('Session', { required: true }),
  course: ref('Course', { required: true, index: true }),
  student: ref('User', { required: true }),
  joins: { type: Number, default: 0 },
  totalSeconds: { type: Number, default: 0 },
  firstJoinedAt: Date,
  lastSeenAt: Date,
  manual: { type: Boolean, default: false },   // external link: time cannot be measured
});
attendanceSchema.index({ session: 1, student: 1 }, { unique: true });

/* ---------- Assignments ---------- */
const assignmentSchema = new Schema({
  course: ref('Course', { required: true, index: true }),
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, maxlength: 5000 },
  dueDate: Date,
  maxMarks: { type: Number, default: 100, min: 1 },
}, { timestamps: true });

const submissionSchema = new Schema({
  assignment: ref('Assignment', { required: true }),
  student: ref('User', { required: true }),
  content: { type: String, maxlength: 20000 },
  files: [fileSchema],
  submittedAt: Date,
  late: { type: Boolean, default: false },
  marks: Number,
  feedback: { type: String, maxlength: 2000 },
  gradedAt: Date,
  gradedBy: ref('User'),
}, { timestamps: true });
submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

/* ---------- Study material ---------- */
const materialSchema = new Schema({
  course: ref('Course', { required: true, index: true }),
  title: { type: String, required: true, maxlength: 150 },
  file: fileSchema,
  uploadedBy: ref('User'),
}, { timestamps: true });

/* ---------- Certificate ---------- */
const certificateSchema = new Schema({
  certId: { type: String, unique: true },
  student: ref('User', { required: true }),
  course: ref('Course', { required: true }),
  issuedAt: { type: Date, default: Date.now },
});
certificateSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = {
  User: mongoose.model('User', userSchema),
  Course: mongoose.model('Course', courseSchema),
  CourseEnrollment: mongoose.model('CourseEnrollment', courseEnrollmentSchema),
  Session: mongoose.model('Session', sessionSchema),
  Attendance: mongoose.model('Attendance', attendanceSchema),
  Assignment: mongoose.model('Assignment', assignmentSchema),
  Submission: mongoose.model('Submission', submissionSchema),
  Material: mongoose.model('Material', materialSchema),
  Certificate: mongoose.model('Certificate', certificateSchema),
};

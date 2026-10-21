const same = (a, b) => String(a?._id || a) === String(b?._id || b);
const isOwner = (u, c) => u.role === 'admin' || (u.role === 'trainer' && same(c.trainer, u._id));
const isMember = (u, c) => isOwner(u, c) || (u.role === 'student' && c.students.some((s) => same(s, u._id)));
module.exports = { same, isOwner, isMember };

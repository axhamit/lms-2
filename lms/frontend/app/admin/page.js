'use client';
import { Fragment, useCallback, useEffect, useState } from 'react';
import Shell from '../../components/Shell';
import { LoadingSpinner, EmptyState } from '../../components/ui';
import { api, fmt } from '../../lib/api';

export default function Admin() {
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [dashboardErr, setDashboardErr] = useState('');
  const [loading, setLoading] = useState(true);
  const loadDashboard = useCallback(() => {
    setDashboardErr('');
    setLoading(true);
    return api('/admin/dashboard')
      .then(setDashboard)
      .catch((e) => setDashboardErr(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { loadDashboard(); }, [loadDashboard]);

  return (
    <Shell role="admin">
      <div className="tabs">
        {[['overview', 'Overview'], ['students', 'Students'], ['classes', 'Classes'], ['assignments', 'Assignments'], ['users', 'Users'], ['courses', 'Courses']].map(([k, label]) => (
          <button key={k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {dashboardErr && <p className="err">{dashboardErr}</p>}
      {tab === 'overview' && <Overview dashboard={dashboard} onNavigate={setTab} loading={loading} />}
      {tab === 'students' && <Students students={dashboard?.students} loading={loading} reload={loadDashboard} />}
      {tab === 'classes' && <Classes classes={dashboard?.classes} reload={loadDashboard} loading={loading} />}
      {tab === 'assignments' && <Assignments assignments={dashboard?.assignments} reload={loadDashboard} loading={loading} />}
      {tab === 'users' && <Users />}
      {tab === 'courses' && <Courses />}
    </Shell>
  );
}

function Overview({ dashboard, onNavigate, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
        <LoadingSpinner size="large" />
      </div>
    );
  }
  if (!dashboard) return <p className="muted">Loading admin overview…</p>;
  const { stats } = dashboard;
  const items = [
    ['Active students', stats.students, 'students'],
    ['Active trainers', stats.trainers, 'users'],
    ['Courses', stats.courses, 'courses'],
    ['Classes scheduled', stats.classes, 'classes'],
    ['Upcoming classes', stats.upcoming, 'classes'],
    ['Certificates issued', stats.certificates, 'students'],
    ['Submissions to grade', stats.toGrade, 'assignments'],
  ];

  const classesWithoutRecordings = dashboard.classes?.filter(c => c.status === 'completed' && !c.hasRecording) || [];

  return (
    <>
      <p className="muted">Select a total to open its full report. Student details include course, class, and assignment completion.</p>
      <div className="stats">
        {items.map(([label, value, target]) => (
          <button className="stat stat-button" key={label} onClick={() => onNavigate(target)} aria-label={`View ${label}`}>
            <b>{value}</b><span>{label} · View details</span>
          </button>
        ))}
      </div>

      {classesWithoutRecordings.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--gold)', background: 'var(--gold-2)' }}>
          <h3 style={{ color: '#6b5200', margin: '0 0 8px' }}>⚠️ Classes without recordings</h3>
          <p className="muted" style={{ color: '#8b6a00', margin: '0 0 12px' }}>
            {classesWithoutRecordings.length} completed class(es) missing recordings. Students cannot view these recordings.
          </p>
          <div className="scroll">
            <table>
              <thead><tr><th>Class</th><th>Course</th><th>Trainer</th><th>Date</th></tr></thead>
              <tbody>
                {classesWithoutRecordings.map((c) => (
                  <tr key={c._id}>
                    <td><b>{c.title}</b></td>
                    <td>{c.course?.title || 'Course removed'}</td>
                    <td>{c.trainer}</td>
                    <td>{fmt(c.startTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2>Admin-approved course completion</h2>
      <div className="scroll"><table>
        <thead><tr><th>Course</th><th>Trainer</th><th>Students</th><th>Completed</th></tr></thead>
        <tbody>
          {dashboard.courses.map((course) => (
            <tr key={course._id}><td><b>{course.title}</b></td><td>{course.trainer}</td><td>{course.students}</td><td>{course.completed}</td></tr>
          ))}
          {!dashboard.courses.length && <tr><td colSpan="4" className="muted">No courses yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Students({ students, loading, reload }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [completionDrafts, setCompletionDrafts] = useState({});
  const [actionMessage, setActionMessage] = useState('');
  const [busyKey, setBusyKey] = useState('');
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
        <LoadingSpinner size="large" />
      </div>
    );
  }
  if (!students) return <p className="muted">Loading students…</p>;
  const visible = students.filter((student) => `${student.name} ${student.email} ${student.userId}`.toLowerCase().includes(query.toLowerCase()));
  const saveCompletion = async (student, course) => {
    const key = `${student._id}:${course._id}`;
    const rawValue = completionDrafts[key] ?? course.approvedCourseCompletion;
    const value = Number(rawValue);
    if (rawValue === '' || !Number.isFinite(value) || value < 0 || value > 100) {
      setActionMessage('Approved course completion must be a number from 0 to 100.');
      return;
    }
    setBusyKey(key);
    setActionMessage('');
    try {
      await api(`/admin/courses/${course._id}/students/${student._id}/completion`, {
        method: 'PATCH',
        body: { approvedCourseCompletion: value },
      });
      setCompletionDrafts((drafts) => ({ ...drafts, [key]: value }));
      await reload();
      setActionMessage(`Approved completion updated for ${student.name} · ${course.title}.`);
    } catch (error) {
      setActionMessage(error.message);
    } finally {
      setBusyKey('');
    }
  };
  const generateCertificate = async (student, course) => {
    const key = `${student._id}:${course._id}`;
    setBusyKey(key);
    setActionMessage('');
    try {
      await api(`/certificates/generate/${course._id}/${student._id}`, { method: 'POST' });
      await reload();
      setActionMessage(`Certificate generated for ${student.name} · ${course.title}.`);
    } catch (error) {
      setActionMessage(error.message);
    } finally {
      setBusyKey('');
    }
  };
  return (
    <>
      {actionMessage && <p className="muted" role="status">{actionMessage}</p>}
      <div className="row" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>All students ({students.length})</h3>
        <input aria-label="Search students" placeholder="Search name, email or ID" value={query} onChange={(e) => setQuery(e.target.value)} style={{ margin: 0, width: 260 }} />
      </div>
      <div className="scroll"><table>
        <thead><tr><th>Student</th><th>Email</th><th>Status</th><th>Courses</th><th>Course progress</th><th></th></tr></thead>
        <tbody>
          {visible.map((student) => (
            <Fragment key={student._id}>
              <tr>
                <td><b>{student.name}</b><div className="muted">{student.userId}</div></td>
                <td>{student.email}</td>
                <td><span className={student.active ? 'pill ok' : 'pill off'}>{student.active ? 'Active' : 'Disabled'}</span></td>
                <td>{student.courses.length}</td>
                <td>{student.courses.filter((course) => course.approvedCourseCompletion === 100).length} approved complete · {student.courses.filter((course) => course.approvedCourseCompletion !== 100).length} in progress</td>
                <td><button className="btn small ghost" onClick={() => setExpanded(expanded === student._id ? null : student._id)}>{expanded === student._id ? 'Hide details' : 'View details'}</button></td>
              </tr>
              {expanded === student._id && (
                <tr><td colSpan="6">
                  {!student.courses.length ? <span className="muted">This student is not enrolled in any course.</span> : student.courses.map((course) => (
                    <section className="card" key={course._id}>
                      <div className="row">
                        <b>{course.title}</b>
                        <span className={course.approvedCourseCompletion === 100 ? 'pill ok' : 'pill wait'}>
                          {course.approvedCourseCompletion}% approved · {course.approvedCourseCompletion === 100 ? 'Course complete' : 'In progress'}
                        </span>
                      </div>
                      <p className="muted">Trainer: {course.trainer} · Learning progress: {course.percent}% · Classes attended: {course.attended}/{course.totalSessions} · Completed classes attended: {course.completedClasses} · Assignments complete: {course.assignmentsDone}/{course.totalAssignments}</p>
                      <div className="row">
                        <label>
                          Admin-approved completion
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            aria-label={`Approved completion for ${student.name} in ${course.title}`}
                            value={completionDrafts[`${student._id}:${course._id}`] ?? course.approvedCourseCompletion}
                            onChange={(event) => setCompletionDrafts((drafts) => ({
                              ...drafts,
                              [`${student._id}:${course._id}`]: event.target.value,
                            }))}
                            style={{ width: 120, margin: '0 8px' }}
                          />
                          %
                        </label>
                        <button
                          className="btn small"
                          disabled={busyKey === `${student._id}:${course._id}`}
                          onClick={() => saveCompletion(student, course)}
                        >Save approval</button>
                        {course.certificate
                          ? <span className="pill ok">Certificate issued · {course.certificate.certId}</span>
                          : course.approvedCourseCompletion === 100
                            ? <button
                              className="btn small gold"
                              disabled={busyKey === `${student._id}:${course._id}`}
                              onClick={() => generateCertificate(student, course)}
                            >Generate Certificate</button>
                            : <span className="muted">Certificate not generated</span>}
                      </div>
                      {!!course.assignmentStatuses.length && <div className="scroll"><table>
                        <thead><tr><th>Assignment</th><th>Status</th></tr></thead>
                        <tbody>{course.assignmentStatuses.map((assignment) => <tr key={assignment._id}><td>{assignment.title}</td><td>{assignment.status}</td></tr>)}</tbody>
                      </table></div>}
                    </section>
                  ))}
                </td></tr>
              )}
            </Fragment>
          ))}
          {!visible.length && <tr><td colSpan="6" className="muted">No students found.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Classes({ classes, reload, loading }) {
  const [err, setErr] = useState('');
  const [scheduleErr, setScheduleErr] = useState('');
  const [courses, setCourses] = useState(null);
  const [trainers, setTrainers] = useState([]);
  const [f, setF] = useState({ courseId: '', trainer: '', title: '', startTime: '', durationMinutes: 60, provider: 'jitsi', meetingLink: '' });
  useEffect(() => {
    api('/courses').then(setCourses).catch((e) => setScheduleErr(e.message));
    api('/users/options?role=trainer').then(setTrainers).catch((e) => setScheduleErr(e.message));
  }, []);
  const schedule = async (e) => {
    e.preventDefault();
    setScheduleErr('');
    try {
      await api(`/courses/${f.courseId}/sessions`, {
        method: 'POST',
        body: { ...f, startTime: new Date(f.startTime).toISOString(), durationMinutes: Number(f.durationMinutes) },
      });
      setF({ courseId: '', trainer: '', title: '', startTime: '', durationMinutes: 60, provider: 'jitsi', meetingLink: '' });
      await reload();
    } catch (x) { setScheduleErr(x.message); }
  };
  const del = async (session) => {
    if (!confirm(`Delete class "${session.title}"? Attendance and its recordings will also be removed.`)) return;
    setErr('');
    try {
      await api(`/courses/sessions/${session._id}`, { method: 'DELETE' });
      await reload();
    } catch (e) { setErr(e.message); }
  };
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
        <LoadingSpinner size="large" />
      </div>
    );
  }
  if (!classes) return <p className="muted">Loading classes…</p>;

  const classesWithoutRecordings = classes.filter(c => c.status === 'completed' && !c.hasRecording);
  const selectedCourse = courses?.find((course) => course._id === f.courseId);

  return (
    <>
      <form className="card grid" onSubmit={schedule}>
        <h3>Schedule a class</h3>
        <select value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })} required>
          <option value="">Choose course</option>
          {courses?.map((course) => <option key={course._id} value={course._id}>{course.title}</option>)}
        </select>
        {selectedCourse && (
          <p className="muted full">
            {selectedCourse.students?.length || 0} enrolled student(s). Students enrolled in this course automatically receive class access and schedule notifications.
          </p>
        )}
        <select value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })} required>
          <option value="">Choose trainer for this class</option>
          {trainers.map((trainer) => <option key={trainer._id} value={trainer._id}>{trainer.name} ({trainer.userId})</option>)}
        </select>
        <input placeholder="Class title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        <input type="datetime-local" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} required />
        <input type="number" min="5" max="480" value={f.durationMinutes} onChange={(e) => setF({ ...f, durationMinutes: e.target.value })} title="Duration in minutes" placeholder="Minutes" required />
        <select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>
          <option value="jitsi">Video room inside this portal (tracks time)</option>
          <option value="external">External link (Zoom / Meet / Teams)</option>
        </select>
        {f.provider === 'external' && (
          <input className="full" placeholder="https://…" value={f.meetingLink} onChange={(e) => setF({ ...f, meetingLink: e.target.value })} required />
        )}
        <button className="btn" disabled={!courses?.length}>Schedule class</button>
        {!trainers.length && !scheduleErr && <p className="muted">Create an active trainer account before scheduling a class.</p>}
        {scheduleErr && <p className="err">{scheduleErr}</p>}
        {courses && !courses.length && !scheduleErr && <p className="muted">Create a course before scheduling a class.</p>}
      </form>
      <h3>All scheduled classes ({classes.length})</h3>
      {classesWithoutRecordings.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--gold)', background: 'var(--gold-2)', marginBottom: 16 }}>
          <p style={{ color: '#6b5200', margin: 0 }}>
            ⚠️ {classesWithoutRecordings.length} completed class(es) missing recordings
          </p>
        </div>
      )}
      {err && <p className="err">{err}</p>}
      <div className="scroll"><table>
        <thead><tr><th>Class</th><th>Course</th><th>Trainer</th><th>Schedule</th><th>Duration</th><th>Status</th><th>Recording</th><th></th></tr></thead>
        <tbody>
          {classes.map((session) => (
            <tr key={session._id}>
              <td><b>{session.title}</b></td><td>{session.course?.title || 'Course removed'}</td><td>{session.trainer}</td>
              <td>{fmt(session.startTime)}</td><td>{session.durationMinutes} min</td><td>{session.status}</td>
              <td>{session.status === 'completed' ? (session.hasRecording ? <span className="pill ok">Uploaded</span> : <span className="pill off">Missing</span>) : '—'}</td>
              <td><button className="btn small danger" onClick={() => del(session)}>Delete</button></td>
            </tr>
          ))}
          {!classes.length && <tr><td colSpan="8" className="muted">No classes scheduled.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Assignments({ assignments, reload, loading }) {
  const [expanded, setExpanded] = useState(null);
  const [err, setErr] = useState('');
  const del = async (assignment) => {
    if (!confirm(`Delete "${assignment.title}" and all student submissions?`)) return;
    setErr('');
    try {
      await api(`/courses/assignments/${assignment._id}`, { method: 'DELETE' });
      await reload();
      setExpanded(null);
    } catch (e) { setErr(e.message); }
  };
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
        <LoadingSpinner size="large" />
      </div>
    );
  }
  if (!assignments) return <p className="muted">Loading assignments…</p>;
  return (
    <>
      <h3>All course assignments ({assignments.length})</h3>
      {err && <p className="err">{err}</p>}
      <div className="scroll"><table>
        <thead><tr><th>Assignment</th><th>Course</th><th>Trainer</th><th>Due</th><th>Submitted</th><th>Graded</th><th></th></tr></thead>
        <tbody>
          {assignments.map((assignment) => (
            <Fragment key={assignment._id}>
              <tr>
                <td><b>{assignment.title}</b></td><td>{assignment.course?.title || 'Course removed'}</td><td>{assignment.trainer}</td>
                <td>{assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No due date'}</td>
                <td>{assignment.submitted}/{assignment.students.length}</td><td>{assignment.graded}/{assignment.submitted}</td>
                <td className="acts">
                  <button className="btn small ghost" onClick={() => setExpanded(expanded === assignment._id ? null : assignment._id)}>{expanded === assignment._id ? 'Hide students' : 'Student status'}</button>
                  <button className="btn small danger" onClick={() => del(assignment)}>Delete</button>
                </td>
              </tr>
              {expanded === assignment._id && (
                <tr><td colSpan="7"><div className="scroll"><table>
                  <thead><tr><th>Student</th><th>ID</th><th>Submission status</th></tr></thead>
                  <tbody>{assignment.students.map((student) => <tr key={student._id}><td>{student.name}</td><td>{student.userId}</td><td>{student.status}</td></tr>)}</tbody>
                </table></div></td></tr>
              )}
            </Fragment>
          ))}
          {!assignments.length && <tr><td colSpan="7" className="muted">No assignments created yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

function Users() {
  const empty = { name: '', email: '', password: '', role: 'student', courseId: '' };
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [f, setF] = useState(empty);
  const [courses, setCourses] = useState([]);
  const [courseErr, setCourseErr] = useState('');
  const [err, setErr] = useState('');
  const [notice, setNotice] = useState('');
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(() => api(`/users?page=${page}&role=${role}&q=${encodeURIComponent(q)}`).then(setData), [page, role, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => {
    api('/courses').then(setCourses).catch((e) => setCourseErr(e.message));
  }, []);

  const add = async (e) => {
    e.preventDefault(); setErr(''); setNotice('');
    try {
      const created = await api('/users', { method: 'POST', body: f });
      setF(empty);
      api('/courses').then(setCourses).catch((e) => setCourseErr(e.message));
      setNotice(created.emailSent
        ? `Account created and welcome email sent to ${created.email}.`
        : `Account created, but the welcome email could not be sent. Check the backend SMTP settings and logs.`);
      await load();
    } catch (x) { setErr(x.message); }
  };
  const toggle = async (u) => { try { await api(`/users/${u._id}`, { method: 'PATCH', body: { active: !u.active } }); load(); } catch (x) { alert(x.message); } };
  const reset = async (u) => {
    const p = prompt(`New temporary password for ${u.name} (8+ characters):`);
    if (p) { try { await api(`/users/${u._id}`, { method: 'PATCH', body: { password: p } }); alert('Password changed. The user must set a new one at next login.'); } catch (x) { alert(x.message); } }
  };
  const del = async (u) => { if (confirm(`Delete ${u.name}?`)) { try { await api(`/users/${u._id}`, { method: 'DELETE' }); load(); } catch (x) { alert(x.message); } } };

  return (
    <>
      <form className="card grid" onSubmit={add}>
        <h3>Create account</h3>
        <input placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
        <input placeholder="Temporary password (8+)" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, courseId: '' })}>
          <option value="student">Student</option><option value="trainer">Trainer</option><option value="admin">Admin</option>
        </select>
        {f.role !== 'admin' && (
          <select
            value={f.courseId}
            onChange={(e) => setF({ ...f, courseId: e.target.value })}
            aria-label={`Assign ${f.role} to a course`}
          >
            <option value="">No course assignment</option>
            {courses
              .filter((course) => f.role !== 'trainer' || !course.trainer)
              .map((course) => (
                <option key={course._id} value={course._id}>
                  {course.title}{f.role === 'student' ? ` (${course.students?.length || 0} students)` : ''}
                </option>
              ))}
          </select>
        )}
        {courseErr && <p className="err full" role="alert">Could not load courses: {courseErr}</p>}
        <button className="btn">Create account</button>
        {err && <p className="err">{err}</p>}
        {notice && <p className={notice.startsWith('Account created and') ? 'ok' : 'err'} role="status">{notice}</p>}
      </form>

      <div className="row" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>All users ({data.total})</h3>
        <div className="acts">
          <input placeholder="Search name, email or ID" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ margin: 0, width: 240 }} />
          <select value={role} onChange={(e) => { setRole(e.target.value); setPage(1); }} style={{ margin: 0, width: 140 }}>
            <option value="">Everyone</option><option value="student">Students</option><option value="trainer">Trainers</option><option value="admin">Admins</option>
          </select>
        </div>
      </div>
      <div className="scroll"><table>
        <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {data.items.map((u) => (
            <tr key={u._id}>
              <td><b>{u.userId}</b></td><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td>
              <td><span className={u.active ? 'pill ok' : 'pill off'}>{u.active ? 'Active' : 'Disabled'}</span></td>
              <td className="acts">
                <button className="btn small ghost" onClick={() => toggle(u)}>{u.active ? 'Disable' : 'Enable'}</button>
                <button className="btn small ghost" onClick={() => reset(u)}>Reset password</button>
                <button className="btn small danger" onClick={() => del(u)}>Delete</button>
              </td>
            </tr>
          ))}
          {!data.items.length && <tr><td colSpan="6" className="muted">No users found.</td></tr>}
        </tbody>
      </table></div>
      <div className="row" style={{ justifyContent: 'center', gap: 14, marginTop: 12 }}>
        <button className="btn small ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="muted">Page {data.page} of {data.pages}</span>
        <button className="btn small ghost" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}

function Courses() {
  const empty = { title: '', description: '', trainer: '', students: [] };
  const [courses, setCourses] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [f, setF] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [studentQuery, setStudentQuery] = useState('');
  const [studentPage, setStudentPage] = useState(1);
  const [studentData, setStudentData] = useState(null);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentErr, setStudentErr] = useState('');
  const [selectingAll, setSelectingAll] = useState(false);
  const [selectedStudentDetails, setSelectedStudentDetails] = useState({});
  const pageSize = 50;

  const load = () => api('/courses').then(setCourses);
  useEffect(() => { load(); api('/users/options?role=trainer').then(setTrainers); }, []);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      setStudentLoading(true);
      setStudentErr('');
      api(`/users?role=student&active=true&q=${encodeURIComponent(studentQuery)}&page=${studentPage}&limit=${pageSize}`)
        .then((data) => {
          if (current) {
            setStudentData(data);
            setSelectedStudentDetails((previous) => ({
              ...previous,
              ...Object.fromEntries(data.items.map((student) => [student._id, student])),
            }));
          }
        })
        .catch((e) => { if (current) setStudentErr(e.message); })
        .finally(() => { if (current) setStudentLoading(false); });
    }, studentQuery ? 250 : 0);
    return () => { current = false; clearTimeout(timer); };
  }, [studentQuery, studentPage]);

  const setStudentSelection = (ids, selected) => {
    setF((current) => {
      const next = new Set(current.students);
      ids.forEach((id) => selected ? next.add(id) : next.delete(id));
      return { ...current, students: Array.from(next) };
    });
  };
  const selectAllMatching = async () => {
    setSelectingAll(true);
    setStudentErr('');
    try {
      const ids = await api(`/users/student-ids?q=${encodeURIComponent(studentQuery)}`);
      setF((current) => ({ ...current, students: Array.from(new Set([...current.students, ...ids])) }));
    } catch (e) { setStudentErr(e.message); }
    finally { setSelectingAll(false); }
  };

  const save = async (e) => {
    e.preventDefault(); setErr('');
    try { await api(editing ? `/courses/${editing}` : '/courses', { method: editing ? 'PATCH' : 'POST', body: f }); setF(empty); setEditing(null); setSelectedStudentDetails({}); load(); }
    catch (x) { setErr(x.message); }
  };
  const edit = (c) => {
    setEditing(c._id);
    setF({ title: c.title, description: c.description || '', trainer: c.trainer?._id || '', students: c.students.map((s) => s._id) });
    setSelectedStudentDetails(Object.fromEntries(c.students.map((student) => [student._id, student])));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const cancelEdit = () => { setEditing(null); setF(empty); setSelectedStudentDetails({}); };
  const del = async (c) => { if (confirm(`Delete "${c.title}" with all its classes, assignments, files and certificates?`)) { await api(`/courses/${c._id}`, { method: 'DELETE' }); load(); } };
  const visibleStudents = studentData?.items || [];
  const selectedIds = new Set(f.students);
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((student) => selectedIds.has(student._id));

  return (
    <>
      <form className="card grid" onSubmit={save}>
        <h3>{editing ? 'Edit course' : 'Create course'}</h3>
        <input placeholder="Course title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        <input placeholder="Short description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <select value={f.trainer} onChange={(e) => setF({ ...f, trainer: e.target.value })}>
          <option value="">Choose trainer</option>
          {trainers.map((t) => <option key={t._id} value={t._id}>{t.name} ({t.userId})</option>)}
        </select>
        <section className="full student-picker" aria-label="Select course students">
          <div className="student-picker-header">
            <div>
              <h4>Students</h4>
              <p className="muted">{f.students.length.toLocaleString()} selected for this course</p>
            </div>
            <button type="button" className="btn small ghost" disabled={!f.students.length} onClick={() => setF({ ...f, students: [] })}>Clear selection</button>
          </div>
          <div className="student-picker-tools">
            <input
              type="search"
              aria-label="Search active students"
              placeholder="Search students by name, email or ID"
              value={studentQuery}
              onChange={(e) => { setStudentQuery(e.target.value); setStudentPage(1); }}
            />
            <button type="button" className="btn small ghost" disabled={selectingAll || !studentData?.total} onClick={selectAllMatching}>
              {selectingAll ? 'Adding students…' : `Add all ${studentData?.total?.toLocaleString() || 0} matching`}
            </button>
          </div>
          <div className="scroll student-picker-table">
            <table>
              <thead><tr>
                <th><input type="checkbox" aria-label="Select all students on this page" checked={allVisibleSelected} disabled={!visibleStudents.length || studentLoading} onChange={(e) => setStudentSelection(visibleStudents.map((student) => student._id), e.target.checked)} /></th>
                <th>Student ID</th><th>Name</th><th>Email</th><th>Course selection</th>
              </tr></thead>
              <tbody>
                {visibleStudents.map((student) => (
                  <tr key={student._id}>
                    <td><input type="checkbox" aria-label={`Select ${student.name}`} checked={selectedIds.has(student._id)} onChange={(e) => setStudentSelection([student._id], e.target.checked)} /></td>
                    <td><b>{student.userId}</b></td>
                    <td>{student.name}</td>
                    <td>{student.email}</td>
                    <td><button type="button" className={`btn small ${selectedIds.has(student._id) ? 'ghost' : ''}`} onClick={() => setStudentSelection([student._id], !selectedIds.has(student._id))}>{selectedIds.has(student._id) ? 'Remove' : 'Add'}</button></td>
                  </tr>
                ))}
                {!studentLoading && !visibleStudents.length && <tr><td colSpan="5" className="muted">No active students match this search.</td></tr>}
                {studentLoading && <tr><td colSpan="5" className="muted">Loading students…</td></tr>}
              </tbody>
            </table>
          </div>
          {studentErr && <p className="err" role="alert">{studentErr}</p>}
          <div className="student-picker-footer">
            <span className="muted">
              {studentData ? `${studentData.total.toLocaleString()} active students · Page ${studentData.page} of ${studentData.pages}` : 'Loading student list…'}
            </span>
            <div className="acts">
              <button type="button" className="btn small ghost" disabled={studentLoading || studentPage <= 1} onClick={() => setStudentPage((page) => page - 1)}>Previous</button>
              <button type="button" className="btn small ghost" disabled={studentLoading || !studentData || studentPage >= studentData.pages} onClick={() => setStudentPage((page) => page + 1)}>Next</button>
            </div>
          </div>
          {!!f.students.length && (
            <details className="student-picker-selected">
              <summary>View selected students ({f.students.length.toLocaleString()})</summary>
              <div className="student-picker-chips">
                {f.students.slice(0, 100).map((id) => {
                  const student = selectedStudentDetails[id];
                  return <span className="pill off" key={id}>{student ? `${student.name} (${student.userId})` : id}</span>;
                })}
                {f.students.length > 100 && <span className="muted">and {(f.students.length - 100).toLocaleString()} more</span>}
              </div>
            </details>
          )}
        </section>
        <div className="acts">
          <button className="btn">{editing ? 'Save changes' : 'Create course'}</button>
          {editing && <button type="button" className="btn ghost" onClick={cancelEdit}>Cancel</button>}
        </div>
        {err && <p className="err">{err}</p>}
      </form>

      <div className="scroll"><table>
        <thead><tr><th>Course</th><th>Trainer</th><th>Students</th><th></th></tr></thead>
        <tbody>
          {courses.map((c) => (
            <tr key={c._id}>
              <td><b>{c.title}</b><div className="muted">{c.description}</div></td>
              <td>{c.trainer?.name || <span className="muted">Not assigned</span>}</td><td>{c.students.length}</td>
              <td className="acts"><button className="btn small ghost" onClick={() => edit(c)}>Edit</button><button className="btn small danger" onClick={() => del(c)}>Delete</button></td>
            </tr>
          ))}
          {!courses.length && <tr><td colSpan="4" className="muted">No courses yet.</td></tr>}
        </tbody>
      </table></div>
    </>
  );
}

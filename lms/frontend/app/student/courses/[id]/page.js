'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Shell from '../../../../components/Shell';
import { Progress, StatusTag, LoadingSpinner, EmptyState } from '../../../../components/ui';
import Recordings from '../../../../components/Recordings';
import Materials from '../../../../components/Materials';
import { api, uploadFile, openFile, downloadCertificate, fmt, fmtSize } from '../../../../lib/api';

export default function StudentCourse() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('classes');
  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    api(`/courses/${id}`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Shell role="student">
      <div className="course-detail-header">
        <Link href="/student" className="back-link">← Back to My Courses</Link>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
            <LoadingSpinner size="large" />
          </div>
        )}
        {err && <p className="err">{err}</p>}
        {data && (<>
          <div className="course-hero">
            <div className="course-hero-content">
              <h1>{data.course.title}</h1>
              <p className="course-trainer">Trainer: {data.course.trainer?.name || 'TBA'}</p>
            </div>
            <div className="course-progress-badge">
              <span className="progress-badge-text">{data.approvedCourseCompletion}%</span>
              <span className="progress-badge-label">Course completion</span>
            </div>
          </div>

          <div className="card progress-overview-card">
            <div className="progress-overview-header">
              <h3>Your Course Completion</h3>
              <Progress value={data.approvedCourseCompletion} />
            </div>
            <div className="progress-stats">
              <div className="progress-stat">
                <span className="progress-stat-value">{data.progress.attended}/{data.progress.totalSessions}</span>
                <span className="progress-stat-label">Classes Attended</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value">{data.progress.completedClasses}</span>
                <span className="progress-stat-label">Completed Classes Attended</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value">{data.progress.assignmentsDone}/{data.progress.totalAssignments}</span>
                <span className="progress-stat-label">Assignments</span>
              </div>
              <div className="progress-stat">
                <span className="progress-stat-value">{data.progress.minutesInClass}m</span>
                <span className="progress-stat-label">Time in Class</span>
              </div>
            </div>
            <div className="row">
              <b>Admin-approved course completion: {data.approvedCourseCompletion}%</b>
              <span className={data.approvedCourseCompletion === 100 ? 'pill ok' : 'pill wait'}>
                {data.approvedCourseCompletion === 100 ? 'Course complete' : 'Awaiting admin approval'}
              </span>
            </div>
            <div className="certificate-section">
              {data.certificate
                ? <button className="btn success" onClick={() => downloadCertificate(data.certificate.certId)}>Download Certificate ({data.certificate.certId})</button>
                : <p className="muted certificate-note">A certificate will be available here after an admin approves 100% course completion and generates it.</p>}
            </div>
          </div>

          <div className="tabs">
            {[['classes', 'Live Classes'], ['assignments', 'Assignments'], ['materials', 'Study Material']].map(([k, l]) => (
              <button key={k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>
            ))}
          </div>
          {tab === 'classes' && <Classes sessions={data.sessions} rules={data.rules} />}
          {tab === 'assignments' && (
            <section className="assignments-section">
              {data.assignments.map((a) => <AssignmentCard key={a._id} a={a} courseId={id} sub={data.submissions.find((s) => s.assignment === a._id)} reload={load} />)}
              {!data.assignments.length && <EmptyState icon="📝" title="No assignments yet" description="Check back later for new assignments." />}
            </section>
          )}
          {tab === 'materials' && <Materials courseId={id} materials={data.materials} reload={load} />}
        </>)}
      </div>
    </Shell>
  );
}

function Classes({ sessions, rules }) {
  const router = useRouter();
  return (
    <section>
      {sessions.map((s) => (
        <div className="card" key={s._id}>
          <div className="row">
            <div>
              <b>{s.title}</b> <StatusTag status={s.status} />
              <div className="muted">{fmt(s.startTime)} · {s.durationMinutes} min</div>
              {s.status !== 'upcoming' && (
                <div className="muted">
                  {s.myAttendance.measured
                    ? <>You stayed {s.myAttendance.minutes} of {s.durationMinutes} min ({s.myAttendance.percent}%) · <span className={s.myAttendance.counted ? 'ok' : 'err'}>{s.myAttendance.counted ? 'Counted as present' : 'Not counted yet'}</span></>
                    : s.myAttendance.percent > 0 ? 'Joined through external link' : 'Not attended'}
                </div>
              )}
            </div>
            {s.joinable
              ? <button className="btn small" onClick={() => (s.provider === 'external' ? api(`/courses/sessions/${s._id}/join`, { method: 'POST' }).then((r) => window.open(r.meetingLink, '_blank')).catch((e) => alert(e.message)) : router.push(`/student/classes/${s._id}`))}>Join class</button>
              : s.status === 'upcoming' ? <span className="muted">Opens {rules.joinEarlyMinutes} min before start</span> : null}
          </div>
          <Recordings recordings={s.recordings} sessionId={s._id} showMissingNotice={s.status === 'completed' && !s.recordings?.length} />
        </div>
      ))}
      {!sessions.length && <p className="muted">No classes scheduled yet.</p>}
    </section>
  );
}

function AssignmentCard({ a, courseId, sub, reload }) {
  const [text, setText] = useState(sub?.content || '');
  const [files, setFiles] = useState([]);
  const [msg, setMsg] = useState({ ok: true, t: '' });
  const [busy, setBusy] = useState(false);
  const graded = !!sub?.gradedAt;

  const submit = async () => {
    setBusy(true); setMsg({ ok: true, t: '' });
    try {
      const uploaded = [];
      for (const f of files) uploaded.push(await uploadFile(f, { purpose: 'submission', courseId, refId: a._id }));
      const keep = files.length ? [] : (sub?.files || []);            // choosing new files replaces the old ones
      await api(`/courses/assignments/${a._id}/submit`, { method: 'POST', body: { content: text, files: [...keep, ...uploaded] } });
      setFiles([]); setMsg({ ok: true, t: 'Submitted' }); reload();
    } catch (x) { setMsg({ ok: false, t: x.message }); }
    setBusy(false);
  };

  return (
    <div className="card">
      <div className="row"><b>{a.title}</b>
        <span className={graded ? 'pill ok' : sub ? 'pill wait' : 'pill off'}>{graded ? `${sub.marks}/${a.maxMarks}` : sub ? 'Submitted' : 'Not submitted'}</span></div>
      <p className="muted">{a.description}</p>
      <p className="muted">Due {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'no date'}{sub?.late && ' · submitted late'}</p>
      <textarea placeholder="Write your answer or paste a link" value={text} disabled={graded} onChange={(e) => setText(e.target.value)} />
      {sub?.files?.map((f) => <div key={f.key}><button className="linkbtn" onClick={() => openFile(f.key)}>📎 {f.name}</button> <span className="muted">{fmtSize(f.size)}</span></div>)}
      {!graded && <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files).slice(0, 5))} />}
      {graded && sub.feedback && <p><b>Trainer feedback:</b> {sub.feedback}</p>}
      {!graded && <button className="btn small" disabled={busy} onClick={submit}>{busy ? 'Uploading…' : sub ? 'Update submission' : 'Submit assignment'}</button>}
      {msg.t && <p className={msg.ok ? 'ok' : 'err'}>{msg.t}</p>}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, fmt, uploadFile } from '../../lib/api';
import { StatusTag } from '../ui';
import Recordings from '../Recordings';

const blank = { title: '', startTime: '', durationMinutes: 60, provider: 'jitsi', meetingLink: '' };
const randomRoom = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

export default function ClassesPanel({ courseId, sessions, reload }) {
  const router = useRouter();
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [openAtt, setOpenAtt] = useState(null);
  const [busy, setBusy] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const add = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await api(`/courses/${courseId}/sessions`, { method: 'POST', body: { ...f, startTime: new Date(f.startTime).toISOString(), durationMinutes: Number(f.durationMinutes) } });
      setF(blank); reload();
    } catch (x) { setErr(x.message); }
  };
  const enter = (s) => (s.provider === 'external' ? window.open(s.meetingLink, '_blank') : router.push(`/trainer/classes/${s._id}`));
  const del = async (s) => { if (confirm(`Delete "${s.title}" and its attendance and recordings?`)) { await api(`/courses/sessions/${s._id}`, { method: 'DELETE' }); reload(); } };
  const uploadRec = async (s, file) => {
    if (!file) return;
    setBusy(s._id);
    try {
      const meta = await uploadFile(file, { purpose: 'recording', courseId, refId: s._id });
      await api(`/courses/sessions/${s._id}/recordings`, { method: 'POST', body: { file: meta } });
      reload();
    } catch (x) { alert(x.message); }
    setBusy('');
  };

  return (
    <section>
      <form className="card grid" onSubmit={add}>
        <h3>Schedule a class</h3>
        <input placeholder="Class title" value={f.title} onChange={set('title')} required />
        <input type="datetime-local" value={f.startTime} onChange={set('startTime')} required />
        <input type="number" min="5" max="480" value={f.durationMinutes} onChange={set('durationMinutes')} title="Duration in minutes" placeholder="Minutes" required />
        <select value={f.provider} onChange={set('provider')}>
          <option value="jitsi">Video room inside this portal (tracks time)</option>
          <option value="external">External link (Zoom / Meet / Teams)</option>
        </select>
        {f.provider === 'external' && (
          <div className="full row">
            <input placeholder="https://…" value={f.meetingLink} onChange={set('meetingLink')} required />
            <button type="button" className="btn ghost small" onClick={() => setF({ ...f, meetingLink: 'https://meet.jit.si/lms-' + randomRoom() })}>Generate Jitsi link</button>
          </div>
        )}
        <button className="btn">Schedule class</button>
        {err && <p className="err">{err}</p>}
      </form>

      {sessions.map((s) => (
        <div className="card" key={s._id}>
          {s.status === 'completed' && !s.recordings?.length && (
            <div className="recording-notice" style={{ marginBottom: 12 }}>
              <span className="notice-icon">⚠️</span>
              <div className="notice-content">
                <span className="notice-title">Recording not uploaded</span>
                <span className="notice-text">Students cannot view this class. Upload the recording below.</span>
              </div>
            </div>
          )}
          <div className="row">
            <div>
              <b>{s.title}</b> <StatusTag status={s.status} />
              <div className="muted">{fmt(s.startTime)} · {s.durationMinutes} min · {s.provider === 'jitsi' ? 'In-portal video' : 'External link'} · {s.attendeeCount} joined</div>
            </div>
            <div className="acts">
              {s.status !== 'completed' && <button className="btn small" onClick={() => enter(s)}>{s.status === 'live' ? 'Enter class' : 'Open room'}</button>}
              <button className="btn small ghost" onClick={() => setOpenAtt(openAtt === s._id ? null : s._id)}>Attendance</button>
              <label className="btn small ghost filebtn">{busy === s._id ? 'Uploading…' : 'Upload recording'}
                <input type="file" accept="video/mp4,video/webm" hidden onChange={(e) => uploadRec(s, e.target.files[0])} />
              </label>
              <button className="btn small danger" onClick={() => del(s)}>Delete</button>
            </div>
          </div>
          {openAtt === s._id && <Attendance sid={s._id} />}
          <Recordings sessionId={s._id} recordings={s.recordings} canDelete onChanged={reload} />
        </div>
      ))}
      {!sessions.length && <p className="muted">No classes scheduled yet. Use the form above.</p>}
    </section>
  );
}

function Attendance({ sid }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/courses/sessions/${sid}/attendance`).then(setD).catch((e) => setErr(e.message)); }, [sid]);
  const csv = async () => {
    const res = await api(`/courses/sessions/${sid}/attendance?format=csv`, { raw: true });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(await res.blob()); a.download = 'attendance.csv'; a.click();
  };
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="row"><span className="muted">Present = stayed at least {d.session.requiredPercent}% of {d.session.durationMinutes} min</span>
        <button className="btn small ghost" onClick={csv}>Download CSV</button></div>
      <div className="scroll"><table>
        <thead><tr><th>ID</th><th>Name</th><th>First joined</th><th>Joins</th><th>Time in class</th><th>Status</th></tr></thead>
        <tbody>
          {d.rows.map((r) => (
            <tr key={r.studentId}>
              <td><b>{r.studentId}</b></td><td>{r.name}</td><td>{r.firstJoinedAt ? fmt(r.firstJoinedAt) : '—'}</td><td>{r.joins}</td>
              <td>{r.minutes} min ({r.percent}%){!r.measured && <span className="muted"> link click</span>}</td>
              <td><span className={r.present ? 'pill ok' : 'pill off'}>{r.present ? 'Present' : 'Absent'}</span></td>
            </tr>
          ))}
          {!d.rows.length && <tr><td colSpan="6" className="muted">No students enrolled.</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

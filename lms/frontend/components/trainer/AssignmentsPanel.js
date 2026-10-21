'use client';
import { useState } from 'react';
import { api, openFile, fmtSize } from '../../lib/api';

const blank = { title: '', description: '', dueDate: '', maxMarks: 100 };

export default function AssignmentsPanel({ courseId, assignments, reload }) {
  const [f, setF] = useState(blank);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [subs, setSubs] = useState([]);

  const add = async (e) => {
    e.preventDefault(); setErr('');
    try { await api(`/courses/${courseId}/assignments`, { method: 'POST', body: f }); setF(blank); reload(); } catch (x) { setErr(x.message); }
  };
  const loadSubs = async (id) => setSubs(await api(`/courses/assignments/${id}/submissions`));
  const view = async (a) => { if (open === a._id) return setOpen(null); setOpen(a._id); await loadSubs(a._id); };
  const grade = async (sub, marks, feedback) => {
    try { await api(`/courses/submissions/${sub._id}/grade`, { method: 'PATCH', body: { marks, feedback } }); await loadSubs(open); }
    catch (x) { alert(x.message); }
  };
  const del = async (a) => { if (confirm(`Delete "${a.title}" and all submissions?`)) { await api(`/courses/assignments/${a._id}`, { method: 'DELETE' }); setOpen(null); reload(); } };

  return (
    <section>
      <form className="card grid" onSubmit={add}>
        <h3>Add assignment</h3>
        <input placeholder="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required />
        <input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
        <input type="number" min="1" value={f.maxMarks} onChange={(e) => setF({ ...f, maxMarks: e.target.value })} title="Maximum marks" />
        <textarea className="full" placeholder="Instructions" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <button className="btn">Add assignment</button>
        {err && <p className="err">{err}</p>}
      </form>

      {assignments.map((a) => (
        <div key={a._id} className="card">
          <div className="row">
            <div><b>{a.title}</b><div className="muted">Due {a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'no date'} · {a.maxMarks} marks</div></div>
            <div className="acts">
              <button className="btn small ghost" onClick={() => view(a)}>{open === a._id ? 'Hide submissions' : 'Submissions'}</button>
              <button className="btn small danger" onClick={() => del(a)}>Delete</button>
            </div>
          </div>
          {open === a._id && (
            <div style={{ marginTop: 10 }}>
              {!subs.length && <p className="muted">Nothing submitted yet.</p>}
              {subs.map((s) => <SubmissionRow key={s._id + (s.gradedAt || '')} s={s} max={a.maxMarks} onGrade={grade} />)}
            </div>
          )}
        </div>
      ))}
      {!assignments.length && <p className="muted">No assignments yet.</p>}
    </section>
  );
}

function SubmissionRow({ s, max, onGrade }) {
  const [marks, setMarks] = useState(s.marks ?? '');
  const [fb, setFb] = useState(s.feedback ?? '');
  return (
    <div className="sub">
      <b>{s.student.name} <span className="muted">({s.student.userId})</span></b> {s.late && <span className="pill wait">Late</span>}
      {s.content && <p className="answer">{s.content}</p>}
      {s.files?.map((f) => <div key={f.key}><button className="linkbtn" onClick={() => openFile(f.key)}>📎 {f.name}</button> <span className="muted">{fmtSize(f.size)}</span></div>)}
      <div className="row" style={{ marginTop: 8 }}>
        <input type="number" min="0" max={max} placeholder={`Marks /${max}`} value={marks} onChange={(e) => setMarks(e.target.value)} />
        <input placeholder="Feedback" value={fb} onChange={(e) => setFb(e.target.value)} />
        <button className="btn small" onClick={() => onGrade(s, marks, fb)}>{s.gradedAt ? 'Update grade' : 'Save grade'}</button>
      </div>
    </div>
  );
}

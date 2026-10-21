'use client';
import { useState } from 'react';
import { api, uploadFile, openFile, fmtSize } from '../lib/api';

// Study material list. Trainers can also upload (PDF, slides, docs, mp4) to S3.
export default function Materials({ courseId, materials, canEdit, reload }) {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const add = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      const meta = await uploadFile(file, { purpose: 'material', courseId });
      await api(`/courses/${courseId}/materials`, { method: 'POST', body: { title, file: meta } });
      setTitle(''); setFile(null); e.target.reset(); reload();
    } catch (x) { setErr(x.message); }
    setBusy(false);
  };
  const del = async (m) => { if (confirm(`Delete "${m.title}"?`)) { await api(`/courses/materials/${m._id}`, { method: 'DELETE' }); reload(); } };

  return (
    <section>
      {canEdit && (
        <form className="card" onSubmit={add}>
          <h3>Add study material</h3>
          <input placeholder="Title (e.g. Week 1 slides)" value={title} onChange={(e) => setTitle(e.target.value)} required />
          <input type="file" onChange={(e) => setFile(e.target.files[0])} required />
          <p className="muted">PDF, Word, PowerPoint, Excel, images, zip or mp4 up to 100 MB.</p>
          <button className="btn" disabled={busy}>{busy ? 'Uploading…' : 'Upload material'}</button>
          {err && <p className="err">{err}</p>}
        </form>
      )}
      {materials.map((m) => (
        <div className="item" key={m._id}>
          <div><b>{m.title}</b><div className="muted">{m.file.name} · {fmtSize(m.file.size)}</div></div>
          <div className="acts">
            <button className="btn small" onClick={() => openFile(m.file.key)}>Download</button>
            {canEdit && <button className="btn small danger" onClick={() => del(m)}>Delete</button>}
          </div>
        </div>
      ))}
      {!materials.length && <p className="muted">No study material has been added yet.</p>}
    </section>
  );
}

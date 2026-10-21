'use client';
import { useState } from 'react';
import { api, fmt, fmtSize } from '../lib/api';

export default function Recordings({ sessionId, recordings, canDelete, onChanged, showMissingNotice }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState('');

  if (!recordings?.length && !showMissingNotice) return null;

  const play = async (r) => {
    try { setErr(''); setSrc((await api(`/uploads/download?key=${encodeURIComponent(r.key)}&inline=1`)).url); }
    catch (e) { setErr(e.message); }
  };
  const del = async (r) => {
    if (!confirm('Delete this recording permanently?')) return;
    await api(`/courses/sessions/${sessionId}/recordings?key=${encodeURIComponent(r.key)}`, { method: 'DELETE' });
    setSrc(null); onChanged?.();
  };

  return (
    <div className="recs">
      {showMissingNotice && !recordings?.length && (
        <div className="recording-notice">
          <span className="notice-icon">⚠️</span>
          <div className="notice-content">
            <span className="notice-title">No recording available</span>
            <span className="notice-text">This class recording has not been uploaded yet. Contact your trainer or admin.</span>
          </div>
        </div>
      )}
      {recordings?.map((r) => (
        <div className="rec" key={r.key}>
          <div className="rec-info">
            <span className="rec-icon">🎥</span>
            <div className="rec-details">
              <span className="rec-name">{r.name}</span>
              <span className="rec-meta">{fmtSize(r.size)} · {fmt(r.createdAt)}</span>
            </div>
          </div>
          <span className="acts">
            <button className="btn small" onClick={() => play(r)}>Watch</button>
            {canDelete && <button className="btn small danger" onClick={() => del(r)}>Delete</button>}
          </span>
        </div>
      ))}
      {err && <p className="err">{err}</p>}
      {src && <video className="player" src={src} controls autoPlay controlsList="nodownload" />}
    </div>
  );
}

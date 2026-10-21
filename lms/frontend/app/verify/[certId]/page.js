'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, fmt } from '../../../lib/api';

// Public page: anyone can check that a certificate is real
export default function Verify() {
  const { certId } = useParams();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api(`/certificates/verify/${certId}`).then(setD).catch((e) => setErr(e.message)); }, [certId]);
  return (
    <div className="narrow">
      <div className="card">
        <h2>Certificate check</h2>
        {err && <p className="err">❌ {err}</p>}
        {d && (<>
          <p className="ok">✅ This certificate is genuine.</p>
          <p><b>{d.student}</b> ({d.studentId})<br />completed <b>{d.course}</b><br /><span className="muted">Issued {fmt(d.issuedAt)} · ID {d.certId}</span></p>
        </>)}
        {!d && !err && <p className="muted">Checking…</p>}
      </div>
    </div>
  );
}

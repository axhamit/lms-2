'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../../lib/api';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { setMsg((await api('/auth/forgot', { method: 'POST', body: { email } })).message); } catch (x) { setErr(x.message); }
  };
  return (
    <div className="narrow">
      <form className="card" onSubmit={submit}>
        <h2>Reset your password</h2>
        <label>Your registered email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <button className="btn">Send reset link</button>
        {msg && <p className="ok">{msg}</p>}{err && <p className="err">{err}</p>}
        <p className="muted"><Link href="/login">Back to log in</Link></p>
      </form>
    </div>
  );
}

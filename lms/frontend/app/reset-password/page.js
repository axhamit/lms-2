'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

function Form() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    try { setMsg((await api('/auth/reset', { method: 'POST', body: { token, password } })).message); } catch (x) { setErr(x.message); }
  };
  return (
    <form className="card" onSubmit={submit}>
      <h2>Choose a new password</h2>
      <label>New password (8+ characters)<PasswordInput minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></label>
      <button className="btn">Save password</button>
      {msg && <p className="ok">{msg} <Link href="/login">Log in</Link></p>}{err && <p className="err">{err}</p>}
    </form>
  );
}
export default function Reset() { return <div className="narrow"><Suspense fallback={null}><Form /></Suspense></div>; }

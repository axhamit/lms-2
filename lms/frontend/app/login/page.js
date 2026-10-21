'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../components/AuthProvider';

export default function Login() {
  const { login } = useAuth();
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const u = await login(identifier, password); router.replace(u.mustChangePassword ? '/account' : '/' + u.role); }
    catch (x) { setErr(x.message); setBusy(false); }
  };

  return (
    <div className="login">
      <div className="login-side">
        <div className="login-content">
          <h1>GSN Foundation</h1>
          <p>Join live classes, finish your assignments and earn a verified certificate.</p>
          <div className="login-features">
            <div className="feature">
              <span className="feature-icon">📚</span>
              <span>Live Classes</span>
            </div>
            <div className="feature">
              <span className="feature-icon">✓</span>
              <span>Certificates</span>
            </div>
            <div className="feature">
              <span className="feature-icon">📝</span>
              <span>Assignments</span>
            </div>
          </div>
        </div>
      </div>
      <form className="login-form" onSubmit={submit}>
        <div className="form-header">
          <h2>Welcome back</h2>
          <p className="muted">Enter your credentials to access your account</p>
        </div>
        <label>Student / trainer ID or email
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="STU482913 or you@mail.com" autoComplete="username" required />
        </label>
        <label>Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {err && <p className="err">{err}</p>}
        <button className="btn" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <div className="form-footer">
          <p className="muted"><Link href="/forgot-password">Forgot password?</Link></p>
          <p className="muted">There is no sign-up. Your admin creates your account.</p>
        </div>
      </form>
    </div>
  );
}

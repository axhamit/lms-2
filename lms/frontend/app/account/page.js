'use client';
import { useState } from 'react';
import Shell from '../../components/Shell';
import { useAuth } from '../../components/AuthProvider';
import { api } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

export default function Account() {
  const { user, setSession } = useAuth();
  const [f, setF] = useState({ oldPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  if (!user) return <Shell />;

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setMsg('');
    try {
      const d = await api('/auth/change-password', { method: 'POST', body: f });
      setSession(d.token, d.user); setF({ oldPassword: '', newPassword: '' }); setMsg('Password changed.');
    } catch (x) { setErr(x.message); }
  };
  return (
    <Shell>
      <div className="narrow" style={{ margin: 0 }}>
        <div className="account-header">
          <h1>My Account</h1>
          <p className="account-subtitle">Manage your profile and security settings</p>
        </div>

        <div className="card profile-card">
          <div className="profile-header">
            <div className="profile-avatar">
              <span>{user.name.charAt(0).toUpperCase()}</span>
            </div>
            <div className="profile-info">
              <h3>{user.name}</h3>
              <p className="muted">{user.email}</p>
              <div className="profile-meta">
                <span className="pill ok">{user.role}</span>
                <span className="muted">ID: {user.userId}</span>
              </div>
            </div>
          </div>
        </div>

        {user.mustChangePassword && (
          <div className="card warning-card">
            <div className="warning-content">
              <span className="warning-icon">⚠️</span>
              <div>
                <h4>Security Alert</h4>
                <p>Your password was set by an admin. Please choose your own password to continue.</p>
              </div>
            </div>
          </div>
        )}

        <form className="card" onSubmit={submit}>
          <div className="form-section-header">
            <h3>Change Password</h3>
            <p className="form-section-desc">Update your password to keep your account secure</p>
          </div>
          <label>Current password<PasswordInput value={f.oldPassword} onChange={(e) => setF({ ...f, oldPassword: e.target.value })} autoComplete="current-password" required /></label>
          <label>New password (8+ characters)<PasswordInput minLength={8} value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} autoComplete="new-password" required /></label>
          <button className="btn">Change password</button>
          {msg && <p className="ok">{msg}</p>}{err && <p className="err">{err}</p>}
        </form>
      </div>
    </Shell>
  );
}

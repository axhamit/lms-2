'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('token')) { setUser(null); setLoading(false); return; }
    try { setUser((await api('/auth/me')).user); } catch { localStorage.removeItem('token'); setUser(null); }
    setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const setSession = (token, u) => { localStorage.setItem('token', token); setUser(u); };
  const login = async (identifier, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { identifier, password } });
    setSession(d.token, d.user);
    return d.user;
  };
  const logout = () => {
    if (confirm('Are you sure you want to log out?')) {
      localStorage.removeItem('token');
      setUser(null);
      window.location.href = '/login';
    }
  };

  return <Ctx.Provider value={{ user, loading, login, logout, setSession }}>{children}</Ctx.Provider>;
}

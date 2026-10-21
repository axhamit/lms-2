const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

export async function api(path, { method = 'GET', body, raw = false, keepalive = false } = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const res = await fetch(BASE + path, {
    method, keepalive,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Something went wrong');
  return data;
}

// Upload a file straight to S3 (backend only signs the URL). Returns metadata to save with the record.
export async function uploadFile(file, { purpose, courseId, refId }) {
  const { key, url, headers } = await api('/uploads/presign', {
    method: 'POST',
    body: { purpose, courseId, refId, filename: file.name, contentType: file.type || 'application/octet-stream', size: file.size },
  });
  const res = await fetch(url, { method: 'PUT', headers, body: file });
  if (!res.ok) throw new Error('Upload to storage failed. Check the bucket CORS settings.');
  return { key, name: file.name, size: file.size, contentType: file.type };
}

// Opens a private S3 file in a new tab through a short-lived link
export async function openFile(key, inline = false) {
  const w = window.open('', '_blank');           // open first so popup blockers allow it
  try {
    const { url } = await api(`/uploads/download?key=${encodeURIComponent(key)}${inline ? '&inline=1' : ''}`);
    w.location.href = url;
  } catch (e) { w?.close(); alert(e.message); }
}

export async function downloadCertificate(certId) {
  const res = await api(`/certificates/${certId}/pdf`, { raw: true });
  if (!res.ok) throw new Error('Could not download certificate');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(await res.blob()); a.download = `${certId}.pdf`; a.click();
}

export const fmt = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtSize = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');

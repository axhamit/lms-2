'use client';
import { useRef, useState, useEffect } from 'react';
import { api } from '../lib/api';

const PART = 6 * 1024 * 1024;   // S3 multipart parts must be at least 5 MB (except the last one)

// Trainer-side class recording. Captures the browser tab (with audio), uploads to S3 in parts while recording.
export default function Recorder({ sessionId, onSaved }) {
  const [state, setState] = useState('idle');   // idle | recording | saving
  const [msg, setMsg] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const warn = (e) => { if (ref.current?.rec?.state === 'recording') { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const start = async () => {
    setMsg('');
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') return setMsg('Recording is not supported in this browser. Use Chrome or Edge on a computer.');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true, preferCurrentTab: true });
      const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
      const { key, uploadId } = await api('/uploads/multipart/start', { method: 'POST', body: { sessionId } });
      const st = { key, uploadId, buf: [], size: 0, parts: [], n: 1, chain: Promise.resolve(), startedAt: Date.now() };
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 1500000 });

      const flush = (force) => {
        if (!st.buf.length || (!force && st.size < PART)) return;
        const blob = new Blob(st.buf, { type: 'video/webm' });
        st.buf = []; st.size = 0;
        const partNumber = st.n++;
        st.chain = st.chain.then(async () => {            // parts upload one after another, in order
          const { url } = await api('/uploads/multipart/part-url', { method: 'POST', body: { key, uploadId, partNumber } });
          const res = await fetch(url, { method: 'PUT', body: blob });
          if (!res.ok) throw new Error('Uploading a recording part failed');
          st.parts.push({ PartNumber: partNumber, ETag: res.headers.get('ETag') });
        });
      };

      rec.ondataavailable = (e) => { if (e.data.size) { st.buf.push(e.data); st.size += e.data.size; flush(false); } };
      rec.onstop = async () => {
        setState('saving');
        stream.getTracks().forEach((t) => t.stop());
        try {
          flush(true);
          await st.chain;
          if (!st.parts.length) throw new Error('Nothing was recorded');
          await api('/uploads/multipart/complete', { method: 'POST', body: {
            sessionId, key, uploadId, parts: st.parts, durationSeconds: Math.round((Date.now() - st.startedAt) / 1000),
            name: `Class recording ${new Date().toLocaleString()}`,
          } });
          setMsg('Recording saved. Students can watch it from the course page.');
          onSaved?.();
        } catch (e) {
          await api('/uploads/multipart/abort', { method: 'POST', body: { key, uploadId } }).catch(() => {});
          setMsg('Recording failed: ' + e.message);
        }
        setState('idle');
      };
      stream.getVideoTracks()[0].addEventListener('ended', () => rec.state !== 'inactive' && rec.stop());
      rec.start(5000);
      ref.current = { rec };
      setState('recording');
    } catch (e) { setMsg(e.name === 'NotAllowedError' ? 'Recording cancelled.' : e.message); }
  };

  return (
    <div className="recorder">
      {state === 'idle' && <button className="btn small" onClick={start}>Start recording</button>}
      {state === 'recording' && <><span className="rec-dot" /> <b>Recording</b> <button className="btn small danger" onClick={() => ref.current.rec.stop()}>Stop and save</button></>}
      {state === 'saving' && <span>Saving recording to cloud storage… keep this page open.</span>}
      <span className="muted"> {msg || 'When asked, choose “This tab” and tick “Share tab audio”.'}</span>
    </div>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, fmt } from '../lib/api';
import { useAuth } from './AuthProvider';
import Recorder from './Recorder';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI && document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.async = true; s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the video service. Check your internet connection.'));
    document.body.appendChild(s);
  });
}

// Embedded live class. Students: attendance time is tracked with a heartbeat while they are inside the room.
export default function ClassRoom({ sessionId, role }) {
  const { user } = useAuth();
  const router = useRouter();
  const box = useRef(null);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  const [inRoom, setInRoom] = useState(false);

  useEffect(() => {
    let dead = false, timer = null, jitsi = null, tracking = false;
    const beat = () => api(`/courses/sessions/${sessionId}/heartbeat`, { method: 'POST' }).catch(() => {});
    const stopTracking = () => {
      if (!tracking) return;
      tracking = false; clearInterval(timer);
      api(`/courses/sessions/${sessionId}/leave`, { method: 'POST', keepalive: true }).catch(() => {});
    };
    window.addEventListener('pagehide', stopTracking);

    (async () => {
      try {
        const data = role === 'student'
          ? await api(`/courses/sessions/${sessionId}/join`, { method: 'POST' })
          : await api(`/courses/sessions/${sessionId}/room`);
        if (dead) return;
        setInfo(data);
        if (data.provider === 'external') { window.open(data.meetingLink, '_blank'); return; }

        await loadScript(`https://${data.domain}/external_api.js`);
        if (dead) return;
        jitsi = new window.JitsiMeetExternalAPI(data.domain, {
          roomName: data.roomName, parentNode: box.current, width: '100%', height: '100%', jwt: data.jwt || undefined,
          userInfo: { displayName: user.name, email: user.email },
          configOverwrite: { prejoinPageEnabled: false, disableDeepLinking: true },
        });
        jitsi.addListener('videoConferenceJoined', () => {
          setInRoom(true);
          if (role === 'student' && !tracking) { tracking = true; beat(); timer = setInterval(beat, 20000); }
        });
        jitsi.addListener('videoConferenceLeft', () => { setInRoom(false); stopTracking(); });
        jitsi.addListener('readyToClose', () => { stopTracking(); router.push('/' + role); });
      } catch (e) { if (!dead) setErr(e.message); }
    })();

    return () => { dead = true; window.removeEventListener('pagehide', stopTracking); stopTracking(); jitsi?.dispose(); };
  }, [sessionId]); // eslint-disable-line

  return (
    <div>
      <div className="row">
        <div>
          <h2 style={{ margin: 0 }}>{info?.title || 'Joining class…'}</h2>
          {info && <p className="muted">{info.courseTitle} · {fmt(info.startTime)} · {info.durationMinutes} min</p>}
        </div>
        <Link href={'/' + role} className="btn ghost small">Leave class</Link>
      </div>

      {role === 'student' && <p className="notice">Your time in this class is recorded for attendance{inRoom ? ' — you are in the room now' : ''}. The trainer may record the session.</p>}
      {role !== 'student' && info?.provider === 'jitsi' && <Recorder sessionId={sessionId} />}
      {err && <p className="err">{err}</p>}
      {info?.provider === 'external' && <p className="notice">This class runs on an external meeting link. It opened in a new tab. <a href={info.meetingLink} target="_blank" rel="noreferrer">Open it again</a>.</p>}
      <div ref={box} className="video" style={info?.provider === 'external' ? { display: 'none' } : undefined} />
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { LoadingSpinner, EmptyState } from '../../components/ui';
import { api, fmt } from '../../lib/api';

export default function Trainer() {
  const [courses, setCourses] = useState(null);
  const [assignedClasses, setAssignedClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([api('/courses'), api('/courses/sessions/assigned')])
      .then(([myCourses, myClasses]) => {
        setCourses(myCourses);
        setAssignedClasses(myClasses);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Shell role="trainer">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
          <LoadingSpinner size="large" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell role="trainer">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell role="trainer">
      <h2>My courses</h2>
      {!!assignedClasses.length && (
        <details className="assigned-classes">
          <summary>
            <span>
              <b>Classes assigned to me</b>
              <span className="assigned-classes-count">{assignedClasses.length} {assignedClasses.length === 1 ? 'class' : 'classes'}</span>
            </span>
            <span className="assigned-classes-toggle">View classes</span>
          </summary>
          <div className="assigned-classes-list">
            {assignedClasses.map((session) => (
              <article className="assigned-class" key={session._id}>
                <div className="assigned-class-info">
                  <div className="assigned-class-title">
                    <b>{session.title}</b>
                    <span className={`pill ${session.status === 'completed' ? 'ok' : session.status === 'live' ? 'wait' : 'off'}`}>
                      {session.status === 'live' ? 'Live now' : session.status}
                    </span>
                  </div>
                  <span className="muted">{session.course?.title || 'Course removed'} · {fmt(session.startTime)}</span>
                </div>
                {session.status === 'completed'
                  ? <span className="assigned-class-complete">Class completed</span>
                  : <Link className="btn small" href={`/trainer/classes/${session._id}`}>
                    {session.status === 'live' ? 'Enter class' : 'Open class'}
                  </Link>}
              </article>
            ))}
          </div>
        </details>
      )}
      {courses && !courses.length && <EmptyState icon="📚" title="No courses assigned" description="No course is assigned to you yet. Ask your admin." />}
      <div className="cards">
        {courses?.map((c) => (
          <Link key={c._id} href={`/trainer/courses/${c._id}`} className="card link course-card">
            <div className="course-card-header">
              <h3>{c.title}</h3>
              <span className="course-status in-progress">{c.students.length} students</span>
            </div>
            <p className="muted">{c.description || 'No description'}</p>
            <div className="course-stats">
              <div className="stat-item">
                <span className="stat-value">{c.students.length}</span>
                <span className="stat-label">Students</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </Shell>
  );
}

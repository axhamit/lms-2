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
        <>
          <h2>Classes assigned to me</h2>
          <div className="scroll"><table>
            <thead><tr><th>Class</th><th>Course</th><th>Schedule</th><th></th></tr></thead>
            <tbody>
              {assignedClasses.map((session) => (
                <tr key={session._id}>
                  <td><b>{session.title}</b></td>
                  <td>{session.course?.title || 'Course removed'}</td>
                  <td>{fmt(session.startTime)}</td>
                  <td><Link className="btn small" href={`/trainer/classes/${session._id}`}>Open class</Link></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
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

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { LoadingSpinner, EmptyState } from '../../components/ui';
import { api } from '../../lib/api';

export default function Trainer() {
  const [courses, setCourses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api('/courses')
      .then(setCourses)
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

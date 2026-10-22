'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '../../components/Shell';
import { Progress, LoadingSpinner, EmptyState } from '../../components/ui';
import { useAuth } from '../../components/AuthProvider';
import { api, downloadCertificate, fmt } from '../../lib/api';

export default function Student() {
  const { user } = useAuth();
  const [courses, setCourses] = useState(null);
  const [certs, setCerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      api('/courses').then(setCourses).catch((e) => setError(e.message)),
      api('/certificates/mine').then(setCerts).catch((e) => setError(e.message))
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Shell role="student">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
          <LoadingSpinner size="large" />
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell role="student">
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <span className="error-text">{error}</span>
        </div>
      </Shell>
    );
  }

  return (
    <Shell role="student">
      <div className="dashboard-header">
        <h1>Welcome back, {user?.name?.split(' ')[0] || 'Student'}!</h1>
        <p className="dashboard-subtitle">Continue your learning journey</p>
      </div>

      <div className="stats-dashboard">
        <div className="stat-card stat-card-primary">
          <div className="stat-icon">📚</div>
          <div className="stat-content">
            <div className="stat-value">{courses?.length || 0}</div>
            <div className="stat-label">Enrolled Courses</div>
          </div>
        </div>
        <div className="stat-card stat-card-success">
          <div className="stat-icon">✓</div>
          <div className="stat-content">
            <div className="stat-value">{courses?.filter(c => c.approvedCourseCompletion === 100).length || 0}</div>
              <div className="stat-label">Courses approved complete</div>
          </div>
        </div>
        <div className="stat-card stat-card-accent">
          <div className="stat-icon">🎓</div>
          <div className="stat-content">
            <div className="stat-value">{certs.length}</div>
            <div className="stat-label">Certificates</div>
          </div>
        </div>
      </div>

      <h2 className="section-title">My Courses</h2>
      {courses && !courses.length && <EmptyState icon="📚" title="No courses yet" description="You are not enrolled in any course yet. Ask your admin." />}
      <div className="cards">
        {courses?.map((c) => (
          <Link key={c._id} href={`/student/courses/${c._id}`} className="card link course-card">
            <div className="course-card-header">
              <h3>{c.title}</h3>
              <span className={`course-status ${c.approvedCourseCompletion === 100 ? 'completed' : 'in-progress'}`}>
                {c.approvedCourseCompletion === 100 ? '✓ Course complete' : `${c.approvedCourseCompletion}% approved`}
              </span>
            </div>
            <p className="muted">Trainer: {c.trainer?.name || 'TBA'}</p>
            <p className="muted">Learning progress: {c.progress.percent}% · Approved course completion: {c.approvedCourseCompletion}%</p>
            <Progress value={c.progress.percent} />
            <div className="course-stats">
              <div className="stat-item">
                <span className="stat-value">{c.progress.attended}/{c.progress.totalSessions}</span>
                <span className="stat-label">Classes</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{c.progress.assignmentsDone}/{c.progress.totalAssignments}</span>
                <span className="stat-label">Assignments</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">{c.progress.minutesInClass}m</span>
                <span className="stat-label">In class</span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="section-title">My Certificates</h2>
      {!certs.length && <EmptyState icon="🎓" title="No certificates yet" description="Certificates appear here after an admin approves course completion and generates them." />}
      {certs.map((c) => (
        <div className="item certificate-item" key={c._id}>
          <div className="certificate-info">
            <div className="certificate-icon">🎓</div>
            <div>
              <b>{c.course?.title}</b>
              <div className="muted">{c.certId} · issued {fmt(c.issuedAt)}</div>
            </div>
          </div>
          <button className="btn small success" onClick={() => downloadCertificate(c.certId)}>Download PDF</button>
        </div>
      ))}
    </Shell>
  );
}

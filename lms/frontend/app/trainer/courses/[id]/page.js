'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Shell from '../../../../components/Shell';
import { Progress, LoadingSpinner } from '../../../../components/ui';
import ClassesPanel from '../../../../components/trainer/ClassesPanel';
import AssignmentsPanel from '../../../../components/trainer/AssignmentsPanel';
import Materials from '../../../../components/Materials';
import { api } from '../../../../lib/api';

export default function TrainerCourse() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('classes');
  const load = useCallback(() => {
    setLoading(true);
    setErr('');
    api(`/courses/${id}`)
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Shell role="trainer">
      <Link href="/trainer" className="muted">← All courses</Link>
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 20px' }}>
          <LoadingSpinner size="large" />
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {data && (<>
        <h2>{data.course.title}</h2>
        <div className="tabs">
          {[['classes', 'Live classes'], ['assignments', 'Assignments'], ['materials', 'Study material'], ['students', 'Students']].map(([k, l]) => (
            <button key={k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        {tab === 'classes' && <ClassesPanel courseId={id} sessions={data.sessions} reload={load} />}
        {tab === 'assignments' && <AssignmentsPanel courseId={id} assignments={data.assignments} reload={load} />}
        {tab === 'materials' && <Materials courseId={id} materials={data.materials} canEdit reload={load} />}
        {tab === 'students' && (
          <div className="scroll"><table>
            <thead><tr><th>ID</th><th>Name</th><th>Classes attended</th><th>Time in class</th><th>Assignments done</th><th>Progress</th></tr></thead>
            <tbody>
              {data.studentsProgress.map(({ student, progress: p }) => (
                <tr key={student._id}>
                  <td><b>{student.userId}</b></td><td>{student.name}</td><td>{p.attended}/{p.totalSessions}</td><td>{p.minutesInClass} min</td>
                  <td>{p.assignmentsDone}/{p.totalAssignments}</td><td style={{ minWidth: 150 }}><Progress value={p.percent} /></td>
                </tr>
              ))}
              {!data.studentsProgress.length && <tr><td colSpan="6" className="muted">No students enrolled.</td></tr>}
            </tbody>
          </table></div>
        )}
      </>)}
    </Shell>
  );
}

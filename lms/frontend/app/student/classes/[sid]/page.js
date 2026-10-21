'use client';
import { useParams } from 'next/navigation';
import Shell from '../../../../components/Shell';
import ClassRoom from '../../../../components/ClassRoom';

export default function StudentClass() {
  const { sid } = useParams();
  return <Shell role="student" wide><ClassRoom sessionId={sid} role="student" /></Shell>;
}

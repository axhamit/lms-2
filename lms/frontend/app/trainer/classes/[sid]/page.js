'use client';
import { useParams } from 'next/navigation';
import Shell from '../../../../components/Shell';
import ClassRoom from '../../../../components/ClassRoom';

export default function TrainerClass() {
  const { sid } = useParams();
  return <Shell role="trainer" wide><ClassRoom sessionId={sid} role="trainer" /></Shell>;
}

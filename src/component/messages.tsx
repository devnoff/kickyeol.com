'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Timestamp } from '@google-cloud/firestore';
import Image from 'next/image';

type Petition = {
  id: string;
  name: string;
  message: string;
  organization: string;
  judge: string;
  maskedIp: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  latitude?: number;
  longitude?: number;
  status?: 'pending' | 'approved' | 'rejected';
};

const judges = {
  "문형배": "moonhyungbae.jpg",
  "이미선": "leemiseon.jpg",
  "김형두": "kimhyungdoo.jpg",
  "정정미": "jungjungmi.jpg",
  "정형식": "junghyungsik.jpg",
  "김복형": "kimbokhyung.jpg",
  "조한창": "johanchang.jpg",
  "정계선": "junggyeseon.jpg"
};

function formatRelativeTime(createdAt: string): string {
  console.log(createdAt)
  const now = new Date();
  const createdDate = new Date(createdAt);
  const diff = now.getTime() - createdDate.getTime();

  const minutes = Math.floor(diff / (1000 * 60));

  if (minutes < 1) return '방금 전';

  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;

  const months = Math.floor(days / 30);
  return `${months}개월 전`;
}

export default function PetitionList() {
  const [petitions, setPetitions] = useState<Petition[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'petitions'),
      where('status', '==', 'approved'),
      orderBy('createdAt', 'desc'),
      limit(10) // 가장 최근 10건
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Petition[];

      setPetitions(items);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="max-w-2xl mx-auto mt-10 space-y-4">
      <h2 className="text-xl font-bold text-center">🗣️ 실시간 청원 메시지</h2>
      {petitions.length === 0 && (
        <div className="text-center text-gray-500">아직 청원이 없습니다.</div>
      )}
      {petitions.map((petition) => (
        <div
          key={petition.id}
          className="border p-3 rounded shadow-sm bg-white"
        >
          <div className="text-sm text-gray-500">
            {formatRelativeTime(petition.createdAt.toDate().toISOString())} - {petition.name || '익명'}{' '}
            {petition.organization && ' - ' + petition.organization || ''} ({petition.maskedIp || '***'}) → 
            <Image
              src={`/images/${judges[petition.judge as keyof typeof judges]}`}
              alt={petition.judge}
              width={24}
              height={24}
              className="rounded-full ml-2 mb-0 mr-2 inline-block"
            />{petition.judge} 재판관에게
          </div>
          <div className="mt-1 text-base">{petition.message}</div>
        </div>
      ))}
    </div>
  );
}

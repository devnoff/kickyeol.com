'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import Image from 'next/image';

const judges = [
  { name: "문형배", filename: "moonhyungbae.jpg" },
  { name: "이미선", filename: "leemiseon.jpg" },
  { name: "김형두", filename: "kimhyungdoo.jpg" },
  { name: "정정미", filename: "jungjungmi.jpg" },
  { name: "정형식", filename: "junghyungsik.jpg" },
  { name: "김복형", filename: "kimbokhyung.jpg" },
  { name: "조한창", filename: "johanchang.jpg" },
  { name: "정계선", filename: "junggyeseon.jpg" }
];

type Stats = Record<string, number>;

export default function JudgeStats() {
  const [stats, setStats] = useState<Stats>({});

  useEffect(() => {
    const ref = doc(db, 'stats', 'judges');
    const unsubscribe = onSnapshot(ref, (snap) => {
      const data = snap.data() || {};
      setStats(data);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <h2 className="text-xl font-bold text-center mb-4">📊 재판관별 청원 수</h2>
      <div className="grid grid-cols-3 gap-4">
        {judges.map((judge) => (
          <div
            key={judge.name}
            className="flex flex-col items-center p-3 rounded-lg"
          >
            <Image
              src={`/images/${judge.filename}`}
              alt={judge.name}
              width={64}
              height={64}
              className="rounded-full mb-2"
            />
            <span>{judge.name}</span>
            <span className="font-semibold">{stats[judge.name] || 0}건</span>
          </div>
        ))}
      </div>
    </div>
  );
}

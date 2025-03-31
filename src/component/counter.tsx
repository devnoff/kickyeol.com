'use client';

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useSpring, animated } from 'react-spring';

export default function PetitionCounter() {
  const [count, setCount] = useState<number>(0);
  const springProps = useSpring({ 
    number: count, 
    from: { number: 0 },
    config: { duration: 1000 } // 애니메이션 지속 시간 조정 (선택사항)
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'stats', 'global'), (docSnap) => {
      const data = docSnap.data();
      if (data?.totalCount) {
        setCount(data.totalCount);
      }
    });

    return () => unsub();
  }, []);

  return (
    <section className="py-10 bg-gradient-to-r from-orange-500 to-pink-500 text-white rounded-xl">
    <div className="max-w-4xl mx-auto text-center">
      <h2 className="text-3xl font-bold mb-4">청원 참여 현황</h2>
      {/* @ts-expect-error: springProps.number is a special animated value not directly typed */}
      <p className="text-6xl font-extrabold"><animated.span>
        {springProps.number.to((n: number) => Math.floor(n).toLocaleString())}
      </animated.span></p>
      <p className="text-lg mt-2">현재까지 청원에 참여한 국민의 수</p>
    </div>
  </section>
  );
}
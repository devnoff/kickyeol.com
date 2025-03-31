'use client';

import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { adminLogin } from '@/lib/admin';
import { useRouter } from 'next/navigation';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  useEffect(() => {
    // 세션 쿠키 체크
    const session = document.cookie.split('; ').find(row => row.startsWith('session='));
    if (session) {
      router.push('/admin');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // 1. Firebase Auth로 로그인
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      // 2. ID 토큰 가져오기
      const idToken = await userCredential.user.getIdToken();
      console.log('ID Token:', idToken); // 토큰 확인용
      
      // 3. Cloud Function 호출
      const result = await adminLogin({ idToken });
      
      // 4. 세션 쿠키 설정
      document.cookie = `session=${result.data.sessionCookie}; path=/`;
      
      router.push('/admin');
    } catch (error) {
      console.error('로그인 에러:', error);
      setError('로그인에 실패했습니다.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <h2 className="text-center text-3xl font-bold">관리자 로그인</h2>
        {error && <p className="text-red-500 text-center">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full p-2 border rounded"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full p-2 border rounded"
            required
          />
          <button
            type="submit"
            className="w-full bg-black text-white p-2 rounded hover:bg-gray-800"
          >
            로그인
          </button>
        </form>
      </div>
    </div>
  );
} 
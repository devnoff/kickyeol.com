import { useState, useEffect } from 'react';
import { auth } from './firebase';

export function useSession() {
  const [session, setSession] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 저장된 세션 쿠키가 있는지 확인
    const savedSession = document.cookie
      .split('; ')
      .find(row => row.startsWith('session='))
      ?.split('=')[1];

    if (savedSession) {
      setSession(savedSession);
      setLoading(false);
      return;
    }

    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        try {
          // ID 토큰을 가져옵니다
          const idToken = await user.getIdToken();
          
          // 세션 쿠키를 가져오기 위해 서버에 요청
          const response = await fetch('https://us-central1-tackhack-1c40e.cloudfunctions.net/createSession', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            }
          });

          if (!response.ok) {
            throw new Error('Failed to create session');
          }

          const { sessionCookie } = await response.json();
          
          // 세션 쿠키를 쿠키에 저장
          document.cookie = `session=${sessionCookie}; path=/`;
          
          setSession(sessionCookie);
        } catch (error) {
          console.error('Session creation error:', error);
          setSession(null);
        }
      } else {
        setSession(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { session, loading };
} 
import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from './firebase';  // Firebase 초기화된 app 인스턴스 import

const functions = getFunctions(app);  // 초기화된 app 인스턴스를 전달

interface AdminLoginResponse {
  sessionCookie: string;
}

// data 형식을 명확하게 지정
interface AdminLoginRequest {
  idToken: string;
}

export const adminLogin = httpsCallable<AdminLoginRequest, AdminLoginResponse>(
  functions, 
  'adminLogin'
);

interface UpdatePetitionStatusData {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

export const updatePetitionStatus = async ({ id, status }: UpdatePetitionStatusData) => {
  const functions = getFunctions();
  const updatePetitionStatusFunction = httpsCallable<UpdatePetitionStatusData, { success: boolean }>(
    functions,
    'updatePetitionStatus'
  );

  return updatePetitionStatusFunction({ id, status });
};

export const deletePetition = httpsCallable<{ id: string }, void>(
  functions, 
  'deletePetition'
); 
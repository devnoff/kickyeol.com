'use client'; // Next.js App Router 사용 시 필요

import { useState, useEffect } from 'react';
import FingerprintJS from '@fingerprintjs/fingerprintjs';

export default function PetitionForm() {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [judge, setJudge] = useState('');
  const [organization, setOrganization] = useState('');
  const [message, setMessage] = useState('신속한 파면 선고 바랍니다!');
  const [submitted, setSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false); // 로딩 상태 추가
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(true);
  const [isEditing, /* setIsEditing */] = useState(false);
  const [, setEditId] = useState<string | null>(null);

  useEffect(() => {
    // Fingerprint 초기화 및 ID 생성
    const initFingerprint = async () => {
      try {
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        const visitorId = result.visitorId;
        
        if (!localStorage.getItem('petitionId')) {
          localStorage.setItem('petitionId', visitorId);
        }
        
        const hasSubmitted = localStorage.getItem('petitionSubmitted');
        if (hasSubmitted) {
          setSubmitted(true);
          const savedData = localStorage.getItem('petitionData');
          if (savedData) {
            const data = JSON.parse(savedData);
            setName(data.name);
            setJudge(data.judge);
            setOrganization(data.organization);
            setMessage(data.message);
            setEditId(data.editId);
            setAge(data.age);
            setGender(data.gender);
            setLatitude(data.latitude);
            setLongitude(data.longitude);
          }
        }
      } catch (error) {
        console.error('Fingerprint 초기화 실패:', error);
        // 폴백: 기존 UUID 생성 방식 사용
        if (!localStorage.getItem('petitionId')) {
          localStorage.setItem('petitionId', generateUUID());
        }
      }
    };

    initFingerprint();
  }, []);

  // UUID 생성 함수 (폴백용)
  function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  const handleLocationShare = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('브라우저가 위치 공유를 지원하지 않습니다.'));
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (position) => resolve(position),
            (error) => reject(error),
            {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            }
          );
        });

        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
      } catch (error) {
        console.error('위치 권한 요청 실패:', error);
        alert('위치 권한을 허용해주세요.');
        e.target.checked = false;
      }
    } else {
      setLatitude(null);
      setLongitude(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  
    if (!message.trim()) return alert('메시지를 입력해주세요.');
  
    setIsLoading(true);
    try {
      const petitionId = localStorage.getItem('petitionId');
      const editId = isEditing ? localStorage.getItem('editId') : await FingerprintJS.load().then(fp => fp.get()).then(result => result.visitorId);
      
      const res = await fetch(
        'https://submitpetition-atn5earmwa-uc.a.run.app',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            name, 
            age, 
            gender, 
            message, 
            organization, 
            judge, 
            latitude, 
            longitude,
            petitionId,
            editId,
            isEdit: isEditing
          }),
        }
      );
  
      if (!res.ok) throw new Error('청원 제출 실패');
  
      localStorage.setItem('petitionSubmitted', 'true');
      localStorage.setItem('editId', editId || '');
      localStorage.setItem('petitionData', JSON.stringify({
        name,
        message,
        organization,
        judge,
        editId,
        petitionId
      }));
      
      setSubmitted(true);
      
      if (!isEditing) {
        setName('');
        setAge('');
        setGender('');
        setMessage('');
        setOrganization('');
        setJudge('');
      }
    } catch (err) {
      console.error(err);
      alert('청원 제출에 실패했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  // const handleEdit = () => {
  //   setIsEditing(true);
  //   setSubmitted(false);
  // };

  return (
    <div className="max-w-2xl mx-auto p-4 mt-10 border rounded-xl shadow-md">
      <h1 className="text-2xl font-bold mb-4 text-center">📣 헌법재판소 청원 보내기</h1>

      {submitted ? (
        <div className="space-y-4">
          <div className="text-green-600 text-center font-semibold">
            청원이 정상적으로 {isEditing ? '수정' : '제출'}되었습니다. 감사합니다!
          </div>
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">현재 청원 내용</h3>
            <div className="space-y-2 text-sm">
              {judge && <p><span className="font-medium">담당 재판관:</span> {judge}</p>}
              {name && <p><span className="font-medium">이름:</span> {name}</p>}
              {organization && <p><span className="font-medium">소속 단체:</span> {organization}</p>}
              <p><span className="font-medium">청원 내용:</span></p>
              <p className="whitespace-pre-wrap">{message}</p>
            </div>
          </div>
          {/* 수정 버튼 임시 비활성화
          <div className="text-center">
            <button
              onClick={handleEdit}
              className="bg-gray-200 text-gray-700 py-2 px-4 rounded hover:bg-gray-300"
            >
              청원 수정
            </button>
          </div>
          */}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <select
            required
            value={judge}
            onChange={(e) => setJudge(e.target.value)}
            className="border p-2 rounded appearance-none bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%23343a40%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_12px] bg-[right_0.5rem_center] bg-no-repeat pr-10 h-[42px]"
            disabled={isLoading}
          >
            <option value="">재판관 선택</option>
            <option value="문형배">문형배</option>
            <option value="이미선">이미선</option>
            <option value="김형두">김형두</option>
            <option value="정정미">정정미</option>
            <option value="정형식">정형식</option>
            <option value="김복형">김복형</option>
            <option value="조한창">조한창</option>
            <option value="정계선">정계선</option>
          </select>
          
          <input
            type="text"
            placeholder="이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border p-2 rounded"
            disabled={isLoading}
          />

          <input
            type="text"
            placeholder="소속 단체 (예: 전국고양이집사연합)"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className="border p-2 rounded"
            disabled={isLoading}
          />

          <textarea
            value={message}
            placeholder="청원 내용"
            onChange={(e) => setMessage(e.target.value)}
            className="border p-2 rounded h-32 resize-none"
            disabled={isLoading}
          />
          <small>취지에 맞지 않은 청원 메세지는 운영 원칙에 따라 비공개 처리될 수 있습니다</small>

          {!isEditing && (
            <div className="overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
                className="p-2 text-left hover:bg-gray-100 flex justify-between items-center"
              >
                <span>{showAdditionalInfo ? '▾' : '▸'} 추가 정보 입력 (선택)</span>
              </button>
              {showAdditionalInfo && (
                <div className="p-4 space-y-4">
                  <div className="px-2 text-sm text-gray-500">
                    통계를 위한 추가 정보입니다.
                  </div>
                  <div className="flex gap-4">
                    <select
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      className="border p-2 rounded appearance-none bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%23343a40%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_12px] bg-[right_0.5rem_center] bg-no-repeat pr-10 h-[42px] w-[120px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-calendar-picker-indicator]:appearance-none"
                      disabled={isLoading}
                    >
                      <option value="">연령</option>
                      <option value="10대">10대</option>
                      <option value="20대">20대</option>
                      <option value="30대">30대</option>
                      <option value="40대">40대</option>
                      <option value="50대">50대</option>
                      <option value="60대 이상">60대 이상</option>
                    </select>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="border p-2 rounded appearance-none bg-white bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20stroke%3D%22%23343a40%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%222%22%20d%3D%22M6%208l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px_12px] bg-[right_0.5rem_center] bg-no-repeat pr-10 h-[42px] w-[120px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-calendar-picker-indicator]:appearance-none"
                      disabled={isLoading}
                    >
                      <option value="">성별</option>
                      <option value="남성">남성</option>
                      <option value="여성">여성</option>
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      onChange={handleLocationShare}
                      disabled={isLoading}
                    />
                    위치 공유 {latitude && longitude && <small>({latitude?.toFixed(4)} {longitude?.toFixed(4)})</small>}
                  </label>
                </div>
              )}
            </div>
          )}

          <button
            type="submit"
            className={`bg-black text-white py-2 px-4 rounded hover:bg-gray-800 ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={isLoading}
          >
            {isLoading ? '제출 중...' : isEditing ? '수정하기' : '청원 제출'}
          </button>
          <center><small>청원은 회선당 1회만 가능합니다.</small></center>
        </form>
      )}
    </div>
  );
}


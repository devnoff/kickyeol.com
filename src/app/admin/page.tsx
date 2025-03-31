'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth';
import { updatePetitionStatus } from '@/lib/admin';
import { auth } from '@/lib/firebase';
import { formatRelativeTime } from '@/lib/utils';

interface Petition {
  id: string;
  name: string;
  message: string;
  organization: string;
  judge: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface PetitionStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
}

export default function AdminPage() {
  const { session, loading } = useSession();
  const router = useRouter();
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [lastDocId, setLastDocId] = useState<string | null>(null);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [stats, setStats] = useState<PetitionStats | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');
  const [isMigratingPersonalInfo, setIsMigratingPersonalInfo] = useState(false);
  const [personalInfoMigrationMessage, setPersonalInfoMigrationMessage] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  const fetchPetitions = useCallback(async (loadMore = false) => {
    try {
      const url = new URL('https://us-central1-tackhack-1c40e.cloudfunctions.net/getPetitions');
      if (loadMore && lastDocId) {
        url.searchParams.append('lastDocId', lastDocId);
      }
      if (selectedStatus !== 'all') {
        url.searchParams.append('status', selectedStatus);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        }
      });

      if (!response.ok) {
        if (response.status === 401) {
          // 세션 쿠키 삭제
          document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
          router.push('/admin/login');
          return;
        }
        throw new Error('Failed to fetch petitions');
      }

      const { data, hasMore: hasMoreData, lastDocId: newLastDocId } = await response.json();
      
      setPetitions(prev => loadMore ? [...prev, ...data] : data);
      setHasMore(hasMoreData);
      setLastDocId(newLastDocId);
    } catch (error) {
      console.error('청원 목록을 불러오는데 실패했습니다:', error);
      if (error instanceof Error && error.message.includes('401')) {
        document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        router.push('/admin/login');
      }
    }
  }, [session, lastDocId, selectedStatus, router]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch('https://us-central1-tackhack-1c40e.cloudfunctions.net/getPetitionStats', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        }
      });
      
      if (!response.ok) {
        throw new Error('통계 정보를 가져오는데 실패했습니다.');
      }

      const { data } = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [session]);

  useEffect(() => {
    if (!loading && !session) {
      router.push('/admin/login');
    }
  }, [session, loading, router]);

  useEffect(() => {
    if (session) {
      fetchPetitions();
      fetchStats();
    }
  }, [session, selectedStatus, fetchPetitions, fetchStats]);

  const handleStatusChange = async (id: string, status: 'approved' | 'rejected' | 'pending') => {
    try {
      await updatePetitionStatus({ id, status });
      setPetitions(prev => prev.map(petition => 
        petition.id === id ? { ...petition, status } : petition
      ));
      // 상태 변경 후 통계 새로고침
      fetchStats();
    } catch (error) {
      console.error('상태 변경에 실패했습니다:', error);
    }
  };

  const handleLogout = async () => {
    try {
      // Firebase Auth 로그아웃
      await auth.signOut();
      
      // 세션 쿠키 삭제
      document.cookie = 'session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      
      router.push('/admin/login');
    } catch (error) {
      console.error('로그아웃 중 오류:', error);
    }
  };

  const processBatch = async () => {
    setProcessingBatch(true);
    try {
      const url = new URL('https://us-central1-tackhack-1c40e.cloudfunctions.net/processPendingPetitions');
      const response = await fetch(url.toString(), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        }
      });

      if (!response.ok) {
        throw new Error('배치 처리 중 오류가 발생했습니다.');
      }

      await response.json();
      fetchPetitions(); // 청원 목록 새로고침
      fetchStats(); // 통계 새로고침
    } catch (error) {
      console.error('배치 처리 중 오류:', error);
    } finally {
      setProcessingBatch(false);
    }
  };

  const handleStatusFilter = (status: 'all' | 'pending' | 'approved' | 'rejected') => {
    setSelectedStatus(status);
    setLastDocId(null);
    fetchPetitions(false);
  };

  const handleMigration = async () => {
    if (!confirm('status가 없는 청원들을 pending 상태로 업데이트하시겠습니까?')) {
      return;
    }

    setIsMigrating(true);
    setMigrationMessage('마이그레이션 중...');

    try {
      const response = await fetch('https://us-central1-tackhack-1c40e.cloudfunctions.net/updateEmptyStatusToPending', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        }
      });

      if (!response.ok) {
        throw new Error('마이그레이션 실패');
      }

      const data = await response.json();
      setMigrationMessage(`마이그레이션 완료: ${data.updatedCount}개의 문서가 업데이트되었습니다.`);
      
      // 통계 새로고침
      fetchStats();
    } catch (error) {
      console.error('Migration error:', error);
      setMigrationMessage('마이그레이션 중 오류가 발생했습니다.');
    } finally {
      setIsMigrating(false);
    }
  };

  const handlePersonalInfoMigration = async () => {
    if (!confirm('개인정보를 별도 컬렉션으로 마이그레이션하시겠습니까?')) {
      return;
    }

    setIsMigratingPersonalInfo(true);
    setPersonalInfoMigrationMessage('마이그레이션 중...');

    try {
      const response = await fetch('https://us-central1-tackhack-1c40e.cloudfunctions.net/migratePersonalInfo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session}`
        }
      });

      if (!response.ok) {
        throw new Error('마이그레이션 실패');
      }

      const data = await response.json();
      setPersonalInfoMigrationMessage(`마이그레이션 완료: ${data.migratedCount}개의 문서가 마이그레이션되었습니다.`);
    } catch (error) {
      console.error('Personal info migration error:', error);
      setPersonalInfoMigrationMessage('마이그레이션 중 오류가 발생했습니다.');
    } finally {
      setIsMigratingPersonalInfo(false);
    }
  };

  const handleLoadMore = async () => {
    setIsLoadingMore(true);
    try {
      await fetchPetitions(true);
    } finally {
      setIsLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">로딩 중...</div>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center">
          <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            관리자 페이지
          </h1>
        </div>

        {/* 통계 카드 */}
        {stats && (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div 
              className={`bg-white overflow-hidden shadow rounded-lg cursor-pointer transition-colors ${
                selectedStatus === 'all' ? 'ring-2 ring-blue-500' : ''
              }`}
              onClick={() => handleStatusFilter('all')}
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">전체 청원</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.total}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div 
              className={`bg-white overflow-hidden shadow rounded-lg cursor-pointer transition-colors ${
                selectedStatus === 'pending' ? 'ring-2 ring-yellow-500' : ''
              }`}
              onClick={() => handleStatusFilter('pending')}
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">승인 대기</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.pending}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div 
              className={`bg-white overflow-hidden shadow rounded-lg cursor-pointer transition-colors ${
                selectedStatus === 'approved' ? 'ring-2 ring-green-500' : ''
              }`}
              onClick={() => handleStatusFilter('approved')}
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">승인</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.approved}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div 
              className={`bg-white overflow-hidden shadow rounded-lg cursor-pointer transition-colors ${
                selectedStatus === 'rejected' ? 'ring-2 ring-red-500' : ''
              }`}
              onClick={() => handleStatusFilter('rejected')}
            >
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">거절</dt>
                      <dd className="text-lg font-semibold text-gray-900">{stats.rejected}</dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">청원 관리</h1>
            <div className="flex gap-4 items-center">
              <button
                onClick={processBatch}
                disabled={processingBatch}
                className={`px-4 py-2 rounded ${
                  processingBatch
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {processingBatch ? '처리 중...' : '청원 처리 시작'}
              </button>
              <button
                onClick={handleLogout}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                로그아웃
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {petitions.map((petition) => (
              <div key={petition.id} className="border p-4 rounded">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold">{petition.name}</h3>
                    <p className="text-sm text-gray-600">{petition.organization}</p>
                    <p className="text-sm text-gray-600">재판관: {petition.judge}</p>
                    <p className="text-sm text-gray-500">
                      {formatRelativeTime(petition.createdAt)}
                    </p>
                    <p className="mt-2">{petition.message}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleStatusChange(petition.id, 'pending')}
                      className={`w-20 px-3 py-1 rounded text-center ${
                        petition.status === 'pending'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-200'
                      }`}
                    >
                      대기
                    </button>
                    <button
                      onClick={() => handleStatusChange(petition.id, 'approved')}
                      className={`w-20 px-3 py-1 rounded text-center ${
                        petition.status === 'approved'
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-200'
                      }`}
                    >
                      승인
                    </button>
                    <button
                      onClick={() => handleStatusChange(petition.id, 'rejected')}
                      className={`w-20 px-3 py-1 rounded text-center ${
                        petition.status === 'rejected'
                          ? 'bg-red-500 text-white'
                          : 'bg-gray-200'
                      }`}
                    >
                      거절
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {hasMore && (
              <div className="text-center mt-4">
                <button
                  onClick={handleLoadMore}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
                  disabled={isLoadingMore}
                >
                  {isLoadingMore ? '로딩 중...' : '더 보기'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 마이그레이션 버튼들 */}
        <div className="mt-8 space-y-4">
          <div>
            <button
              onClick={handleMigration}
              disabled={isMigrating}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                isMigrating 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {isMigrating ? '마이그레이션 중...' : 'Status 마이그레이션'}
            </button>
            {migrationMessage && (
              <p className="mt-2 text-sm text-gray-600">{migrationMessage}</p>
            )}
          </div>

          <div>
            <button
              onClick={handlePersonalInfoMigration}
              disabled={isMigratingPersonalInfo}
              className={`px-4 py-2 rounded-md text-white font-medium ${
                isMigratingPersonalInfo 
                  ? 'bg-gray-400 cursor-not-allowed' 
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
            >
              {isMigratingPersonalInfo ? '마이그레이션 중...' : '개인정보 마이그레이션'}
            </button>
            {personalInfoMigrationMessage && (
              <p className="mt-2 text-sm text-gray-600">{personalInfoMigrationMessage}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
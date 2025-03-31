import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as turf from '@turf/turf';
import * as geojson from './districts.json';
import * as badwords from './badwords.json';
import { BigQuery } from '@google-cloud/bigquery';
import { CallableRequest } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();

const cors = require('cors')({ 
  origin: [
    'http://localhost:3000',
    'https://kickyeol.com',
    'https://tackhack-1c40e.web.app',
    'https://tackhack-1c40e.firebaseapp.com',
  ],
  methods: ['GET', 'POST', 'PATCH'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']  // 허용할 헤더 추가
});

admin.initializeApp();
const db = admin.firestore();
const bigquery = new BigQuery();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });

function getRegionFromCoordinates(lat: number, lng: number): string | null {
  const point = turf.point([lng, lat]);

  for (const feature of (geojson as any).features) {
    const polygon = turf.polygon(feature.geometry.coordinates);
    if (turf.booleanPointInPolygon(point, polygon)) {
      return feature.properties.SIG_KOR_NM || null;
    }
  }

  return null;
}

function maskBadWords(text: string): string {
  const badWordsList = (badwords as any).badwords;
  let maskedText = text;

  for (const word of badWordsList) {
    const regex = new RegExp(word, 'gi');
    maskedText = maskedText.replace(regex, '*'.repeat(word.length));
  }

  return maskedText;
}

// BigQuery 데이터 동기화 함수
async function syncToBigQuery(data: any) {
  try {
    const dataset = bigquery.dataset('petitions');
    const table = dataset.table('raw_data');

    const rows = [{
      name: data.name,
      message: data.message,
      organization: data.organization,
      judge: data.judge,
      masked_ip: data.maskedIp,
      age: data.age || null,
      gender: data.gender || null,
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      region: data.region || null,
      created_at: admin.firestore.Timestamp.now().toDate().toISOString()
    }];

    await table.insert(rows);
    console.log('Successfully synced to BigQuery');
  } catch (error) {
    console.error('Error syncing to BigQuery:', error);
  }
}

// IP와 Fingerprint ID 기반 제한을 위한 함수 수정
async function checkSubmissionLimit(ip: string, fingerprintId: string): Promise<boolean> {
  const now = admin.firestore.Timestamp.now();
  const oneHourAgo = new Date(now.toDate().getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.toDate().getTime() - 24 * 60 * 60 * 1000);

  try {
    // IP 기반 제한 체크 (더 여유있게)
    const ipRef = db.collection('submission_limits');
    const recentIpSubmissions = await ipRef
      .where('ip', '==', ip)
      .where('timestamp', '>', oneHourAgo)
      .get();

    // Fingerprint ID 기반 제한 체크 (더 엄격하게)
    const fingerprintRef = db.collection('submission_limits');
    const recentFingerprintSubmissions = await fingerprintRef
      .where('fingerprintId', '==', fingerprintId)
      .where('timestamp', '>', oneDayAgo)
      .get();

    // IP는 1시간당 최대 10회, Fingerprint ID는 24시간당 최대 3회로 제한
    const isIpAllowed = recentIpSubmissions.size < 10;
    const isFingerprintAllowed = recentFingerprintSubmissions.size < 3;

    // IP 제한 초과 시 경고 메시지 포함
    if (!isIpAllowed) {
      console.warn(`IP ${ip} 제한 초과: ${recentIpSubmissions.size}회/시간`);
    }

    // Fingerprint ID 제한 초과 시 로그 기록
    if (!isFingerprintAllowed) {
      console.warn(`Fingerprint ID ${fingerprintId} 제한 초과: ${recentFingerprintSubmissions.size}회/일`);
    }

    // Fingerprint ID 제한이 더 중요하므로, 이를 우선 체크
    if (!isFingerprintAllowed) {
      return false;
    }

    // IP 제한은 경고만 하고 허용
    return true;
  } catch (error) {
    console.error('제한 체크 중 오류:', error);
    throw new Error('Firestore 인덱스가 필요합니다. Firebase Console에서 인덱스를 생성하세요.');
  }
}

// Gemini API 호출 함수
async function analyzePetitionWithGemini(data: any): Promise<BatchResult> {
  let retries = 3;
  let lastError: Error | null = null;

  while (retries > 0) {
    try {
      const prompt = `당신은 청원 메시지를 필터링하는 역할입니다.
부드러운 비판이나 일반적인 의견은 허용하되, 
# 다음 기준에 부합하면 '어뷰징'이라고 판단하세요:

1) 욕설이나 조롱
2) 사이트 목적(윤석열 탄핵 청원)과 명백히 반대되는 내용
3) 윤석열 지지, 복귀 청원
4) 탄핵 기각, 각하 요청
5) 작성자명이나 단체명이 사이트 목적과 반대되는 경우

# 다음 기준에 부합하면 '정상'이라고 판단하세요:
1) 탄핵 요구 및 명령
2) 탄핵 선고 요구 및 명령
3) 파면 명령 및 요구
4) 파면 선고 명령 및 요구

결과는 각각 '정상' 또는 '어뷰징'만으로 요약해주세요.

Response Format
{
  "isAbusive": boolean,
  "confidence": number,
  "reason": string
}

Example
{
  "isAbusive": true,
  "confidence": 0.95,
  "reason": "작성자명이 부적절하고 내용이 사이트 목적과 반대됨"
}

다음 청원 내용이 부적절하거나 어뷰징인지 판단해주세요.
응답은 JSON 형식으로 {"isAbusive": boolean, "confidence": number, "reason": string}로 주세요.

작성자: ${data.name || '익명'}
단체: ${data.organization || '없음'}
청원 내용: ${data.message}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      // JSON 파싱 전에 텍스트 정리
      let jsonText = text.trim();
      // ```json과 ``` 제거
      jsonText = jsonText.replace(/```json\s*/, '').replace(/```\s*$/, '');
      
      try {
        const parsedResult = JSON.parse(jsonText);
        
        // 로그 기록
        await db.collection('petition_logs').add({
          petitionId: data.petitionId,
          name: data.name || '익명',
          organization: data.organization || '없음',
          message: data.message,
          result: parsedResult,
          rawResponse: text,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          model: "gemini-1.5-flash-8b"
        });

        return {
          docId: data.petitionId,
          ...parsedResult
        };
      } catch (parseError: any) {
        console.error('JSON 파싱 오류:', parseError, '원본 텍스트:', text);
        
        // 에러 로그 기록
        await db.collection('petition_logs').add({
          petitionId: data.petitionId,
          name: data.name || '익명',
          organization: data.organization || '없음',
          message: data.message,
          error: parseError.message,
          rawResponse: text,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          model: "gemini-1.5-flash-8b"
        });
        
        throw new Error('API 응답을 파싱할 수 없습니다.');
      }
    } catch (error) {
      lastError = error as Error;
      if (error instanceof Error && error.message.includes('429')) {
        retries--;
        if (retries > 0) {
          // 재시도 전 대기 시간을 점진적으로 증가
          const waitTime = (4 - retries) * 5000; // 5초, 10초, 15초
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }
      }
      break;
    }
  }

  // 모든 재시도 실패 시 기본값 반환
  console.error(`청원 ${data.petitionId} 처리 중 오류:`, lastError);
  
  // 에러 로그 기록
  await db.collection('petition_logs').add({
    petitionId: data.petitionId,
    name: data.name || '익명',
    organization: data.organization || '없음',
    message: data.message,
    error: lastError?.message || '알 수 없는 오류',
    rawResponse: lastError?.message || '알 수 없는 오류',
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    model: "gemini-1.5-flash-8b"
  });

  return {
    docId: data.petitionId,
    isAbusive: false,
    confidence: 0,
    error: lastError?.message || '알 수 없는 오류',
    shouldKeepPending: true
  };
}

interface PetitionData {
  name: string;
  message: string;
  organization: string | null;
  judge: string | null;
  maskedIp: string;
  petitionId: string;
  status?: 'pending' | 'approved' | 'rejected';
  createdAt: admin.firestore.FieldValue;
}

export const submitPetition = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || req.ip || 'unknown';
    
    // IPv4와 IPv6 모두 처리하는 마스킹 함수
    const maskIp = (ip: string): string => {
      if (ip === 'unknown') return ip;
      
      // IPv6 주소인 경우
      if (ip.includes(':')) {
        const parts = ip.split(':');
        if (parts.length > 4) {
          // 마지막 4개 부분을 마스킹
          parts.splice(-4, 4, '****');
        }
        return parts.join(':');
      }
      
      // IPv4 주소인 경우
      return ip.replace(/\.\d+\.\d+$/, '.***.***');
    };

    const maskedIp = maskIp(ip);

    const { name, message, organization, judge, latitude, longitude, age, gender, petitionId, isEdit, editId } = req.body;

    // 수정이 아닐 때만 제한 체크
    if (!isEdit) {
      try {
        const isAllowed = await checkSubmissionLimit(ip, petitionId);
        if (!isAllowed) {
          res.status(429).send('청원 제출 횟수가 제한되었습니다. 24시간 후에 다시 시도해주세요.');
          return;
        }

        // 제한 기록 추가
        await db.collection('submission_limits').add({
          ip,
          fingerprintId: petitionId,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          userAgent: req.headers['user-agent'] || 'unknown'
        });
      } catch (error) {
        console.error('제한 체크 중 오류:', error);
        res.status(500).send('서버 오류가 발생했습니다.');
        return;
      }
    }

    if (!message || typeof message !== 'string') {
      res.status(400).send('Invalid message');
      return;
    }

    if (!petitionId || typeof petitionId !== 'string') {
      res.status(400).send('Invalid petition ID');
      return;
    }

    const sanitizedMessage = maskBadWords(message.trim());
    const sanitizedName = name ? maskBadWords(name) : '익명';
    const sanitizedOrganization = organization ? maskBadWords(organization) : null;

    // 수정이 아닐 때만 중복 체크
    if (!isEdit) {
      const existing = await db.collection('petitions_meta')
        .where('petitionId', '==', petitionId)
        .limit(1)
        .get();

      if (!existing.empty) {
        res.status(403).send('이미 청원을 제출하셨습니다.');
        return;
      }
    }

    let region: string | null = null;
    if (latitude && longitude) {
      region = getRegionFromCoordinates(Number(latitude), Number(longitude));
    }

    try {
      if (isEdit && editId) {
        // 트랜잭션 사용
        await db.runTransaction(async (transaction) => {
          // 기존 청원 데이터 찾기
          const petitionsRef = db.collection('petitions')
            .where('petitionId', '==', petitionId);
          const petitions = await transaction.get(petitionsRef);

          if (petitions.empty) {
            throw new Error('청원을 찾을 수 없습니다.');
          }

          const docId = petitions.docs[0].id;
          const oldData = petitions.docs[0].data();
          const oldJudge = oldData.judge;

          // 재판관이 변경된 경우에만 통계 업데이트
          if (oldJudge !== judge) {
            const statsRef = db.collection('stats');

            // 현재 통계 데이터 읽기
            const judgesStatsRef = statsRef.doc('judges');
            const judgesStats = await transaction.get(judgesStatsRef);
            const currentStats = judgesStats.data() || {};

            // 새로운 통계 계산
            const updates: { [key: string]: any } = {
              judges: {
                ...currentStats
              }
            };

            // 이전 재판관 카운트 감소
            if (oldJudge) {
              updates.judges[oldJudge] = (currentStats[oldJudge] || 0) - 1;

              // 조합 통계 업데이트 (감소)
              if (age || gender || region) {
                const combinationRefs = [
                  age && ['age_judge', `${age}_${oldJudge}`],
                  gender && ['gender_judge', `${gender}_${oldJudge}`],
                  region && ['region_judge', `${region}_${oldJudge}`]
                ].filter(Boolean);

                for (const [docName, fieldName] of combinationRefs) {
                  const ref = statsRef.doc(docName as string);
                  const doc = await transaction.get(ref);
                  const data = doc.data() || {};
                  updates[docName as string] = {
                    ...data,
                    [fieldName as string]: (data[fieldName as string] || 0) - 1
                  };
                }
              }
            }

            // 새 재판관 카운트 증가
            if (judge) {
              updates.judges[judge] = (currentStats[judge] || 0) + 1;

              // 조합 통계 업데이트 (증가)
              if (age || gender || region) {
                const combinationRefs = [
                  age && ['age_judge', `${age}_${judge}`],
                  gender && ['gender_judge', `${gender}_${judge}`],
                  region && ['region_judge', `${region}_${judge}`]
                ].filter(Boolean);

                for (const [docName, fieldName] of combinationRefs) {
                  const ref = statsRef.doc(docName as string);
                  const doc = await transaction.get(ref);
                  const data = doc.data() || {};
                  updates[docName as string] = {
                    ...(updates[docName as string] || data),
                    [fieldName as string]: ((updates[docName as string]?.[fieldName as string]) || (data[fieldName as string] || 0)) + 1
                  };
                }
              }
            }

            // 트랜잭션 내에서 모든 업데이트 수행
            Object.entries(updates).forEach(([docName, data]) => {
              transaction.set(statsRef.doc(docName), data, { merge: true });
            });
          }

          // 청원 데이터 업데이트
          transaction.update(db.collection('petitions').doc(docId), {
            name: sanitizedName,
            message: sanitizedMessage,
            organization: sanitizedOrganization,
            judge: judge || null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });

        res.status(200).send('Petition updated');
        return;
      }

      // 새로운 청원 제출 로직
      const petitionData: PetitionData = {
        name: sanitizedName,
        message: sanitizedMessage,
        organization: sanitizedOrganization,
        judge: judge || null,
        maskedIp,
        petitionId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Gemini API로 청원 분석
      const analysisResult = await analyzePetitionWithGemini(petitionData);
      
      // 분석 결과에 따라 상태 설정
      petitionData.status = analysisResult.shouldKeepPending ? 'pending' : 
        (analysisResult.isAbusive ? 'rejected' : 'approved');

      // 개인정보 저장
      if (age || gender || latitude || longitude) {
        const personalInfo: PersonalInfo = {
          age: age || null,
          gender: gender || null,
          latitude: latitude || null,
          longitude: longitude || null,
          region: region || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        // UUID를 사용하여 고유 식별자 생성
        const personalInfoId = uuidv4();
        await db.collection('personal_info').doc(personalInfoId).set(personalInfo);
      }

      // Firestore에 저장
      await db.collection('petitions').add(petitionData);

      // BigQuery에 동기화 (개인정보 제외)
      await syncToBigQuery(petitionData);

      // IP 메타데이터 저장
      await db.collection('petitions_meta').doc(petitionId).set({
        ip,
        petitionId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // 배치 작업 생성
      const batch = db.batch();
      const statsRef = db.collection('stats');

      // 전역 통계 업데이트
      batch.set(statsRef.doc('global'), {
        totalCount: admin.firestore.FieldValue.increment(1)
      }, { merge: true });

      // 1. 단일 속성 통계
      if (age) {
        batch.set(statsRef.doc('ages'), {
          [age]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (gender) {
        batch.set(statsRef.doc('genders'), {
          [gender]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (region) {
        batch.set(statsRef.doc('regions'), {
          [region]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (judge) {
        batch.set(statsRef.doc('judges'), {
          [judge]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      // 2. 2개 속성 조합 통계
      if (age && gender) {
        batch.set(statsRef.doc('age_gender'), {
          [`${age}_${gender}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (age && region) {
        batch.set(statsRef.doc('age_region'), {
          [`${age}_${region}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (age && judge) {
        batch.set(statsRef.doc('age_judge'), {
          [`${age}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (gender && region) {
        batch.set(statsRef.doc('gender_region'), {
          [`${gender}_${region}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (gender && judge) {
        batch.set(statsRef.doc('gender_judge'), {
          [`${gender}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (region && judge) {
        batch.set(statsRef.doc('region_judge'), {
          [`${region}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      // 3. 3개 속성 조합 통계
      if (age && gender && region) {
        batch.set(statsRef.doc('age_gender_region'), {
          [`${age}_${gender}_${region}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (age && gender && judge) {
        batch.set(statsRef.doc('age_gender_judge'), {
          [`${age}_${gender}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (age && region && judge) {
        batch.set(statsRef.doc('age_region_judge'), {
          [`${age}_${region}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      if (gender && region && judge) {
        batch.set(statsRef.doc('gender_region_judge'), {
          [`${gender}_${region}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      // 4. 4개 속성 조합 통계
      if (age && gender && region && judge) {
        batch.set(statsRef.doc('age_gender_region_judge'), {
          [`${age}_${gender}_${region}_${judge}`]: admin.firestore.FieldValue.increment(1)
        }, { merge: true });
      }

      // 배치 작업 실행
      await batch.commit();

      res.status(200).send('Petition submitted');
    } catch (error) {
      console.error('Error updating petition:', error);
      res.status(500).send('Server error');
    }
  });
});

export const getPetition = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const petitionId = req.path.split('/').pop();
    if (!petitionId) {
      res.status(400).send('Invalid petition ID');
      return;
    }

    try {
      const petitions = await db.collection('petitions')
        .where('petitionId', '==', petitionId)
        .limit(1)
        .get();

      if (petitions.empty) {
        res.status(404).send('Petition not found');
        return;
      }

      const petition = petitions.docs[0].data();
      res.status(200).json({
        ...petition,
        updatedAt: petition.updatedAt?.toDate().getTime() || petition.createdAt?.toDate().getTime()
      });
    } catch (error) {
      console.error('Error fetching petition:', error);
      res.status(500).send('Server error');
    }
  });
});

// 관리자 로그인 함수
export const adminLogin = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      console.log('Request body:', req.body);
      const { data } = req.body;
      const idToken = data.idToken;

      if (!idToken || typeof idToken !== 'string') {
        throw new Error('Invalid ID token');
      }

      const decodedToken = await admin.auth().verifyIdToken(idToken);
      console.log('Decoded token:', decodedToken);
      
      if (!decodedToken.admin) {
        console.log('Admin claim not found');
        res.status(403).json({ data: { error: '관리자 권한이 없습니다.' } });
        return;
      }

      const sessionCookie = await admin.auth().createSessionCookie(idToken, {
        expiresIn: 60 * 60 * 24 * 5 * 1000
      });

      res.json({ 
        data: { 
          sessionCookie 
        } 
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(401).json({ data: { error: '인증에 실패했습니다.' } });
    }
  });
});

// 청원 목록 조회 함수
export const getPetitions = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Authorization 헤더에서 세션 토큰 읽기
      const authHeader = req.headers.authorization;
      const session = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      if (!session) {
        res.status(401).json({ error: '인증이 필요합니다.' });
        return;
      }

      const decodedToken = await admin.auth().verifySessionCookie(session);
      if (!decodedToken.admin) {
        res.status(403).json({ error: '관리자 권한이 필요합니다.' });
        return;
      }

      // 페이지네이션 파라미터
      const limit = 10; // 한 페이지당 항목 수
      const lastDocId = req.query.lastDocId as string | undefined;
      const status = req.query.status as string | undefined;
      let query = db.collection('petitions').orderBy('createdAt', 'desc').limit(limit);

      // 상태 필터 적용
      if (status) {
        if (status === 'pending') {
          // pending 상태는 status가 'pending'이거나 status 속성이 없는 경우
          const [pendingDocs, nullDocs] = await Promise.all([
            db.collection('petitions')
              .where('status', '==', 'pending')
              .orderBy('createdAt', 'desc')
              .limit(limit)
              .get(),
            db.collection('petitions')
              .where('status', '==', null)
              .orderBy('createdAt', 'desc')
              .limit(limit)
              .get()
          ]);

          // 두 결과를 합치고 createdAt 기준으로 정렬
          const allDocs = [...pendingDocs.docs, ...nullDocs.docs]
            .sort((a, b) => {
              const aTime = a.data().createdAt?.toDate().getTime() || 0;
              const bTime = b.data().createdAt?.toDate().getTime() || 0;
              return bTime - aTime;
            })
            .slice(0, limit);

          const hasMore = allDocs.length === limit;
          const petitions = allDocs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate().toISOString(),
          }));

          res.json({ 
            data: petitions,
            hasMore,
            lastDocId: allDocs[allDocs.length - 1]?.id
          });
          return;
        } else {
          query = query.where('status', '==', status);
        }
      }

      // 마지막 문서 ID가 제공된 경우, 해당 문서부터 시작
      if (lastDocId) {
        const lastDoc = await db.collection('petitions').doc(lastDocId).get();
        if (lastDoc.exists) {
          query = query.startAfter(lastDoc);
        }
      }

      const petitionsSnapshot = await query.get();
      
      // 다음 페이지가 있는지 확인
      const hasMore = petitionsSnapshot.docs.length === limit;
      
      const petitions = petitionsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate().toISOString(),
      }));

      res.json({ 
        data: petitions,
        hasMore,
        lastDocId: petitionsSnapshot.docs[petitionsSnapshot.docs.length - 1]?.id
      });
    } catch (error) {
      console.error('Error:', error);
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  });
});

interface UpdatePetitionStatusData {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface DeletePetitionData {
  id: string;
}

// 청원 상태 업데이트 함수
export const updatePetitionStatus = functions.https.onCall<UpdatePetitionStatusData>(async (request: CallableRequest<UpdatePetitionStatusData>) => {
  if (!request.auth?.token.admin) {
    throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
  }

  const { id, status } = request.data;
  if (!id || !status) {
    throw new functions.https.HttpsError('invalid-argument', '잘못된 요청입니다.');
  }

  try {
    await db.collection('petitions').doc(id).update({
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
  } catch (error) {
    console.error('Error:', error);
    throw new functions.https.HttpsError('internal', '서버 오류가 발생했습니다.');
  }
});

export const setAdmin = functions.https.onRequest(async (req, res) => {
  const uid = req.query.uid as string;
  if (!uid) {
    res.status(400).send('UID is required');
    return;
  }

  try {
    await admin.auth().setCustomUserClaims(uid, {admin: true});
    res.status(200).send(`Successfully set admin claim for ${uid}`);
  } catch (error) {
    res.status(500).send(`Error setting admin claim: ${error}`);
  }
});

export const deletePetition = functions.https.onCall<DeletePetitionData>(async (request: CallableRequest<DeletePetitionData>) => {
  if (!request.auth?.token.admin) {
    throw new functions.https.HttpsError('permission-denied', '관리자 권한이 필요합니다.');
  }

  const { id } = request.data;
  if (!id) {
    throw new functions.https.HttpsError('invalid-argument', '청원 ID가 필요합니다.');
  }

  try {
    // 청원 데이터 가져오기
    const petitionDoc = await db.collection('petitions').doc(id).get();
    if (!petitionDoc.exists) {
      throw new functions.https.HttpsError('not-found', '청원을 찾을 수 없습니다.');
    }

    const petitionData = petitionDoc.data();

    // 트랜잭션으로 통계 업데이트 및 청원 삭제
    await db.runTransaction(async (transaction) => {
      const statsRef = db.collection('stats');

      // 1. 단일 속성 통계 감소
      if (petitionData?.age) {
        transaction.set(statsRef.doc('ages'), {
          [petitionData.age]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.gender) {
        transaction.set(statsRef.doc('genders'), {
          [petitionData.gender]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.region) {
        transaction.set(statsRef.doc('regions'), {
          [petitionData.region]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.judge) {
        transaction.set(statsRef.doc('judges'), {
          [petitionData.judge]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      // 2. 2개 속성 조합 통계 감소
      if (petitionData?.age && petitionData?.gender) {
        transaction.set(statsRef.doc('age_gender'), {
          [`${petitionData.age}_${petitionData.gender}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.age && petitionData?.region) {
        transaction.set(statsRef.doc('age_region'), {
          [`${petitionData.age}_${petitionData.region}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.age && petitionData?.judge) {
        transaction.set(statsRef.doc('age_judge'), {
          [`${petitionData.age}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.gender && petitionData?.region) {
        transaction.set(statsRef.doc('gender_region'), {
          [`${petitionData.gender}_${petitionData.region}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.gender && petitionData?.judge) {
        transaction.set(statsRef.doc('gender_judge'), {
          [`${petitionData.gender}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.region && petitionData?.judge) {
        transaction.set(statsRef.doc('region_judge'), {
          [`${petitionData.region}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      // 3. 3개 속성 조합 통계 감소
      if (petitionData?.age && petitionData?.gender && petitionData?.region) {
        transaction.set(statsRef.doc('age_gender_region'), {
          [`${petitionData.age}_${petitionData.gender}_${petitionData.region}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.age && petitionData?.gender && petitionData?.judge) {
        transaction.set(statsRef.doc('age_gender_judge'), {
          [`${petitionData.age}_${petitionData.gender}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.age && petitionData?.region && petitionData?.judge) {
        transaction.set(statsRef.doc('age_region_judge'), {
          [`${petitionData.age}_${petitionData.region}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      if (petitionData?.gender && petitionData?.region && petitionData?.judge) {
        transaction.set(statsRef.doc('gender_region_judge'), {
          [`${petitionData.gender}_${petitionData.region}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      // 4. 4개 속성 조합 통계 감소
      if (petitionData?.age && petitionData?.gender && petitionData?.region && petitionData?.judge) {
        transaction.set(statsRef.doc('age_gender_region_judge'), {
          [`${petitionData.age}_${petitionData.gender}_${petitionData.region}_${petitionData.judge}`]: admin.firestore.FieldValue.increment(-1)
        }, { merge: true });
      }

      // 전역 통계 감소
      transaction.set(statsRef.doc('global'), {
        totalCount: admin.firestore.FieldValue.increment(-1)
      }, { merge: true });

      // 청원 메타데이터 삭제
      if (petitionData?.petitionId) {
        transaction.delete(db.collection('petitions_meta').doc(petitionData.petitionId));
      }

      // 청원 삭제
      transaction.delete(db.collection('petitions').doc(id));
    });

    return { success: true };
  } catch (error) {
    console.error('Error:', error);
    throw new functions.https.HttpsError('internal', '서버 오류가 발생했습니다.');
  }
});

// OpenAI Batch API 관련 인터페이스
interface BatchResult {
  docId: string;
  isAbusive: boolean;
  confidence: number;
  error?: string;
  shouldKeepPending?: boolean;
  reason?: string;
}

// 승인되지 않은 청원들을 배치로 처리하는 함수
export const processPendingPetitions = functions.https.onRequest(async (req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    try {
      // Authorization 헤더에서 세션 토큰 읽기
      const authHeader = req.headers.authorization;
      const session = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      if (!session) {
        res.status(401).json({ error: '인증이 필요합니다.' });
        return;
      }

      const decodedToken = await admin.auth().verifySessionCookie(session);
      if (!decodedToken.admin) {
        res.status(403).json({ error: '관리자 권한이 필요합니다.' });
        return;
      }

      // 승인되지 않은 청원들 조회
      const allPetitions = await db.collection('petitions')
        .get();

      // status가 null이거나 없는 문서들만 필터링
      const pendingPetitions = allPetitions.docs
        .filter(doc => {
          const data = doc.data();
          return !data.status || data.status === null || data.status === 'pending';
        });

      const hasMorePending = pendingPetitions.length > 100;
      const petitionsToProcess = pendingPetitions.slice(0, 100);

      if (petitionsToProcess.length === 0) {
        res.status(200).json({ 
          message: '처리할 청원이 없습니다.',
          processedCount: 0,
          hasMorePending: false
        });
        return;
      }

      // 청원을 3개씩 나누어 병렬 처리 (분당 15개 제한 고려)
      const batchSize = 3;
      const batches = [];
      for (let i = 0; i < petitionsToProcess.length; i += batchSize) {
        batches.push(petitionsToProcess.slice(i, i + batchSize));
      }

      const results: BatchResult[] = [];
      for (const batch of batches) {
        const batchPromises = batch.map(async (doc) => {
          const data = doc.data();
          return analyzePetitionWithGemini(data);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // 각 배치 처리 후 4초 대기 (분당 15개 제한 준수)
        await new Promise(resolve => setTimeout(resolve, 4000));
      }

      // 트랜잭션으로 청원 상태 업데이트
      await db.runTransaction(async (transaction) => {
        for (const result of results) {
          const petitionRef = db.collection('petitions').doc(result.docId);
          
          // API 오류가 발생한 경우 pending 상태 유지
          if (result.shouldKeepPending) {
            transaction.update(petitionRef, {
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } else {
            transaction.update(petitionRef, {
              status: result.isAbusive ? 'rejected' : 'approved',
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          }
        }
      });

      res.status(200).json({
        message: '청원 처리가 완료되었습니다.',
        processedCount: results.length,
        hasMorePending
      });
    } catch (error) {
      console.error('Error processing pending petitions:', error);
      res.status(500).json({ 
        error: '서버 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : '알 수 없는 오류'
      });
    }
  });
});

// 통계 정보 조회 함수
export const getPetitionStats = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'GET') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Authorization 헤더에서 세션 토큰 읽기
      const authHeader = req.headers.authorization;
      const session = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      if (!session) {
        res.status(401).json({ error: '인증이 필요합니다.' });
        return;
      }

      const decodedToken = await admin.auth().verifySessionCookie(session);
      if (!decodedToken.admin) {
        res.status(403).json({ error: '관리자 권한이 필요합니다.' });
        return;
      }

      // 전체 통계 조회
      const statsRef = db.collection('stats');
      const globalStats = await statsRef.doc('global').get();
      const totalCount = globalStats.data()?.totalCount || 0;

      // 상태별 통계 조회
      const petitionsRef = db.collection('petitions');
      const [pendingCount, approvedCount, rejectedCount] = await Promise.all([
        // pending 상태는 status가 'pending'이거나 status 속성이 없는 경우
        Promise.all([
          petitionsRef.where('status', '==', 'pending').count().get(),
          petitionsRef.where('status', '==', null).count().get()
        ]).then(([pendingDocs, nullDocs]) => ({
          data: () => ({ count: pendingDocs.data().count + nullDocs.data().count })
        })),
        petitionsRef.where('status', '==', 'approved').count().get(),
        petitionsRef.where('status', '==', 'rejected').count().get()
      ]);

      const stats = {
        total: totalCount,
        pending: pendingCount.data().count,
        approved: approvedCount.data().count,
        rejected: rejectedCount.data().count
      };

      res.json({ data: stats });
    } catch (error) {
      console.error('Error fetching stats:', error);
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  });
});

// status가 없는 문서들을 'pending'으로 업데이트하는 마이그레이션 함수
export const updateEmptyStatusToPending = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Authorization 헤더에서 세션 토큰 읽기
      const authHeader = req.headers.authorization;
      const session = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      if (!session) {
        res.status(401).json({ error: '인증이 필요합니다.' });
        return;
      }

      const decodedToken = await admin.auth().verifySessionCookie(session);
      if (!decodedToken.admin) {
        res.status(403).json({ error: '관리자 권한이 필요합니다.' });
        return;
      }

      // status가 없는 문서들 조회
      const petitionsRef = db.collection('petitions');
      const petitions = await petitionsRef.get();

      let updatedCount = 0;
      const batch = db.batch();

      // 배치 크기 제한 (500)
      const BATCH_SIZE = 500;
      let currentBatchSize = 0;

      for (const doc of petitions.docs) {
        const data = doc.data();
        if (!data.status) {
          batch.update(doc.ref, {
            status: 'pending',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
          updatedCount++;
          currentBatchSize++;

          // 배치 크기가 제한에 도달하면 실행
          if (currentBatchSize >= BATCH_SIZE) {
            await batch.commit();
            currentBatchSize = 0;
          }
        }
      }

      // 남은 배치 작업 실행
      if (currentBatchSize > 0) {
        await batch.commit();
      }

      res.json({
        message: '마이그레이션이 완료되었습니다.',
        updatedCount
      });
    } catch (error) {
      console.error('Error updating empty status:', error);
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  });
});

interface PersonalInfo {
  age: string | null;
  gender: string | null;
  latitude: number | null;
  longitude: number | null;
  region: string | null;
  createdAt: admin.firestore.FieldValue;
}

// 개인정보 마이그레이션 함수
export const migratePersonalInfo = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Authorization 헤더에서 세션 토큰 읽기
      const authHeader = req.headers.authorization;
      const session = authHeader?.startsWith('Bearer ') 
        ? authHeader.substring(7) 
        : null;

      if (!session) {
        res.status(401).json({ error: '인증이 필요합니다.' });
        return;
      }

      const decodedToken = await admin.auth().verifySessionCookie(session);
      if (!decodedToken.admin) {
        res.status(403).json({ error: '관리자 권한이 필요합니다.' });
        return;
      }

      // 모든 청원 문서 조회
      const petitionsRef = db.collection('petitions');
      const petitions = await petitionsRef.get();

      let migratedCount = 0;
      const batch = db.batch();

      // 배치 크기 제한 (500)
      const BATCH_SIZE = 500;
      let currentBatchSize = 0;

      for (const doc of petitions.docs) {
        const data = doc.data();
        
        // 개인정보가 있는 경우에만 마이그레이션
        if (data.age || data.gender || data.latitude || data.longitude || data.region) {
          // UUID를 사용하여 고유 식별자 생성
          const personalInfoId = uuidv4();
          // 개인정보 문서 생성
          const personalInfoRef = db.collection('personal_info').doc(personalInfoId);
          const personalInfo: PersonalInfo = {
            age: data.age || null,
            gender: data.gender || null,
            latitude: data.latitude || null,
            longitude: data.longitude || null,
            region: data.region || null,
            createdAt: data.createdAt || admin.firestore.FieldValue.serverTimestamp()
          };

          batch.set(personalInfoRef, personalInfo);
          currentBatchSize++;

          // 청원 문서에서 개인정보 제거
          const petitionRef = petitionsRef.doc(doc.id);
          batch.update(petitionRef, {
            age: admin.firestore.FieldValue.delete(),
            gender: admin.firestore.FieldValue.delete(),
            latitude: admin.firestore.FieldValue.delete(),
            longitude: admin.firestore.FieldValue.delete(),
            region: admin.firestore.FieldValue.delete()
          });

          migratedCount++;

          // 배치 크기가 제한에 도달하면 실행
          if (currentBatchSize >= BATCH_SIZE) {
            await batch.commit();
            currentBatchSize = 0;
          }
        }
      }

      // 남은 배치 작업 실행
      if (currentBatchSize > 0) {
        await batch.commit();
      }

      res.json({
        message: '개인정보 마이그레이션이 완료되었습니다.',
        migratedCount
      });
    } catch (error) {
      console.error('Error migrating personal info:', error);
      res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
  });
});
import * as turf from '@turf/turf';
import geojson from './districts.json'; // 시군구 GeoJSON 파일 로드


export interface GeoJSON {
  type: string; // GeoJSON의 최상위 타입 (예: "FeatureCollection")
  features: GeoJSONFeature[]; // Feature 배열
}

export interface GeoJSONFeature {
  type: string; // Feature의 타입 (예: "Feature")
  geometry: Geometry; // 지리 정보
  properties: Properties; // 속성 정보
}

export interface Geometry {
  type: string; // Geometry 타입 (예: "Polygon", "MultiPolygon")
  coordinates: number[][][]; // 좌표 배열
}

export interface Properties {
  SIG_CD?: string; // 시군구 코드
  SIG_ENG_NM?: string; // 시군구 영어 이름
  SIG_KOR_NM?: string; // 시군구 한글 이름
  [key: string]: any; // 추가 속성
}

export const getRegionFromCoordinates = (lat: number, lng: number): string | null => {
  const point = turf.point([lng, lat]);

  for (const feature of (geojson as GeoJSON).features) {
    console.log(feature.geometry.coordinates, 'feature.geometry.coordinates', lng, lat, );
    const polygon = turf.polygon(feature.geometry.coordinates);
    if (turf.booleanPointInPolygon(point, polygon)) {
      return feature.properties.SIG_KOR_NM || null; // 해당 시군구 이름 반환
    }
  }

  return null; // 해당하는 시군구 없음
}

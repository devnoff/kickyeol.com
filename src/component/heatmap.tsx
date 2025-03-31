'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import districts from '../../lib/districts.json'
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Geometry } from 'geojson';
import { StyleFunction } from 'leaflet';

export interface GeoJSON {
  type: "FeatureCollection"; // GeoJSON의 최상위 타입을 명시적으로 지정
  features: GeoJSONFeature[]; // Feature 배열
}

export interface GeoJSONFeature {
  type: string; // Feature의 타입 (예: "Feature")
  geometry: Geometry; // 지리 정보
  properties: Properties; // 속성 정보
}

export interface Properties {
  SIG_CD?: string;
  SIG_ENG_NM?: string;
  SIG_KOR_NM?: string;
}

const MapContainer = dynamic(() => import('react-leaflet').then(mod => mod.MapContainer), { ssr: false });
const Geo = dynamic(() => import('react-leaflet').then(mod => mod.GeoJSON), { ssr: false });
const MapController = dynamic(() => import('@/component/MapController'), { ssr: false });

import 'leaflet/dist/leaflet.css';

type RegionStats = Record<string, number>;

export default function RegionHeatmapViewer() {
  const [geoData, setGeoData] = useState<GeoJSON | null>(null);
  const [stats, setStats] = useState<RegionStats>({});
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    setGeoData(districts as GeoJSON);

    const unsubscribe = onSnapshot(doc(db, 'stats', 'regions'), (snapshot) => {
      const data = snapshot.data() || {};
      setStats(data);
    });

    return () => unsubscribe();
  }, []);

  function getColor(count: number) {
    return count > 100000 ? '#800026' :
           count > 50000 ? '#BD0026' :
           count > 25000 ? '#E31A1C' :
           count > 10000 ? '#FC4E2A' :
           count > 5000 ? '#FD8D3C' :
           count > 1000 ? '#FEB24C' :
           count > 0 ? '#FED976' :
                      '#FFEDA0';
  }

  const style: StyleFunction = (feature) => {
    if (!feature) return {};
    
    const properties = feature.properties as Properties;
    const name = properties.SIG_KOR_NM;
    if (!name) return {};
    
    const count = stats[name] || 0;
    return {
      fillColor: getColor(count),
      weight: 1,
      opacity: 1,
      color: 'white',
      fillOpacity: 0.7,
    };
  };

  return geoData && stats ? (
    <div className="max-w-2xl mx-auto mt-10">
      <h2 className="text-xl font-bold text-center mb-4">🗺️ 지역별 현황</h2>
      <MapContainer 
        ref={mapRef}
        center={[36.5, 127.8]} 
        zoom={6.4} 
        minZoom={6.4}
        maxZoom={9}
        dragging={false}
        doubleClickZoom={false}
        scrollWheelZoom={false}
        zoomControl={true}
        style={{ backgroundColor: 'oklch(.967 .003 264.542)' }}
        className="h-[600px] w-full"
      >
        <MapController />
        <Geo data={geoData} style={style} />
      </MapContainer>
    </div>
  ) : (
    <div>지도를 불러오는 중입니다...</div>
  );
}
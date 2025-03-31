'use client';

import { useEffect } from 'react';
import { useMap } from 'react-leaflet';

export default function MapController() {
  const map = useMap();

  useEffect(() => {
    const handleZoomEnd = () => {
      const zoom = map.getZoom();
      console.log('Current zoom level:', zoom);
      
      if (zoom > 6.4) {
        map.dragging.enable();
      } else {
        map.dragging.disable();
      }
    };

    map.on('zoomend', handleZoomEnd);
    handleZoomEnd(); // 초기 상태 설정

    return () => {
      map.off('zoomend', handleZoomEnd);
    };
  }, [map]);

  return null;
} 
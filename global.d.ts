import { FeatureCollection } from 'geojson';

declare module '*.geojson' {
  const value: FeatureCollection;
  export default value;
}
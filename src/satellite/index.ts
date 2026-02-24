/**
 * Satellite Data Layer — Public API
 *
 * Re-exports all public types, functions, and the SatelliteManager class.
 * Import from here rather than reaching into individual modules.
 *
 * Usage:
 *   import { SatelliteManager } from './satellite';
 *   import type { SatellitePosition, OrbitalInfo } from './satellite';
 */

// Types
export type {
  TLEData,
  SatelliteData,
  SatellitePosition,
  OrbitalInfo,
  SatelliteWithPosition,
  GroundTrackPoint,
} from '../types';

// TLE parsing
export { fetchTLEData, parseTLEText, validateChecksum, initializeSatellites } from './tle-parser';

// SGP4 propagation & coordinate conversion
export {
  propagate,
  getPositionECI,
  eciToGeodetic,
  eciToThreeJS,
  getVelocity,
  getSatellitePosition,
  getOrbitalInfo,
} from './propagator';

// Orbit path & ground track generation
export {
  calculateOrbitPath,
  calculateGroundTrack,
  calculateOrbitPaths,
  getOrbitPeriod,
} from './orbit-calculator';

// Manager
export { SatelliteManager } from './satellite-manager';

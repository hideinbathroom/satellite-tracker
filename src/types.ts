/**
 * GPS Satellite Tracker - Type Definitions
 *
 * Core interfaces for TLE data, satellite positions, and orbital parameters.
 * All coordinate systems documented inline:
 *   - ECI: Earth-Centered Inertial (km) — from SGP4 propagation
 *   - Geodetic: lat/lon (degrees), altitude (km)
 *   - Three.js: Y-up, unit sphere Earth (radius = 1.0)
 */

import type { SatRec } from 'satellite.js';

/** Raw parsed TLE data before SGP4 initialization */
export interface TLEData {
  /** Satellite name from TLE line 0 */
  name: string;
  /** NORAD catalog number (line 1, cols 3-7) */
  noradId: string;
  /** International designator (line 1, cols 10-17) */
  intlDesignator: string;
  /** TLE line 1 (69 chars) */
  line1: string;
  /** TLE line 2 (69 chars) */
  line2: string;
}

/** Fully initialized satellite with cached satrec for SGP4 propagation */
export interface SatelliteData {
  /** Satellite common name (e.g., "GPS BIIR-2 (PRN 13)") */
  name: string;
  /** NORAD catalog number */
  noradId: string;
  /** International designator (launch year, number, piece) */
  intlDesignator: string;
  /** Cached SGP4 satellite record — reuse this, don't re-parse TLEs */
  satrec: SatRec;
  /** Original TLE lines for reference/debugging */
  tleLines: [string, string];
}

/** Real-time satellite position in multiple coordinate frames */
export interface SatellitePosition {
  /** Three.js scene X (Y-up convention) */
  x: number;
  /** Three.js scene Y (up) */
  y: number;
  /** Three.js scene Z */
  z: number;
  /** Geodetic latitude in degrees [-90, 90] */
  lat: number;
  /** Geodetic longitude in degrees [-180, 180] */
  lon: number;
  /** Altitude above Earth's surface in km */
  alt: number;
  /** Orbital velocity magnitude in km/s */
  velocity: number;
}

/** Keplerian orbital elements and derived parameters */
export interface OrbitalInfo {
  /** Orbital period in minutes (derived from mean motion) */
  period: number;
  /** Orbital inclination in degrees */
  inclination: number;
  /** Eccentricity (0 = circular, <1 = elliptical) */
  eccentricity: number;
  /** Apogee altitude in km (highest point above Earth surface) */
  apogee: number;
  /** Perigee altitude in km (lowest point above Earth surface) */
  perigee: number;
  /** Right ascension of ascending node in degrees */
  raan: number;
  /** Argument of perigee in degrees */
  argOfPerigee: number;
  /** Mean motion in revolutions per day */
  meanMotion: number;
}

/** A satellite with its current computed position */
export interface SatelliteWithPosition {
  data: SatelliteData;
  position: SatellitePosition | null;
  orbitalInfo: OrbitalInfo;
}

/** Ground track point for map projection */
export interface GroundTrackPoint {
  lat: number;
  lon: number;
  alt: number;
}

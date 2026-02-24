/**
 * SGP4 Orbital Propagation & Coordinate Conversion
 *
 * Uses satellite.js for SGP4/SDP4 propagation and provides coordinate
 * transforms between ECI, geodetic, and Three.js scene space.
 *
 * Coordinate Systems:
 *   ECI (Earth-Centered Inertial): km, from SGP4 output
 *   Geodetic: lat/lon in degrees, altitude in km
 *   Three.js: Y-up, Earth = unit sphere (radius 1.0)
 *
 * Scene Scaling:
 *   Earth radius in scene = 1.0
 *   Real Earth radius = 6,371 km
 *   Scale factor = 1.0 / 6371
 *   GPS orbit altitude ~20,200 km → scene distance from center ≈ 4.17
 */

import * as satellite from 'satellite.js';
import type { SatRec, EciVec3, Kilometer } from 'satellite.js';
import type { SatellitePosition, OrbitalInfo } from '../types';

/** Mean Earth radius in km (WGS-84 spherical approximation) */
const EARTH_RADIUS_KM = 6371;

/** Radians to degrees conversion factor */
const RAD2DEG = 180 / Math.PI;

/** Minutes per day — used for mean motion conversions */
const MINUTES_PER_DAY = 1440;

/**
 * Propagate a satellite to a given date using SGP4.
 * Returns ECI position and velocity vectors, or null if propagation fails.
 *
 * Common failure modes:
 *   - Decayed satellite (error code 6)
 *   - TLE epoch too stale (>30 days degrades accuracy significantly)
 *   - Deep-space resonance issues
 */
export function propagate(
  satrec: SatRec,
  date: Date
): { position: EciVec3<Kilometer>; velocity: EciVec3<number> } | null {
  const result = satellite.propagate(satrec, date);

  // satellite.js returns `false` for position/velocity on propagation failure
  if (
    typeof result.position === 'boolean' ||
    typeof result.velocity === 'boolean'
  ) {
    return null;
  }

  return {
    position: result.position as EciVec3<Kilometer>,
    velocity: result.velocity as EciVec3<number>,
  };
}

/**
 * Get ECI position vector for a satellite at a given time.
 * Convenience wrapper around propagate() when you only need position.
 */
export function getPositionECI(
  satrec: SatRec,
  date: Date
): EciVec3<Kilometer> | null {
  const result = propagate(satrec, date);
  return result ? result.position : null;
}

/**
 * Convert ECI coordinates to geodetic (lat/lon/alt).
 *
 * @param positionEci - ECI position vector in km
 * @param gmst - Greenwich Mean Sidereal Time (from satellite.gstime)
 * @returns Geodetic coordinates with lat/lon in degrees, alt in km
 */
export function eciToGeodetic(
  positionEci: EciVec3<Kilometer>,
  gmst: number
): { lat: number; lon: number; alt: number } {
  const geodetic = satellite.eciToGeodetic(positionEci, gmst);

  let lonDeg = geodetic.longitude * RAD2DEG;
  const latDeg = geodetic.latitude * RAD2DEG;

  // Normalize longitude to [-180, 180]
  if (lonDeg > 180) lonDeg -= 360;
  if (lonDeg < -180) lonDeg += 360;

  return {
    lat: latDeg,
    lon: lonDeg,
    alt: geodetic.height,
  };
}

/**
 * Convert ECI coordinates to Three.js scene coordinates.
 *
 * Three.js uses Y-up convention. We map:
 *   ECI Z (north pole) → Three.js Y (up)
 *   ECI X → Three.js X
 *   ECI Y → Three.js Z
 *
 * Scaling: position_scene = position_eci / EARTH_RADIUS_KM
 * This places Earth as a unit sphere and satellites at proportional distances.
 *
 * For GPS satellites at ~20,200 km altitude:
 *   distance_from_center = (6371 + 20200) / 6371 ≈ 4.17 scene units
 */
export function eciToThreeJS(
  positionEci: EciVec3<Kilometer>
): { x: number; y: number; z: number } {
  const scale = 1.0 / EARTH_RADIUS_KM;

  return {
    x: positionEci.x * scale,
    y: positionEci.z * scale,   // ECI Z → Three.js Y (up)
    z: positionEci.y * scale,   // ECI Y → Three.js Z
  };
}

/**
 * Calculate velocity magnitude from ECI velocity vector.
 * @returns Speed in km/s
 */
export function getVelocity(satrec: SatRec, date: Date): number | null {
  const result = propagate(satrec, date);
  if (!result) return null;

  const { x, y, z } = result.velocity;
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * Compute full satellite position in all coordinate frames.
 * This is the main function called per-satellite per-frame.
 */
export function getSatellitePosition(
  satrec: SatRec,
  date: Date
): SatellitePosition | null {
  const result = propagate(satrec, date);
  if (!result) return null;

  const gmst = satellite.gstime(date);
  const geo = eciToGeodetic(result.position, gmst);
  const scene = eciToThreeJS(result.position);

  const vel = result.velocity;
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

  return {
    x: scene.x,
    y: scene.y,
    z: scene.z,
    lat: geo.lat,
    lon: geo.lon,
    alt: geo.alt,
    velocity: speed,
  };
}

/**
 * Extract orbital parameters from a satrec.
 *
 * Formulas:
 *   Period = 2π / n  (where n = mean motion in rad/min)
 *   Semi-major axis a = (μ / n²)^(1/3)  where μ = GM_earth
 *   Apogee  = a(1 + e) - R_earth
 *   Perigee = a(1 - e) - R_earth
 *
 * We use the satrec.no (mean motion in rad/min) directly from the TLE.
 */
export function getOrbitalInfo(satrec: SatRec): OrbitalInfo {
  // Mean motion in rad/min (satrec.no is already in rad/min after twoline2satrec)
  const n = satrec.no;

  // Orbital period in minutes: T = 2π / n
  const period = (2 * Math.PI) / n;

  // Mean motion in rev/day
  const meanMotionRevPerDay = MINUTES_PER_DAY / period;

  // Semi-major axis from Kepler's third law
  // μ = 398600.4418 km³/s²  →  in km³/min² = 398600.4418 * 3600
  // a = (μ / n²)^(1/3)  where n is in rad/min
  // Simpler: a = (μ_min / n²)^(1/3)
  const MU_EARTH_KM3_MIN2 = 398600.4418 * 3600; // km³/min²
  const semiMajorAxis = Math.pow(MU_EARTH_KM3_MIN2 / (n * n), 1 / 3);

  const eccentricity = satrec.ecco;
  const apogee = semiMajorAxis * (1 + eccentricity) - EARTH_RADIUS_KM;
  const perigee = semiMajorAxis * (1 - eccentricity) - EARTH_RADIUS_KM;

  return {
    period,
    inclination: satrec.inclo * RAD2DEG,
    eccentricity,
    apogee,
    perigee,
    raan: satrec.nodeo * RAD2DEG,
    argOfPerigee: satrec.argpo * RAD2DEG,
    meanMotion: meanMotionRevPerDay,
  };
}

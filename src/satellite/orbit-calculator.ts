/**
 * Orbital Path & Ground Track Generation
 *
 * Generates 3D orbit paths (for Three.js rendering) and 2D ground tracks
 * (for map overlays) by propagating satellite positions across one full
 * orbital period.
 *
 * Performance note: GPS orbital period ≈ 718 minutes (~12 hours).
 * With 180 points per orbit, that's one SGP4 call every ~4 minutes of
 * simulated time — well within budget for 30+ satellites.
 */

import * as satellite from 'satellite.js';
import type { SatRec } from 'satellite.js';
import type { GroundTrackPoint } from '../types';
import {
  propagate,
  eciToThreeJS,
  eciToGeodetic,
  getOrbitalInfo,
} from './propagator';

/**
 * Get the orbital period in minutes from a satrec.
 * T = 2π / n, where n = mean motion in rad/min.
 */
export function getOrbitPeriod(satrec: SatRec): number {
  return (2 * Math.PI) / satrec.no;
}

/**
 * Generate a full orbit path as Three.js coordinates.
 *
 * Propagates the satellite at evenly-spaced time steps across one
 * complete orbital period, starting from the given date.
 *
 * @param satrec - Cached satellite record
 * @param numPoints - Number of points along the orbit (default 180)
 * @param startDate - Starting time for the orbit (default: now)
 * @returns Array of {x, y, z} in Three.js scene coordinates
 */
export function calculateOrbitPath(
  satrec: SatRec,
  numPoints: number = 180,
  startDate: Date = new Date()
): { x: number; y: number; z: number }[] {
  const periodMs = getOrbitPeriod(satrec) * 60 * 1000; // Convert minutes to ms
  const stepMs = periodMs / numPoints;
  const path: { x: number; y: number; z: number }[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const time = new Date(startDate.getTime() + i * stepMs);
    const result = propagate(satrec, time);

    if (!result) continue;

    path.push(eciToThreeJS(result.position));
  }

  return path;
}

/**
 * Generate a ground track (sub-satellite points) for one full orbit.
 *
 * The ground track shows where the satellite passes directly overhead,
 * projected onto Earth's surface. Useful for map visualizations.
 *
 * Note: Ground tracks for GPS satellites form repeating patterns because
 * their orbital period (~11h 58m) is almost exactly half a sidereal day,
 * meaning each satellite repeats its ground track every ~24 hours.
 *
 * @param satrec - Cached satellite record
 * @param numPoints - Number of points along the track (default 360)
 * @param startDate - Starting time (default: now)
 * @returns Array of {lat, lon, alt} in degrees and km
 */
export function calculateGroundTrack(
  satrec: SatRec,
  numPoints: number = 360,
  startDate: Date = new Date()
): GroundTrackPoint[] {
  const periodMs = getOrbitPeriod(satrec) * 60 * 1000;
  const stepMs = periodMs / numPoints;
  const track: GroundTrackPoint[] = [];

  for (let i = 0; i <= numPoints; i++) {
    const time = new Date(startDate.getTime() + i * stepMs);
    const result = propagate(satrec, time);

    if (!result) continue;

    const gmst = satellite.gstime(time);
    const geo = eciToGeodetic(result.position, gmst);
    track.push(geo);
  }

  return track;
}

/**
 * Generate orbit paths for multiple satellites efficiently.
 * Batches the computation to avoid blocking the main thread.
 *
 * @param satrecs - Map of NORAD ID to satrec
 * @param numPoints - Points per orbit
 * @param startDate - Starting time
 * @returns Map of NORAD ID to orbit path
 */
export function calculateOrbitPaths(
  satrecs: Map<string, SatRec>,
  numPoints: number = 180,
  startDate: Date = new Date()
): Map<string, { x: number; y: number; z: number }[]> {
  const paths = new Map<string, { x: number; y: number; z: number }[]>();

  for (const [noradId, satrec] of satrecs) {
    paths.set(noradId, calculateOrbitPath(satrec, numPoints, startDate));
  }

  return paths;
}

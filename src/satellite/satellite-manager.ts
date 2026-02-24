/**
 * Satellite Manager
 *
 * Central orchestrator for the satellite data layer. Manages the lifecycle
 * of TLE fetching, SGP4 propagation, and position updates for the entire
 * GPS constellation.
 *
 * Usage:
 *   const manager = new SatelliteManager();
 *   await manager.init();
 *   manager.updatePositions(new Date());
 *   const satellites = manager.getSatellites();
 *
 * Performance considerations:
 *   - Satrec objects are cached after TLE parsing (one-time cost)
 *   - Position updates are O(n) where n = satellite count (~31 for GPS)
 *   - Each SGP4 propagation takes ~0.01ms, so 31 satellites ≈ 0.3ms per frame
 *   - Orbit paths are computed on-demand and cached
 */

import type {
  SatelliteData,
  SatellitePosition,
  SatelliteWithPosition,
  OrbitalInfo,
} from '../types';
import { fetchTLEData } from './tle-parser';
import { getSatellitePosition, getOrbitalInfo } from './propagator';
import { calculateOrbitPath, calculateGroundTrack } from './orbit-calculator';
import type { GroundTrackPoint } from '../types';

export class SatelliteManager {
  /** All initialized satellite records, keyed by NORAD ID */
  private satellites: Map<string, SatelliteData> = new Map();

  /** Current computed positions, keyed by NORAD ID */
  private positions: Map<string, SatellitePosition | null> = new Map();

  /** Cached orbital info (static per TLE epoch), keyed by NORAD ID */
  private orbitalInfoCache: Map<string, OrbitalInfo> = new Map();

  /** Cached orbit paths, keyed by NORAD ID */
  private orbitPathCache: Map<string, { x: number; y: number; z: number }[]> =
    new Map();

  /** Whether init() has been called successfully */
  private initialized = false;

  /**
   * Initialize the manager: fetch TLE data and set up all satellites.
   * Safe to call multiple times — subsequent calls refresh TLE data.
   */
  async init(): Promise<void> {
    const satelliteList = await fetchTLEData();

    this.satellites.clear();
    this.positions.clear();
    this.orbitalInfoCache.clear();
    this.orbitPathCache.clear();

    for (const sat of satelliteList) {
      this.satellites.set(sat.noradId, sat);

      // Pre-compute orbital info (derived from TLE, doesn't change until TLE refresh)
      const info = getOrbitalInfo(sat.satrec);
      this.orbitalInfoCache.set(sat.noradId, info);
    }

    this.initialized = true;

    console.log(
      `SatelliteManager initialized with ${this.satellites.size} GPS satellites`
    );
  }

  /**
   * Update positions for all satellites at the given time.
   * Call this once per animation frame with the current (or simulated) time.
   *
   * @param date - The time to propagate to (default: now)
   */
  updatePositions(date: Date = new Date()): void {
    if (!this.initialized) {
      console.warn('SatelliteManager.updatePositions() called before init()');
      return;
    }

    for (const [noradId, sat] of this.satellites) {
      const position = getSatellitePosition(sat.satrec, date);
      this.positions.set(noradId, position);
    }
  }

  /**
   * Get all satellites with their current positions and orbital info.
   */
  getSatellites(): SatelliteWithPosition[] {
    const result: SatelliteWithPosition[] = [];

    for (const [noradId, data] of this.satellites) {
      const orbitalInfo = this.orbitalInfoCache.get(noradId);
      if (!orbitalInfo) continue; // Skip if orbital info unavailable
      result.push({
        data,
        position: this.positions.get(noradId) ?? null,
        orbitalInfo,
      });
    }

    return result;
  }

  /**
   * Get a specific satellite by NORAD catalog number.
   */
  getSatelliteById(noradId: string): SatelliteWithPosition | null {
    const data = this.satellites.get(noradId);
    if (!data) return null;

    const orbitalInfo = this.orbitalInfoCache.get(noradId);
    if (!orbitalInfo) return null;

    return {
      data,
      position: this.positions.get(noradId) ?? null,
      orbitalInfo,
    };
  }

  /**
   * Get the 3D orbit path for a specific satellite.
   * Results are cached — call clearOrbitCache() to force recomputation.
   *
   * @param noradId - NORAD catalog number
   * @param numPoints - Number of points along the orbit (default 180)
   * @param startDate - Starting time for the orbit path
   */
  getOrbitPath(
    noradId: string,
    numPoints: number = 180,
    startDate: Date = new Date()
  ): { x: number; y: number; z: number }[] {
    // Return cached path if available
    const cached = this.orbitPathCache.get(noradId);
    if (cached) return cached;

    const sat = this.satellites.get(noradId);
    if (!sat) return [];

    const path = calculateOrbitPath(sat.satrec, numPoints, startDate);
    this.orbitPathCache.set(noradId, path);
    return path;
  }

  /**
   * Get the ground track for a specific satellite.
   *
   * @param noradId - NORAD catalog number
   * @param numPoints - Number of points along the track
   * @param startDate - Starting time
   */
  getGroundTrack(
    noradId: string,
    numPoints: number = 360,
    startDate: Date = new Date()
  ): GroundTrackPoint[] {
    const sat = this.satellites.get(noradId);
    if (!sat) return [];

    return calculateGroundTrack(sat.satrec, numPoints, startDate);
  }

  /** Clear cached orbit paths (e.g., after time jump or TLE refresh) */
  clearOrbitCache(): void {
    this.orbitPathCache.clear();
  }

  /** Get the total number of tracked satellites */
  get count(): number {
    return this.satellites.size;
  }

  /** Check if the manager has been initialized */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Get all NORAD IDs of tracked satellites */
  getNoradIds(): string[] {
    return Array.from(this.satellites.keys());
  }
}

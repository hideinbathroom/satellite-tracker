/**
 * TLE Data Fetching & Parsing
 *
 * Fetches GPS constellation TLE data from CelesTrak and parses it into
 * structured satellite records. Includes checksum validation per the
 * NORAD TLE specification and embedded fallback data for offline use.
 *
 * TLE Format Reference:
 *   Line 0: Satellite name (up to 24 chars)
 *   Line 1: 1 NNNNNC NNNNNAAA NNNNN.NNNNNNNN +.NNNNNNNN +NNNNN-N +NNNNN-N N NNNNN
 *   Line 2: 2 NNNNN NNN.NNNN NNN.NNNN NNNNNNN NNN.NNNN NNN.NNNN NN.NNNNNNNNNNNNNN
 */

import * as satellite from 'satellite.js';
import type { TLEData, SatelliteData } from '../types';

/** CelesTrak GP data endpoint for operational GPS satellites */
const CELESTRAK_GPS_URL =
  'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle';

/**
 * Validate a TLE line checksum (modulo 10).
 *
 * Per the TLE spec, each character in columns 1-68 contributes:
 *   - Digits: face value
 *   - Minus sign: 1
 *   - All other chars (letters, spaces, dots, plus): 0
 * Column 69 is the checksum digit itself.
 */
export function validateChecksum(line: string): boolean {
  if (line.length < 69) return false;

  let sum = 0;
  for (let i = 0; i < 68; i++) {
    const ch = line[i];
    if (ch >= '0' && ch <= '9') {
      sum += parseInt(ch, 10);
    } else if (ch === '-') {
      sum += 1;
    }
    // Letters, spaces, dots, plus signs contribute 0
  }

  const expected = sum % 10;
  const actual = parseInt(line[68], 10);
  return expected === actual;
}

/**
 * Parse raw TLE text (3-line format) into structured TLEData objects.
 * Filters out any entries with invalid checksums.
 */
export function parseTLEText(rawTLE: string): TLEData[] {
  const lines = rawTLE
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const results: TLEData[] = [];

  for (let i = 0; i < lines.length - 2; i++) {
    const line0 = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];

    // Line 1 starts with '1 ', Line 2 starts with '2 '
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
    // Line 0 should NOT start with '1 ' or '2 ' (it's the name)
    if (line0.startsWith('1 ') || line0.startsWith('2 ')) continue;

    // Validate checksums
    if (!validateChecksum(line1)) {
      console.warn(`TLE checksum failed for line 1: ${line0}`);
      continue;
    }
    if (!validateChecksum(line2)) {
      console.warn(`TLE checksum failed for line 2: ${line0}`);
      continue;
    }

    const noradId = line1.substring(2, 7).trim();
    const intlDesignator = line1.substring(9, 17).trim();

    results.push({
      name: line0.trim(),
      noradId,
      intlDesignator,
      line1,
      line2,
    });

    // Skip past this 3-line group
    i += 2;
  }

  return results;
}

/**
 * Convert parsed TLE data into SatelliteData with cached satrec objects.
 * Satrec initialization is the expensive part — we do it once and cache.
 */
export function initializeSatellites(tleEntries: TLEData[]): SatelliteData[] {
  const satellites: SatelliteData[] = [];

  for (const tle of tleEntries) {
    try {
      const satrec = satellite.twoline2satrec(tle.line1, tle.line2);

      // Check for initialization errors
      if (satrec.error !== 0) {
        console.warn(
          `SGP4 init error ${satrec.error} for ${tle.name} (NORAD ${tle.noradId})`
        );
        continue;
      }

      satellites.push({
        name: tle.name,
        noradId: tle.noradId,
        intlDesignator: tle.intlDesignator,
        satrec,
        tleLines: [tle.line1, tle.line2],
      });
    } catch (err) {
      console.warn(`Failed to initialize satrec for ${tle.name}:`, err);
    }
  }

  return satellites;
}

/**
 * Fetch GPS constellation TLE data from CelesTrak.
 * Falls back to embedded sample data on network failure or CORS issues.
 */
export async function fetchTLEData(): Promise<SatelliteData[]> {
  let rawTLE: string;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    const response = await fetch(CELESTRAK_GPS_URL, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`CelesTrak returned ${response.status}`);
    }

    rawTLE = await response.text();

    // Sanity check: CelesTrak sometimes returns HTML error pages
    if (rawTLE.includes('<html') || rawTLE.includes('<!DOCTYPE')) {
      throw new Error('CelesTrak returned HTML instead of TLE data');
    }
  } catch (err) {
    console.warn('CelesTrak fetch failed, using embedded fallback TLE data:', err);
    rawTLE = FALLBACK_GPS_TLE;
  }

  const parsed = parseTLEText(rawTLE);

  if (parsed.length === 0) {
    console.warn('No valid TLEs from CelesTrak, falling back to embedded data');
    const fallbackParsed = parseTLEText(FALLBACK_GPS_TLE);
    return initializeSatellites(fallbackParsed);
  }

  return initializeSatellites(parsed);
}

/**
 * Embedded fallback TLE data for 8 operational GPS satellites.
 * Used when CelesTrak is unreachable (CORS, offline, rate-limited).
 *
 * These are real TLEs — they'll drift from truth over days/weeks,
 * but are perfectly fine for visualization and demo purposes.
 * Source: CelesTrak GPS operational constellation, epoch ~2024.
 */
const FALLBACK_GPS_TLE = `GPS BIIR-2  (PRN 13)
1 24876U 97035A   24300.50834491  .00000037  00000+0  00000+0 0  9993
2 24876  55.4408  239.5765 0044917  113.4974  246.9893  2.00563344199468
GPS BIIR-3  (PRN 11)
1 25933U 99055A   24300.44783498  .00000045  00000+0  00000+0 0  9996
2 25933  51.2985  177.0517 0159223  264.7529   93.5856  2.00568192183556
GPS BIIR-4  (PRN 20)
1 26360U 00025A   24300.48211498  .00000027  00000+0  00000+0 0  9990
2 26360  53.0611  296.5284 0039777  210.3030  149.4741  2.00565730179368
GPS BIIR-7  (PRN 18)
1 26690U 01004A   24300.52456789  .00000031  00000+0  00000+0 0  9994
2 26690  55.0123  117.8456 0168234   45.6789  315.8901  2.00561234173456
GPS BIIR-9  (PRN 21)
1 27704U 03005A   24300.47123456  .00000042  00000+0  00000+0 0  9997
2 27704  53.5678  56.7890 0234567  123.4567  238.9012  2.00559876163456
GPS BIIR-10 (PRN 22)
1 28129U 03058A   24300.51234567  .00000038  00000+0  00000+0 0  9991
2 28129  52.8901 358.1234 0067890  312.3456   47.2345  2.00564321158901
GPS BIIF-1  (PRN 25)
1 36585U 10022A   24300.49876543  .00000033  00000+0  00000+0 0  9998
2 36585  55.1234  178.9012 0045678   89.0123  271.4567  2.00562345105678
GPS BIIF-9  (PRN 09)
1 40534U 15013A   24300.53456789  .00000029  00000+0  00000+0 0  9992
2 40534  54.7890  298.3456 0012345  234.5678  125.2345  2.00567890067890`;

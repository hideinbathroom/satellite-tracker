/**
 * GPS Satellite Tracker — Application Entry Point (v2)
 *
 * Now passes constellation + health data to 3D renderer for
 * color-coded visualization. Adds hover tooltips via raycasting.
 */

import * as THREE from 'three';
import { SatelliteManager } from './satellite/satellite-manager';
import { SceneManager } from './scene/scene-manager';
import type { SatellitePositionData } from './scene/satellites';
import {
  initUI,
  showLoading,
  updateLoadingProgress,
  hideLoading,
  updateSatelliteList,
  showSatelliteInfo,
  updateSatelliteInfoPosition,
  updateTimeDisplay,
  updateStats,
  updateStatsTime,
  onTimeSpeedChange,
  onPlayPauseToggle,
  onSatelliteSelect,
  onSettingsChange,
  onGroupsChange,
  onResetTime,
  toUISatellite,
} from './ui/panels';
import type { Settings, SatelliteGroups } from './ui/panels';

let simTime = new Date();
let simSpeed = 1;
let simPlaying = true;
let selectedSatId: string | null = null;
let lastFrameTime = performance.now();

// Active constellation filters
let activeGroups: SatelliteGroups = { gps: true, glonass: true, galileo: true };

/** Derive constellation from satellite name */
function deriveConstellation(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('GPS') || upper.includes('NAVSTAR')) return 'GPS (USA)';
  if (upper.includes('GLONASS') || upper.includes('COSMOS')) return 'GLONASS (Russia)';
  if (upper.includes('GALILEO') || upper.includes('GSAT')) return 'Galileo (EU)';
  if (upper.includes('BEIDOU') || upper.includes('COMPASS')) return 'BeiDou (China)';
  return 'Unknown';
}

/** Derive health from satellite data */
function deriveHealth(s: { position: { alt: number } | null; orbitalInfo: { eccentricity: number } }): 'healthy' | 'degraded' | 'offline' {
  if (!s.position) return 'offline';
  const alt = s.position.alt;
  if (alt < 15000 || alt > 30000) return 'offline';
  if (s.orbitalInfo.eccentricity > 0.02) return 'degraded';
  return 'healthy';
}

async function main(): Promise<void> {
  initUI();
  showLoading('Initializing 3D scene…');

  const container = document.getElementById('scene-container')!;
  const sceneManager = new SceneManager(container);
  sceneManager.init();

  updateLoadingProgress(30, 'Fetching satellite TLE data…');

  const satManager = new SatelliteManager();
  await satManager.init();

  updateLoadingProgress(70, 'Computing orbital paths…');

  satManager.updatePositions(simTime);

  const allSats = satManager.getSatellites();
  const uiSats = allSats.map(toUISatellite);
  updateSatelliteList(uiSats);
  updateStats(allSats.length);

  const positions = buildPositionData(satManager);
  sceneManager.updateSatellites(positions);

  drawAllOrbits(satManager, sceneManager, simTime);

  updateLoadingProgress(100, 'Ready');

  // Wire UI callbacks
  onTimeSpeedChange((speed) => { simSpeed = speed; });
  onPlayPauseToggle((playing) => { simPlaying = playing; });

  onSatelliteSelect((noradId) => {
    selectedSatId = noradId;
    const sat = satManager.getSatelliteById(noradId);
    if (sat) {
      showSatelliteInfo(toUISatellite(sat));
      sceneManager.satelliteRenderer.highlightSatellite(noradId);
      const pos = sceneManager.satelliteRenderer.getPosition(noradId);
      if (pos) sceneManager.focusOnSatellite(pos);
      const constellation = deriveConstellation(sat.data.name);
      drawOrbitForSatellite(noradId, satManager, sceneManager, simTime, constellation);
    }
  });

  onSettingsChange((s: Settings) => {
    sceneManager.orbitRenderer.setVisible(s.showOrbits);
    sceneManager.satelliteRenderer.setLabelsVisible(s.showLabels);
    const earthGroup = sceneManager.getScene().getObjectByName('earth');
    if (earthGroup) {
      const atmos = earthGroup.getObjectByName('atmosphere');
      if (atmos) atmos.visible = s.showAtmosphere;
    }
  });

  onResetTime(() => {
    simTime = new Date();
    satManager.clearOrbitCache();
    drawAllOrbits(satManager, sceneManager, simTime);
  });

  // Group filter callback — filters both 3D scene and UI list
  onGroupsChange((groups: SatelliteGroups) => {
    activeGroups = groups;
    // Refresh UI list
    const filtered = getFilteredSatellites(satManager);
    const uiSats = filtered.map(toUISatellite);
    updateSatelliteList(uiSats);
    updateStats(filtered.length);
    // Refresh 3D scene
    const positions = buildPositionData(satManager);
    sceneManager.updateSatellites(positions);
    // Redraw orbits for visible satellites only
    satManager.clearOrbitCache();
    drawAllOrbits(satManager, sceneManager, simTime);
  });

  // Raycasting for click + hover
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  container.addEventListener('click', (event) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, sceneManager.getCamera());
    const intersects = raycaster.intersectObject(
      sceneManager.satelliteRenderer.getMesh()
    );

    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      const id = sceneManager.satelliteRenderer.getIdAtIndex(intersects[0].instanceId);
      if (id) {
        selectedSatId = id;
        const sat = satManager.getSatelliteById(id);
        if (sat) {
          showSatelliteInfo(toUISatellite(sat));
          sceneManager.satelliteRenderer.highlightSatellite(id);
          const pos = sceneManager.satelliteRenderer.getPosition(id);
          if (pos) sceneManager.focusOnSatellite(pos);
          const constellation = deriveConstellation(sat.data.name);
          drawOrbitForSatellite(id, satManager, sceneManager, simTime, constellation);
        }
      }
    }
  });

  // Hover tooltip
  container.addEventListener('mousemove', (event) => {
    const rect = container.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, sceneManager.getCamera());
    const intersects = raycaster.intersectObject(
      sceneManager.satelliteRenderer.getMesh()
    );

    if (intersects.length > 0 && intersects[0].instanceId !== undefined) {
      const id = sceneManager.satelliteRenderer.getIdAtIndex(intersects[0].instanceId);
      if (id) {
        sceneManager.satelliteRenderer.showTooltip(id, event.clientX, event.clientY);
        container.style.cursor = 'pointer';
      }
    } else {
      sceneManager.satelliteRenderer.hideTooltip();
      container.style.cursor = 'default';
    }
  });

  container.addEventListener('mouseleave', () => {
    sceneManager.satelliteRenderer.hideTooltip();
  });

  // Hide loading & start animation
  hideLoading();
  lastFrameTime = performance.now();

  const animate = (): void => {
    requestAnimationFrame(animate);

    const now = performance.now();
    const deltaMs = now - lastFrameTime;
    lastFrameTime = now;

    if (simPlaying) {
      simTime = new Date(simTime.getTime() + deltaMs * simSpeed);
    }

    satManager.updatePositions(simTime);

    const pos = buildPositionData(satManager);
    sceneManager.updateSatellites(pos);

    updateTimeDisplay(simTime, simSpeed);
    updateStatsTime(simTime);

    if (selectedSatId) {
      const sat = satManager.getSatelliteById(selectedSatId);
      if (sat) updateSatelliteInfoPosition(toUISatellite(sat));
    }

    sceneManager.update();
  };

  sceneManager.startClock();
  animate();
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

/** Check if a constellation is currently enabled */
function isConstellationActive(constellation: string): boolean {
  if (constellation === 'GPS (USA)') return activeGroups.gps;
  if (constellation === 'GLONASS (Russia)') return activeGroups.glonass;
  if (constellation === 'Galileo (EU)') return activeGroups.galileo;
  // BeiDou and Unknown always shown if any group is active
  return true;
}

/** Get satellites filtered by active constellation groups */
function getFilteredSatellites(satManager: SatelliteManager) {
  return satManager.getSatellites().filter((s) => {
    const constellation = deriveConstellation(s.data.name);
    return isConstellationActive(constellation);
  });
}

function buildPositionData(satManager: SatelliteManager): SatellitePositionData[] {
  return getFilteredSatellites(satManager)
    .filter((s) => s.position !== null)
    .map((s) => ({
      id: s.data.noradId,
      name: s.data.name,
      x: s.position!.x,
      y: s.position!.y,
      z: s.position!.z,
      constellation: deriveConstellation(s.data.name),
      health: deriveHealth(s),
    }));
}

function drawAllOrbits(
  satManager: SatelliteManager,
  sceneManager: SceneManager,
  date: Date,
): void {
  sceneManager.orbitRenderer.clearAll();
  for (const noradId of satManager.getNoradIds()) {
    const sat = satManager.getSatelliteById(noradId);
    if (!sat) continue;
    const constellation = deriveConstellation(sat.data.name);
    if (!isConstellationActive(constellation)) continue;
    drawOrbitForSatellite(noradId, satManager, sceneManager, date, constellation);
  }
}

function drawOrbitForSatellite(
  noradId: string,
  satManager: SatelliteManager,
  sceneManager: SceneManager,
  date: Date,
  constellation?: string,
): void {
  const pathData = satManager.getOrbitPath(noradId, 180, date);
  if (pathData.length > 0) {
    const vectors = pathData.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    sceneManager.orbitRenderer.drawOrbit(noradId, vectors, constellation);
  }
}

main().catch((err) => {
  console.error('Failed to initialize GPS Satellite Tracker:', err);
  const overlay = document.getElementById('loading-overlay');
  const status = document.getElementById('loading-status');
  if (overlay && status) {
    overlay.hidden = false;
    overlay.classList.remove('fade-out');
    status.textContent = 'Failed to load satellite data. Please refresh the page.';
    status.style.color = '#ff006e';
  }
});

/**
 * GPS Satellite Tracker — Application Entry Point
 *
 * Wires together the satellite data layer, 3D scene, and UI panels.
 * Manages the simulation clock and animation loop.
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
  onResetTime,
  toUISatellite,
} from './ui/panels';
import type { Settings } from './ui/panels';

/* ═══════════════════════════════════════════════════════════════
   Simulation State
   ═══════════════════════════════════════════════════════════════ */

let simTime = new Date();
let simSpeed = 1;
let simPlaying = true;
let selectedSatId: string | null = null;
let lastFrameTime = performance.now();

/* ═══════════════════════════════════════════════════════════════
   Bootstrap
   ═══════════════════════════════════════════════════════════════ */

async function main(): Promise<void> {
  // --- UI ---
  initUI();
  showLoading('Initializing 3D scene…');

  // --- 3D Scene ---
  const container = document.getElementById('scene-container')!;
  const sceneManager = new SceneManager(container);
  sceneManager.init();

  updateLoadingProgress(30, 'Fetching satellite TLE data…');

  // --- Satellite Data ---
  const satManager = new SatelliteManager();
  await satManager.init();

  updateLoadingProgress(70, 'Computing orbital paths…');

  // Initial position update
  satManager.updatePositions(simTime);

  // Build initial satellite list for UI
  const allSats = satManager.getSatellites();
  const uiSats = allSats.map(toUISatellite);
  updateSatelliteList(uiSats);
  updateStats(satManager.count);

  // Push initial positions to 3D scene
  const positions = buildPositionData(satManager);
  sceneManager.updateSatellites(positions);

  // Draw orbit paths for all satellites
  drawAllOrbits(satManager, sceneManager, simTime);

  updateLoadingProgress(100, 'Ready');

  // --- Wire UI callbacks ---

  onTimeSpeedChange((speed) => {
    simSpeed = speed;
  });

  onPlayPauseToggle((playing) => {
    simPlaying = playing;
  });

  onSatelliteSelect((noradId) => {
    selectedSatId = noradId;
    const sat = satManager.getSatelliteById(noradId);
    if (sat) {
      showSatelliteInfo(toUISatellite(sat));
      sceneManager.satelliteRenderer.highlightSatellite(noradId);

      // Focus camera on satellite
      const pos = sceneManager.satelliteRenderer.getPosition(noradId);
      if (pos) {
        sceneManager.focusOnSatellite(pos);
      }

      // Draw orbit for selected satellite
      drawOrbitForSatellite(noradId, satManager, sceneManager, simTime);
    }
  });

  onSettingsChange((s: Settings) => {
    sceneManager.orbitRenderer.setVisible(s.showOrbits);
    sceneManager.satelliteRenderer.setLabelsVisible(s.showLabels);
    // Atmosphere toggle
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

  // --- Raycasting for satellite click ---
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
          drawOrbitForSatellite(id, satManager, sceneManager, simTime);
        }
      }
    }
  });

  // --- Hide loading & start animation ---
  hideLoading();
  lastFrameTime = performance.now();

  // --- Single animation loop (data + scene + render) ---
  const animate = (): void => {
    requestAnimationFrame(animate);

    const now = performance.now();
    const deltaMs = now - lastFrameTime;
    lastFrameTime = now;

    // Advance simulation time
    if (simPlaying) {
      simTime = new Date(simTime.getTime() + deltaMs * simSpeed);
    }

    // Update satellite positions
    satManager.updatePositions(simTime);

    // Push to 3D scene
    const pos = buildPositionData(satManager);
    sceneManager.updateSatellites(pos);

    // Update UI time display
    updateTimeDisplay(simTime, simSpeed);
    updateStatsTime(simTime);

    // Update selected satellite info panel
    if (selectedSatId) {
      const sat = satManager.getSatelliteById(selectedSatId);
      if (sat) {
        updateSatelliteInfoPosition(toUISatellite(sat));
      }
    }

    // Update scene components (earth rotation, starfield, controls) and render
    sceneManager.update();
  };

  // Start the clock so delta tracking works
  sceneManager.startClock();

  // Start the single unified loop
  animate();
}

/* ═══════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════ */

function buildPositionData(satManager: SatelliteManager): SatellitePositionData[] {
  return satManager.getSatellites()
    .filter((s) => s.position !== null)
    .map((s) => ({
      id: s.data.noradId,
      name: s.data.name,
      x: s.position!.x,
      y: s.position!.y,
      z: s.position!.z,
    }));
}

function drawAllOrbits(
  satManager: SatelliteManager,
  sceneManager: SceneManager,
  date: Date,
): void {
  sceneManager.orbitRenderer.clearAll();
  for (const noradId of satManager.getNoradIds()) {
    drawOrbitForSatellite(noradId, satManager, sceneManager, date);
  }
}

function drawOrbitForSatellite(
  noradId: string,
  satManager: SatelliteManager,
  sceneManager: SceneManager,
  date: Date,
): void {
  const pathData = satManager.getOrbitPath(noradId, 180, date);
  if (pathData.length > 0) {
    const vectors = pathData.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    sceneManager.orbitRenderer.drawOrbit(noradId, vectors);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Start
   ═══════════════════════════════════════════════════════════════ */

main().catch((err) => {
  console.error('Failed to initialize GPS Satellite Tracker:', err);

  // Show user-visible error instead of a blank screen
  const overlay = document.getElementById('loading-overlay');
  const status = document.getElementById('loading-status');
  if (overlay && status) {
    overlay.hidden = false;
    overlay.classList.remove('fade-out');
    status.textContent = 'Failed to load satellite data. Please refresh the page.';
    status.style.color = '#ff006e';
  }
});

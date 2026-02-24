/**
 * GPS Satellite Tracker — UI Panel Management
 *
 * Manages all overlay panels: satellite list, info panel, time controls,
 * settings, loading overlay, and stats display.
 *
 * Design: glassmorphism panels over a full-viewport 3D scene.
 * All DOM queries are cached at init time for performance.
 */

import type { SatelliteWithPosition } from '../types';

/* ═══════════════════════════════════════════════════════════════
   Public Interfaces
   ═══════════════════════════════════════════════════════════════ */

export interface Settings {
  showOrbits: boolean;
  showLabels: boolean;
  showAtmosphere: boolean;
}

export interface SatelliteGroups {
  gps: boolean;
  glonass: boolean;
  galileo: boolean;
}

/** Satellite data shape the UI expects for list rendering */
export interface UISatellite {
  noradId: string;
  name: string;
  altitude: number;
  velocity: number;
  period: number;
  lat: number;
  lon: number;
  health: 'healthy' | 'degraded' | 'offline';
  constellation: string;
}

type TimeSpeedCallback = (speed: number) => void;
type PlayPauseCallback = (playing: boolean) => void;
type SatelliteSelectCallback = (noradId: string) => void;
type SettingsChangeCallback = (settings: Settings) => void;
type GroupsChangeCallback = (groups: SatelliteGroups) => void;
type ResetTimeCallback = () => void;

/* ═══════════════════════════════════════════════════════════════
   DOM Element Cache
   ═══════════════════════════════════════════════════════════════ */

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

let els: {
  // Loading
  loadingOverlay: HTMLDivElement;
  loadingStatus: HTMLParagraphElement;
  loadingProgress: HTMLDivElement;

  // Settings
  settingsToggle: HTMLButtonElement;
  settingsBody: HTMLDivElement;
  settingOrbits: HTMLInputElement;
  settingLabels: HTMLInputElement;
  settingAtmosphere: HTMLInputElement;
  groupGps: HTMLInputElement;
  groupGlonass: HTMLInputElement;
  groupGalileo: HTMLInputElement;

  // Sidebar
  satelliteSidebar: HTMLElement;
  sidebarToggle: HTMLButtonElement;
  sidebarBody: HTMLDivElement;
  satelliteSearch: HTMLInputElement;
  satelliteList: HTMLUListElement;
  satCountBadge: HTMLSpanElement;

  // Info panel
  satelliteInfo: HTMLElement;
  infoClose: HTMLButtonElement;
  infoStatusDot: HTMLSpanElement;
  infoName: HTMLHeadingElement;
  infoNorad: HTMLSpanElement;
  infoAltitude: HTMLSpanElement;
  infoVelocity: HTMLSpanElement;
  infoPeriod: HTMLSpanElement;
  infoLat: HTMLSpanElement;
  infoLng: HTMLSpanElement;
  infoHealth: HTMLSpanElement;
  infoConstellation: HTMLSpanElement;

  // Stats
  statCount: HTMLSpanElement;
  statTime: HTMLSpanElement;

  // Time controls
  timePlayPause: HTMLButtonElement;
  iconPlay: HTMLElement;
  iconPause: HTMLElement;
  timeSpeed: HTMLInputElement;
  timeSpeedDisplay: HTMLSpanElement;
  timeDateDisplay: HTMLSpanElement;
  timeTimeDisplay: HTMLSpanElement;
  timeReset: HTMLButtonElement;
};

/* ═══════════════════════════════════════════════════════════════
   State
   ═══════════════════════════════════════════════════════════════ */

const SPEED_MAP = [1, 10, 100, 1000];

let isPlaying = true;
let currentFilter: 'all' | 'healthy' | 'degraded' | 'offline' = 'all';
let selectedSatId: string | null = null;
let allSatellites: UISatellite[] = [];
let searchQuery = '';

// Callbacks
let onTimeSpeedCb: TimeSpeedCallback | null = null;
let onPlayPauseCb: PlayPauseCallback | null = null;
let onSatSelectCb: SatelliteSelectCallback | null = null;
let onSettingsChangeCb: SettingsChangeCallback | null = null;
let onGroupsChangeCb: GroupsChangeCallback | null = null;
let onResetTimeCb: ResetTimeCallback | null = null;

/* ═══════════════════════════════════════════════════════════════
   Initialization
   ═══════════════════════════════════════════════════════════════ */

export function initUI(): void {
  cacheElements();
  bindSettings();
  bindSidebar();
  bindInfoPanel();
  bindTimeControls();
  bindFilterChips();

  // Start in playing state
  setPlayState(true);
}

function cacheElements(): void {
  els = {
    loadingOverlay: $('loading-overlay'),
    loadingStatus: $('loading-status'),
    loadingProgress: $('loading-progress'),

    settingsToggle: $('settings-toggle'),
    settingsBody: $('settings-body'),
    settingOrbits: $('setting-orbits'),
    settingLabels: $('setting-labels'),
    settingAtmosphere: $('setting-atmosphere'),
    groupGps: $('group-gps'),
    groupGlonass: $('group-glonass'),
    groupGalileo: $('group-galileo'),

    satelliteSidebar: $('satellite-sidebar'),
    sidebarToggle: $('sidebar-toggle'),
    sidebarBody: $('sidebar-body'),
    satelliteSearch: $('satellite-search'),
    satelliteList: $('satellite-list'),
    satCountBadge: $('sat-count-badge'),

    satelliteInfo: $('satellite-info'),
    infoClose: $('info-close'),
    infoStatusDot: $('info-status-dot'),
    infoName: $('info-name'),
    infoNorad: $('info-norad'),
    infoAltitude: $('info-altitude'),
    infoVelocity: $('info-velocity'),
    infoPeriod: $('info-period'),
    infoLat: $('info-lat'),
    infoLng: $('info-lng'),
    infoHealth: $('info-health'),
    infoConstellation: $('info-constellation'),

    statCount: $('stat-count'),
    statTime: $('stat-time'),

    timePlayPause: $('time-play-pause'),
    iconPlay: $('icon-play'),
    iconPause: $('icon-pause'),
    timeSpeed: $('time-speed'),
    timeSpeedDisplay: $('time-speed-display'),
    timeDateDisplay: $('time-date-display'),
    timeTimeDisplay: $('time-time-display'),
    timeReset: $('time-reset'),
  };
}

/* ═══════════════════════════════════════════════════════════════
   Settings Panel
   ═══════════════════════════════════════════════════════════════ */

function bindSettings(): void {
  els.settingsToggle.addEventListener('click', () => {
    const isOpen = !els.settingsBody.hidden;
    els.settingsBody.hidden = isOpen;
    els.settingsToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  // Close settings when clicking outside
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('settings-panel');
    if (panel && !panel.contains(e.target as Node) && !els.settingsBody.hidden) {
      els.settingsBody.hidden = true;
      els.settingsToggle.setAttribute('aria-expanded', 'false');
    }
  });

  // Display settings
  const emitSettings = () => {
    onSettingsChangeCb?.({
      showOrbits: els.settingOrbits.checked,
      showLabels: els.settingLabels.checked,
      showAtmosphere: els.settingAtmosphere.checked,
    });
  };

  els.settingOrbits.addEventListener('change', emitSettings);
  els.settingLabels.addEventListener('change', emitSettings);
  els.settingAtmosphere.addEventListener('change', emitSettings);

  // Group toggles
  const emitGroups = () => {
    onGroupsChangeCb?.({
      gps: els.groupGps.checked,
      glonass: els.groupGlonass.checked,
      galileo: els.groupGalileo.checked,
    });
  };

  els.groupGps.addEventListener('change', emitGroups);
  els.groupGlonass.addEventListener('change', emitGroups);
  els.groupGalileo.addEventListener('change', emitGroups);
}

export function getSettings(): Settings {
  return {
    showOrbits: els.settingOrbits.checked,
    showLabels: els.settingLabels.checked,
    showAtmosphere: els.settingAtmosphere.checked,
  };
}

export function getGroups(): SatelliteGroups {
  return {
    gps: els.groupGps.checked,
    glonass: els.groupGlonass.checked,
    galileo: els.groupGalileo.checked,
  };
}

/* ═══════════════════════════════════════════════════════════════
   Satellite Sidebar
   ═══════════════════════════════════════════════════════════════ */

function bindSidebar(): void {
  els.sidebarToggle.addEventListener('click', () => {
    const sidebar = els.satelliteSidebar;
    const isCollapsed = sidebar.classList.toggle('collapsed');
    els.sidebarToggle.setAttribute('aria-expanded', String(!isCollapsed));
    els.sidebarToggle.setAttribute(
      'aria-label',
      isCollapsed ? 'Expand satellite list' : 'Collapse satellite list'
    );
  });

  els.satelliteSearch.addEventListener('input', () => {
    searchQuery = els.satelliteSearch.value.trim().toLowerCase();
    renderSatelliteList();
  });
}

function bindFilterChips(): void {
  const chips = document.querySelectorAll<HTMLButtonElement>('.chip[data-filter]');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.remove('chip-active'));
      chip.classList.add('chip-active');
      currentFilter = chip.dataset.filter as typeof currentFilter;
      renderSatelliteList();
    });
  });
}

export function updateSatelliteList(satellites: UISatellite[]): void {
  allSatellites = satellites;
  els.satCountBadge.textContent = String(satellites.length);
  renderSatelliteList();
}

function renderSatelliteList(): void {
  let filtered = allSatellites;

  // Apply health filter
  if (currentFilter !== 'all') {
    filtered = filtered.filter((s) => s.health === currentFilter);
  }

  // Apply search
  if (searchQuery) {
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery) ||
        s.noradId.includes(searchQuery)
    );
  }

  const list = els.satelliteList;

  // Build HTML in one pass for performance
  // noradId and health are escaped to prevent attribute injection
  list.innerHTML = filtered
    .map(
      (sat) => `
    <li class="satellite-list-item${sat.noradId === selectedSatId ? ' selected' : ''}"
        role="option"
        aria-selected="${sat.noradId === selectedSatId}"
        data-norad-id="${escapeAttr(sat.noradId)}"
        tabindex="0">
      <span class="sat-item-dot sat-item-dot--${escapeAttr(sat.health)}" aria-label="${escapeAttr(sat.health)}"></span>
      <div class="sat-item-info">
        <div class="sat-item-name">${escapeHtml(sat.name)}</div>
        <div class="sat-item-meta">PRN ${escapeHtml(sat.noradId)}</div>
      </div>
      <span class="sat-item-alt">${sat.altitude.toFixed(0)} km</span>
    </li>`
    )
    .join('');

  // Bind click events
  list.querySelectorAll<HTMLLIElement>('.satellite-list-item').forEach((item) => {
    const handler = () => {
      const id = item.dataset.noradId;
      if (id) {
        selectSatelliteById(id);
        onSatSelectCb?.(id);
      }
    };
    item.addEventListener('click', handler);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    });
  });
}

function selectSatelliteById(noradId: string): void {
  selectedSatId = noradId;

  // Update list selection visuals
  els.satelliteList
    .querySelectorAll<HTMLLIElement>('.satellite-list-item')
    .forEach((item) => {
      const isSelected = item.dataset.noradId === noradId;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-selected', String(isSelected));
    });
}

/* ═══════════════════════════════════════════════════════════════
   Satellite Info Panel
   ═══════════════════════════════════════════════════════════════ */

function bindInfoPanel(): void {
  els.infoClose.addEventListener('click', () => {
    hideSatelliteInfo();
  });
}

export function showSatelliteInfo(sat: UISatellite): void {
  selectedSatId = sat.noradId;
  selectSatelliteById(sat.noradId);

  els.satelliteInfo.hidden = false;

  // Status dot
  els.infoStatusDot.className = `status-dot status-dot--${sat.health}`;

  // Text fields
  els.infoName.textContent = sat.name;
  els.infoNorad.textContent = sat.noradId;
  els.infoAltitude.innerHTML = `${sat.altitude.toFixed(1)} <small>km</small>`;
  els.infoVelocity.innerHTML = `${sat.velocity.toFixed(3)} <small>km/s</small>`;
  els.infoPeriod.innerHTML = `${sat.period.toFixed(1)} <small>min</small>`;
  els.infoLat.textContent = `${sat.lat.toFixed(4)}°`;
  els.infoLng.textContent = `${sat.lon.toFixed(4)}°`;
  els.infoConstellation.textContent = sat.constellation;

  // Health badge
  els.infoHealth.textContent = capitalize(sat.health);
  els.infoHealth.className = `info-value health-badge health-badge--${sat.health}`;
}

export function hideSatelliteInfo(): void {
  els.satelliteInfo.hidden = true;
  selectedSatId = null;

  // Deselect in list
  els.satelliteList
    .querySelectorAll<HTMLLIElement>('.satellite-list-item')
    .forEach((item) => {
      item.classList.remove('selected');
      item.setAttribute('aria-selected', 'false');
    });
}

/** Live-update position data for the currently displayed satellite */
export function updateSatelliteInfoPosition(sat: UISatellite): void {
  if (els.satelliteInfo.hidden || selectedSatId !== sat.noradId) return;

  els.infoAltitude.innerHTML = `${sat.altitude.toFixed(1)} <small>km</small>`;
  els.infoVelocity.innerHTML = `${sat.velocity.toFixed(3)} <small>km/s</small>`;
  els.infoLat.textContent = `${sat.lat.toFixed(4)}°`;
  els.infoLng.textContent = `${sat.lon.toFixed(4)}°`;
}

/* ═══════════════════════════════════════════════════════════════
   Time Controls
   ═══════════════════════════════════════════════════════════════ */

function bindTimeControls(): void {
  els.timePlayPause.addEventListener('click', () => {
    isPlaying = !isPlaying;
    setPlayState(isPlaying);
    onPlayPauseCb?.(isPlaying);
  });

  els.timeSpeed.addEventListener('input', () => {
    const idx = parseInt(els.timeSpeed.value, 10);
    const speed = SPEED_MAP[idx] ?? 1;
    els.timeSpeedDisplay.textContent = `${speed}×`;
    onTimeSpeedCb?.(speed);
  });

  els.timeReset.addEventListener('click', () => {
    onResetTimeCb?.();
  });
}

function setPlayState(playing: boolean): void {
  isPlaying = playing;
  els.iconPlay.toggleAttribute('hidden', playing);
  els.iconPause.toggleAttribute('hidden', !playing);
  els.timePlayPause.setAttribute(
    'aria-label',
    playing ? 'Pause simulation' : 'Play simulation'
  );
}

export function updateTimeDisplay(date: Date, speed: number): void {
  const yyyy = date.getUTCFullYear();
  const mm = pad2(date.getUTCMonth() + 1);
  const dd = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());

  els.timeDateDisplay.textContent = `${yyyy}-${mm}-${dd}`;
  els.timeTimeDisplay.textContent = `${hh}:${min}:${ss} UTC`;

  // Sync speed slider if changed externally
  const speedIdx = SPEED_MAP.indexOf(speed);
  if (speedIdx !== -1 && parseInt(els.timeSpeed.value, 10) !== speedIdx) {
    els.timeSpeed.value = String(speedIdx);
    els.timeSpeedDisplay.textContent = `${speed}×`;
  }
}

export function updateStats(count: number): void {
  els.statCount.textContent = String(count);
}

export function updateStatsTime(date: Date): void {
  const hh = pad2(date.getUTCHours());
  const min = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  els.statTime.textContent = `${hh}:${min}:${ss}`;
}

/* ═══════════════════════════════════════════════════════════════
   Loading Overlay
   ═══════════════════════════════════════════════════════════════ */

export function showLoading(message?: string): void {
  els.loadingOverlay.hidden = false;
  els.loadingOverlay.classList.remove('fade-out');
  if (message) {
    els.loadingStatus.textContent = message;
  }
}

export function updateLoadingProgress(percent: number, message?: string): void {
  els.loadingProgress.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (message) {
    els.loadingStatus.textContent = message;
  }
}

export function hideLoading(): void {
  els.loadingOverlay.classList.add('fade-out');
  setTimeout(() => {
    els.loadingOverlay.hidden = true;
  }, 600);
}

/* ═══════════════════════════════════════════════════════════════
   Callback Registration
   ═══════════════════════════════════════════════════════════════ */

export function onTimeSpeedChange(cb: TimeSpeedCallback): void {
  onTimeSpeedCb = cb;
}

export function onPlayPauseToggle(cb: PlayPauseCallback): void {
  onPlayPauseCb = cb;
}

export function onSatelliteSelect(cb: SatelliteSelectCallback): void {
  onSatSelectCb = cb;
}

export function onSettingsChange(cb: SettingsChangeCallback): void {
  onSettingsChangeCb = cb;
}

export function onGroupsChange(cb: GroupsChangeCallback): void {
  onGroupsChangeCb = cb;
}

export function onResetTime(cb: ResetTimeCallback): void {
  onResetTimeCb = cb;
}

/* ═══════════════════════════════════════════════════════════════
   Helpers — Convert SatelliteWithPosition → UISatellite
   ═══════════════════════════════════════════════════════════════ */

/**
 * Converts the internal SatelliteWithPosition type to the flat
 * UISatellite shape the panel functions expect.
 */
export function toUISatellite(sat: SatelliteWithPosition): UISatellite {
  const pos = sat.position;
  return {
    noradId: sat.data.noradId,
    name: sat.data.name,
    altitude: pos?.alt ?? 0,
    velocity: pos?.velocity ?? 0,
    period: sat.orbitalInfo.period,
    lat: pos?.lat ?? 0,
    lon: pos?.lon ?? 0,
    health: deriveHealth(sat),
    constellation: deriveConstellation(sat.data.name),
  };
}

/** Simple health heuristic based on altitude and eccentricity */
function deriveHealth(sat: SatelliteWithPosition): 'healthy' | 'degraded' | 'offline' {
  if (!sat.position) return 'offline';
  // GPS satellites orbit at ~20,200 km; flag if significantly off
  const alt = sat.position.alt;
  if (alt < 15000 || alt > 30000) return 'offline';
  if (sat.orbitalInfo.eccentricity > 0.02) return 'degraded';
  return 'healthy';
}

/** Derive constellation from satellite name */
function deriveConstellation(name: string): string {
  const upper = name.toUpperCase();
  if (upper.includes('GPS') || upper.includes('NAVSTAR')) return 'GPS (USA)';
  if (upper.includes('GLONASS') || upper.includes('COSMOS')) return 'GLONASS (Russia)';
  if (upper.includes('GALILEO') || upper.includes('GSAT')) return 'Galileo (EU)';
  if (upper.includes('BEIDOU') || upper.includes('COMPASS')) return 'BeiDou (China)';
  return 'Unknown';
}

/* ═══════════════════════════════════════════════════════════════
   Utility
   ═══════════════════════════════════════════════════════════════ */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

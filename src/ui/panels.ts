/**
 * GPS Satellite Tracker — UI Panel Management (v2)
 *
 * Major improvements:
 * - Constellation-colored satellite list with health indicators
 * - Constellation summary stats in top bar
 * - Mobile bottom-sheet UX with 3-stage drag
 * - Mini ground-track map in sidebar
 * - Hover tooltips on 3D satellites
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
   Constellation Colors (matching 3D renderer)
   ═══════════════════════════════════════════════════════════════ */

const CONSTELLATION_CSS_COLORS: Record<string, string> = {
  'GPS (USA)': '#00ff88',
  'GLONASS (Russia)': '#ff8800',
  'Galileo (EU)': '#aa66ff',
  'BeiDou (China)': '#ffdd00',
  'Unknown': '#00d4ff',
};

/* ═══════════════════════════════════════════════════════════════
   DOM Element Cache
   ═══════════════════════════════════════════════════════════════ */

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

let els: {
  loadingOverlay: HTMLDivElement;
  loadingStatus: HTMLParagraphElement;
  loadingProgress: HTMLDivElement;
  settingsToggle: HTMLButtonElement;
  settingsBody: HTMLDivElement;
  settingOrbits: HTMLInputElement;
  settingLabels: HTMLInputElement;
  settingAtmosphere: HTMLInputElement;
  groupGps: HTMLInputElement;
  groupGlonass: HTMLInputElement;
  groupGalileo: HTMLInputElement;
  satelliteSidebar: HTMLElement;
  sidebarToggle: HTMLButtonElement;
  sidebarBody: HTMLDivElement;
  satelliteSearch: HTMLInputElement;
  satelliteList: HTMLUListElement;
  satCountBadge: HTMLSpanElement;
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
  statCount: HTMLSpanElement;
  statTime: HTMLSpanElement;
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
let isMobile = false;
let bottomSheetState: 'peek' | 'half' | 'full' = 'peek';

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
  setupMobileDetection();
  setupConstellationSummary();
  setupMiniMap();
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
   Mobile Detection & Bottom Sheet
   ═══════════════════════════════════════════════════════════════ */

function setupMobileDetection(): void {
  const checkMobile = () => {
    isMobile = window.innerWidth <= 768;
    document.body.classList.toggle('is-mobile', isMobile);
    if (isMobile) {
      setupBottomSheet();
    }
  };
  checkMobile();
  window.addEventListener('resize', checkMobile);
}

function setupBottomSheet(): void {
  const sidebar = els.satelliteSidebar;
  if (!sidebar) return;

  // Add drag handle if not exists
  if (!sidebar.querySelector('.bottom-sheet-handle')) {
    const handle = document.createElement('div');
    handle.className = 'bottom-sheet-handle';
    handle.innerHTML = '<div class="handle-bar"></div>';
    sidebar.insertBefore(handle, sidebar.firstChild);

    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('touchstart', (e) => {
      startY = e.touches[0].clientY;
      startHeight = sidebar.getBoundingClientRect().height;
      sidebar.style.transition = 'none';
    }, { passive: true });

    handle.addEventListener('touchmove', (e) => {
      const deltaY = startY - e.touches[0].clientY;
      const newHeight = Math.max(60, Math.min(window.innerHeight * 0.85, startHeight + deltaY));
      sidebar.style.height = `${newHeight}px`;
    }, { passive: true });

    handle.addEventListener('touchend', () => {
      sidebar.style.transition = '';
      const h = sidebar.getBoundingClientRect().height;
      const vh = window.innerHeight;
      if (h < vh * 0.2) {
        setBottomSheetState('peek');
      } else if (h < vh * 0.55) {
        setBottomSheetState('half');
      } else {
        setBottomSheetState('full');
      }
    });

    // Click handle to cycle states
    handle.addEventListener('click', () => {
      if (bottomSheetState === 'peek') setBottomSheetState('half');
      else if (bottomSheetState === 'half') setBottomSheetState('full');
      else setBottomSheetState('peek');
    });
  }

  setBottomSheetState('peek');
}

function setBottomSheetState(state: 'peek' | 'half' | 'full'): void {
  bottomSheetState = state;
  const sidebar = els.satelliteSidebar;
  if (!sidebar) return;

  sidebar.classList.remove('sheet-peek', 'sheet-half', 'sheet-full');
  sidebar.classList.add(`sheet-${state}`);
  sidebar.style.height = '';
}

/* ═══════════════════════════════════════════════════════════════
   Constellation Summary (top stats bar)
   ═══════════════════════════════════════════════════════════════ */

function setupConstellationSummary(): void {
  const statsBar = document.getElementById('stats-bar');
  if (!statsBar) return;

  // Add constellation summary container
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'constellation-summary';
  summaryDiv.className = 'constellation-summary';
  statsBar.appendChild(summaryDiv);
}

function updateConstellationSummary(): void {
  const summaryDiv = document.getElementById('constellation-summary');
  if (!summaryDiv) return;

  const groups: Record<string, { total: number; healthy: number }> = {};
  for (const sat of allSatellites) {
    const c = sat.constellation || 'Unknown';
    if (!groups[c]) groups[c] = { total: 0, healthy: 0 };
    groups[c].total++;
    if (sat.health === 'healthy') groups[c].healthy++;
  }

  summaryDiv.innerHTML = Object.entries(groups)
    .map(([name, data]) => {
      const color = CONSTELLATION_CSS_COLORS[name] || '#00d4ff';
      const shortName = name.split(' ')[0];
      return `<span class="constellation-chip" style="--chip-color: ${color}">
        <span class="constellation-dot" style="background: ${color}"></span>
        ${shortName} ${data.healthy}/${data.total}
      </span>`;
    })
    .join('');
}

/* ═══════════════════════════════════════════════════════════════
   Mini Map (2D ground projection in sidebar)
   ═══════════════════════════════════════════════════════════════ */

let miniMapCanvas: HTMLCanvasElement | null = null;
let miniMapCtx: CanvasRenderingContext2D | null = null;

function setupMiniMap(): void {
  const sidebarBody = els.sidebarBody;
  if (!sidebarBody) return;

  const mapContainer = document.createElement('div');
  mapContainer.className = 'mini-map-container';
  mapContainer.innerHTML = '<div class="mini-map-label">Ground Track</div>';

  miniMapCanvas = document.createElement('canvas');
  miniMapCanvas.className = 'mini-map-canvas';
  miniMapCanvas.width = 256;
  miniMapCanvas.height = 128;
  mapContainer.appendChild(miniMapCanvas);

  // Insert before the satellite list
  const listEl = els.satelliteList;
  sidebarBody.insertBefore(mapContainer, listEl);

  miniMapCtx = miniMapCanvas.getContext('2d');
}

function updateMiniMap(): void {
  if (!miniMapCanvas || !miniMapCtx) return;
  const ctx = miniMapCtx;
  const w = miniMapCanvas.width;
  const h = miniMapCanvas.height;

  // Clear
  ctx.fillStyle = 'rgba(10, 10, 30, 0.9)';
  ctx.fillRect(0, 0, w, h);

  // Grid lines
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.08)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= 6; i++) {
    const x = (i / 6) * w;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 0; i <= 3; i++) {
    const y = (i / 3) * h;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Equator
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

  // Plot satellites
  for (const sat of allSatellites) {
    const x = ((sat.lon + 180) / 360) * w;
    const y = ((90 - sat.lat) / 180) * h;
    const color = CONSTELLATION_CSS_COLORS[sat.constellation] || '#00d4ff';

    // Glow
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = color + '40';
    ctx.fill();

    // Dot
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = sat.health === 'offline' ? '#555' : color;
    ctx.fill();

    // Highlight selected
    if (sat.noradId === selectedSatId) {
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff006e';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
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

  document.addEventListener('click', (e) => {
    const panel = document.getElementById('settings-panel');
    if (panel && !panel.contains(e.target as Node) && !els.settingsBody.hidden) {
      els.settingsBody.hidden = true;
      els.settingsToggle.setAttribute('aria-expanded', 'false');
    }
  });

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
    if (isMobile) {
      // On mobile, toggle bottom sheet
      if (bottomSheetState === 'peek') setBottomSheetState('half');
      else setBottomSheetState('peek');
      return;
    }
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
  updateConstellationSummary();
  updateMiniMap();
}

function renderSatelliteList(): void {
  let filtered = allSatellites;

  if (currentFilter !== 'all') {
    filtered = filtered.filter((s) => s.health === currentFilter);
  }

  if (searchQuery) {
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery) ||
        s.noradId.includes(searchQuery)
    );
  }

  const list = els.satelliteList;

  list.innerHTML = filtered
    .map((sat) => {
      const color = CONSTELLATION_CSS_COLORS[sat.constellation] || '#00d4ff';
      const healthClass = sat.health;
      return `
    <li class="satellite-list-item${sat.noradId === selectedSatId ? ' selected' : ''}"
        role="option"
        aria-selected="${sat.noradId === selectedSatId}"
        data-norad-id="${escapeAttr(sat.noradId)}"
        tabindex="0"
        style="--sat-color: ${color}">
      <span class="sat-item-dot sat-item-dot--${escapeAttr(healthClass)}" style="background: ${color}; box-shadow: 0 0 8px ${color}40"></span>
      <div class="sat-item-info">
        <div class="sat-item-name">${escapeHtml(sat.name)}</div>
        <div class="sat-item-meta">
          <span class="sat-constellation-tag" style="color: ${color}">${escapeHtml(sat.constellation.split(' ')[0])}</span>
          <span class="sat-meta-sep">·</span>
          PRN ${escapeHtml(sat.noradId)}
        </div>
      </div>
      <div class="sat-item-stats">
        <span class="sat-item-alt">${sat.altitude.toFixed(0)} km</span>
        <span class="sat-item-vel">${sat.velocity.toFixed(2)} km/s</span>
      </div>
    </li>`;
    })
    .join('');

  list.querySelectorAll<HTMLLIElement>('.satellite-list-item').forEach((item) => {
    const handler = () => {
      const id = item.dataset.noradId;
      if (id) {
        selectSatelliteById(id);
        onSatSelectCb?.(id);
        if (isMobile) setBottomSheetState('peek');
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
  els.satelliteList
    .querySelectorAll<HTMLLIElement>('.satellite-list-item')
    .forEach((item) => {
      const isSelected = item.dataset.noradId === noradId;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-selected', String(isSelected));
    });
  updateMiniMap();
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

  const color = CONSTELLATION_CSS_COLORS[sat.constellation] || '#00d4ff';

  // Status dot with constellation color
  els.infoStatusDot.className = `status-dot status-dot--${sat.health}`;
  els.infoStatusDot.style.background = sat.health === 'healthy' ? color : '';

  els.infoName.textContent = sat.name;
  els.infoNorad.textContent = sat.noradId;
  els.infoAltitude.innerHTML = `${sat.altitude.toFixed(1)} <small>km</small>`;
  els.infoVelocity.innerHTML = `${sat.velocity.toFixed(3)} <small>km/s</small>`;
  els.infoPeriod.innerHTML = `${sat.period.toFixed(1)} <small>min</small>`;
  els.infoLat.textContent = `${sat.lat.toFixed(4)}°`;
  els.infoLng.textContent = `${sat.lon.toFixed(4)}°`;
  els.infoConstellation.textContent = sat.constellation;
  els.infoConstellation.style.color = color;

  els.infoHealth.textContent = capitalize(sat.health);
  els.infoHealth.className = `info-value health-badge health-badge--${sat.health}`;

  // Set panel accent color
  els.satelliteInfo.style.setProperty('--info-accent', color);

  if (isMobile) {
    setBottomSheetState('peek');
  }
}

export function hideSatelliteInfo(): void {
  els.satelliteInfo.hidden = true;
  selectedSatId = null;
  els.satelliteList
    .querySelectorAll<HTMLLIElement>('.satellite-list-item')
    .forEach((item) => {
      item.classList.remove('selected');
      item.setAttribute('aria-selected', 'false');
    });
  updateMiniMap();
}

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
  if (message) els.loadingStatus.textContent = message;
}

export function updateLoadingProgress(percent: number, message?: string): void {
  els.loadingProgress.style.width = `${Math.min(100, Math.max(0, percent))}%`;
  if (message) els.loadingStatus.textContent = message;
}

export function hideLoading(): void {
  els.loadingOverlay.classList.add('fade-out');
  setTimeout(() => { els.loadingOverlay.hidden = true; }, 600);
}

/* ═══════════════════════════════════════════════════════════════
   Callback Registration
   ═══════════════════════════════════════════════════════════════ */

export function onTimeSpeedChange(cb: TimeSpeedCallback): void { onTimeSpeedCb = cb; }
export function onPlayPauseToggle(cb: PlayPauseCallback): void { onPlayPauseCb = cb; }
export function onSatelliteSelect(cb: SatelliteSelectCallback): void { onSatSelectCb = cb; }
export function onSettingsChange(cb: SettingsChangeCallback): void { onSettingsChangeCb = cb; }
export function onGroupsChange(cb: GroupsChangeCallback): void { onGroupsChangeCb = cb; }
export function onResetTime(cb: ResetTimeCallback): void { onResetTimeCb = cb; }

/* ═══════════════════════════════════════════════════════════════
   Helpers — Convert SatelliteWithPosition → UISatellite
   ═══════════════════════════════════════════════════════════════ */

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

function deriveHealth(sat: SatelliteWithPosition): 'healthy' | 'degraded' | 'offline' {
  if (!sat.position) return 'offline';
  const alt = sat.position.alt;
  if (alt < 15000 || alt > 30000) return 'offline';
  if (sat.orbitalInfo.eccentricity > 0.02) return 'degraded';
  return 'healthy';
}

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

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Scene module — public API
 */

export { SceneManager } from './scene-manager.js';
export { SatelliteRenderer } from './satellites.js';
export type { SatellitePositionData } from './satellites.js';
export { OrbitRenderer } from './orbits.js';
export { createEarth, updateEarth, setGridVisible } from './earth.js';
export { createBackground, updateBackground } from './background.js';
export { setupPostProcessing, resizePostProcessing } from './post-processing.js';
export type { PostProcessingConfig } from './post-processing.js';

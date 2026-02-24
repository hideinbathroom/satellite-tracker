# GPS Satellite Tracker

Real-time 3D visualization of GPS satellites orbiting Earth. Built with Three.js, satellite.js (SGP4), and Vite + TypeScript.

## Features

- Real-time GPS satellite positions from CelesTrak TLE data
- 3D Earth globe with procedural shader and atmosphere glow
- Orbital path visualization with gradient trails
- Satellite selection with info panel (altitude, velocity, lat/lon)
- Time simulation controls (1x / 10x / 100x / 1000x speed)
- Dark theme "Network Graph" aesthetic with bloom post-processing
- Offline fallback with embedded TLE data

## Getting Started

```bash
npm install
npm run dev
```

## Build for Production

```bash
npm run build
```

Output goes to `dist/` — deploy to Cloudflare Pages or any static host.

## Tech Stack

- Vite + TypeScript
- Three.js (WebGL 3D rendering + post-processing bloom)
- satellite.js (SGP4/SDP4 orbital propagation)
- CelesTrak (GPS constellation TLE data source)

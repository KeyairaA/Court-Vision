# Court Vision web

React 19 + TypeScript + Tailwind v4, built with Vite. It renders the JSON artifacts the pipeline publishes to `data/v1/` and never recomputes a metric.

## Run it

```bash
cd web
npm ci
npm run dev        # http://localhost:5173, reads ../data/v1 straight from disk
npm run check      # lint, typecheck, tests, production build, performance budget
```

## How it fits together

- **Data**: `src/data/load.ts` reads `manifest.json` first and refuses a schema major it does not understand. Every other artifact is fetched with its content hash in the query string, so a refresh gets a new URL and an unchanged file stays cached.
- **Types**: `src/data/contract.ts` re-exports the generated types in `schemas/typescript/artifacts.ts`. If a field changes in the pipeline, `npm run typecheck` fails here.
- **Artifacts in the build**: a small Vite plugin (`vite.config.ts`) serves `../data/v1` in dev and copies it to `dist/data/v1` on build. The data never enters the JS bundle.
- **Theme**: tokens live in `src/index.css`. An inline script in `index.html` sets the theme before first paint: the stored choice, then the system preference, then light. Its hash is in the CSP in `vercel.json`, and a test fails if the two drift apart.
- **Charts**: hand-built SVG (`src/components/charts`) rather than a chart library. The design needs shaded caveat seasons, open markers for short seasons, and lines that break at missing seasons. It also keeps the whole app near 100 kB gzip.

## Deploying on Vercel

Import the repository and set **Root Directory** to `web`. Leave "Include files outside the root directory" on (the default), because the build copies `../data/v1`. `vercel.json` sets up SPA routing, cache headers and security headers. Each data refresh the scheduled workflow commits triggers a redeploy.

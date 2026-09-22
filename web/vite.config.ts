/// <reference types="vitest/config" />
import { cp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
/** Absolute site URL for canonical, Open Graph and sitemap links. Set SITE_URL for a custom domain. */
const SITE_URL = (process.env.SITE_URL ?? "https://court-vision-snowy.vercel.app").replace(/\/$/, "");
const ARTIFACTS = path.resolve(here, "../data/v1");
const PUBLIC_PATH = "/data/v1/";

/**
 * Serves the pipeline's committed artifacts (repo-root data/v1) at /data/v1/.
 *
 * The artifacts are fetched at runtime rather than imported, so they stay out
 * of the JS bundle and keep their own cache lifetime. In dev they are read
 * straight from disk; in a build they are copied into dist/data/v1.
 */
function artifacts(): Plugin {
  return {
    name: "court-vision-artifacts",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(PUBLIC_PATH)) return next();
        const file = path.join(ARTIFACTS, path.basename(url));
        if (!file.endsWith(".json") || !existsSync(file)) {
          res.statusCode = 404;
          return res.end();
        }
        res.setHeader("Content-Type", "application/json");
        res.end(await readFile(file));
      });
    },
    transformIndexHtml(html) {
      return html.replaceAll("%SITE_URL%", SITE_URL);
    },
    async writeBundle(options) {
      const out = options.dir ?? path.resolve(here, "dist");
      await cp(ARTIFACTS, path.join(out, "data/v1"), { recursive: true });
      // Every page a search engine can reach, including one per player.
      const careers = JSON.parse(await readFile(path.join(ARTIFACTS, "careers.json"), "utf8")) as { player_id: number }[];
      const urls = ["/", "/leaders", "/compare", "/players", "/how-it-works", ...careers.map((c) => `/players/${c.player_id}`)];
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
      await writeFile(path.join(out, "sitemap.xml"), sitemap);
      await writeFile(path.join(out, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), artifacts()],
  server: { fs: { allow: [path.resolve(here, "..")] } },
  build: { sourcemap: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});

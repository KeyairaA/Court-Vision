// Performance budget for the built site, run in CI after `vite build`.
// A portfolio site that loads slowly undercuts its own argument.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const BUDGET_KB = { entryJs: 110, totalJs: 180, css: 20 };
const dir = new URL("../dist/assets/", import.meta.url).pathname;
const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
const gz = (f) => gzipSync(readFileSync(join(dir, f))).length / 1024;

const files = readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile());
const js = files.filter((f) => f.endsWith(".js"));
const entry = js.filter((f) => html.includes(f));
const report = {
  entryJs: entry.reduce((n, f) => n + gz(f), 0),
  totalJs: js.reduce((n, f) => n + gz(f), 0),
  css: files.filter((f) => f.endsWith(".css")).reduce((n, f) => n + gz(f), 0),
};

let failed = false;
for (const [key, kb] of Object.entries(report)) {
  const ok = kb <= BUDGET_KB[key];
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "OVER"} ${key.padEnd(8)} ${kb.toFixed(1).padStart(6)} kB gzip (budget ${BUDGET_KB[key]} kB)`);
}
process.exit(failed ? 1 : 0);

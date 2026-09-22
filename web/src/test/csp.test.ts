import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Content-Security-Policy", () => {
  it("allows exactly the inline theme script in index.html", () => {
    const html = readFileSync("index.html", "utf8");
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    const hash = createHash("sha256").update(script).digest("base64");
    expect(readFileSync("vercel.json", "utf8")).toContain(`'sha256-${hash}'`);
  });
});

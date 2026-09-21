// Generates typescript/artifacts.ts from *.schema.json.
//
// Do not edit the output by hand. The chain is:
//   pipeline/courtvision/artifacts/models.py   (the only source of truth)
//     -> `courtvision schemas`                  -> schemas/*.schema.json
//     -> `npm run generate`                     -> schemas/typescript/artifacts.ts
// CI regenerates both and fails if either committed copy is stale.
//
// Any exported name declared twice is a hard failure. An earlier version of
// this script silently kept the first declaration, which let a manifest field
// alias (`PlayerSeasons = number`) shadow the real artifact type.

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { compile } from "json-schema-to-typescript";

const here = new URL(".", import.meta.url);
const outDir = new URL("typescript/", here);

const files = (await readdir(here)).filter((f) => f.endsWith(".schema.json")).sort();
if (files.length === 0) throw new Error("No *.schema.json files found.");

const banner = [
  "/* eslint-disable */",
  "/**",
  " * GENERATED FILE. DO NOT EDIT.",
  " * Source: pipeline/courtvision/artifacts/models.py",
  " * Regenerate: `courtvision schemas` then `npm run generate --prefix schemas`",
  " */",
  "",
].join("\n");

const parts = [];
const names = [];
for (const file of files) {
  const schema = JSON.parse(await readFile(new URL(file, here), "utf8"));
  const ts = await compile(schema, schema.title, {
    bannerComment: "",
    additionalProperties: false,
    strictIndexSignatures: true,
    format: true,
  });
  parts.push(`// ---- ${file} ----\n${ts.trim()}\n`);
  names.push([file.replace(".schema.json", ""), schema.title]);
}
const body = parts.join("\n");

const declared = [...body.matchAll(/^export (?:interface|type) (\w+)/gm)].map((m) => m[1]);
const duplicates = [...new Set(declared.filter((n, i) => declared.indexOf(n) !== i))];
if (duplicates.length) {
  throw new Error(
    `Duplicate exported names: ${duplicates.join(", ")}. Two schemas define the ` +
      `same model name; rename one in models.py rather than letting one shadow the other.`,
  );
}
for (const [, title] of names) {
  if (!declared.includes(title)) throw new Error(`Root type ${title} was not emitted.`);
}

const map = [
  "",
  "/** Artifact file name (without .json) to its type. */",
  "export interface ArtifactTypes {",
  ...names.map(([file, title]) => `  "${file}": ${title};`),
  "}",
  "",
  "export type ArtifactName = keyof ArtifactTypes;",
  "",
].join("\n");

await mkdir(outDir, { recursive: true });
await writeFile(new URL("artifacts.ts", outDir), banner + body.trimEnd() + "\n" + map);
console.log(`Generated typescript/artifacts.ts from ${files.length} schemas.`);

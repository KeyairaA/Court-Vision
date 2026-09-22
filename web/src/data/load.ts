import { SUPPORTED_SCHEMA_MAJOR, type ArtifactMap, type ArtifactName, type Manifest } from "./contract";

export const ARTIFACT_BASE = `${import.meta.env.BASE_URL}data/v1/`;

export type ArtifactErrorKind = "network" | "http" | "parse" | "schema";

/** Why an artifact could not be shown. Each kind gets its own message in the UI. */
export class ArtifactError extends Error {
  readonly kind: ArtifactErrorKind;
  readonly artifact: ArtifactName;

  constructor(kind: ArtifactErrorKind, artifact: ArtifactName, message: string) {
    super(message);
    this.name = "ArtifactError";
    this.kind = kind;
    this.artifact = artifact;
  }
}

async function getJson(name: ArtifactName, query = ""): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${ARTIFACT_BASE}${name}.json${query}`, { headers: { Accept: "application/json" } });
  } catch {
    throw new ArtifactError("network", name, `Could not reach ${name}.json. Check the connection and try again.`);
  }
  if (!response.ok) {
    throw new ArtifactError("http", name, `${name}.json returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new ArtifactError("parse", name, `${name}.json is not valid JSON.`);
  }
}

/**
 * The manifest is read first and gates everything else. A schema major the
 * site does not understand stops the app with a clear message instead of
 * rendering a shape it cannot interpret.
 */
export function checkManifest(value: unknown): Manifest {
  if (typeof value !== "object" || value === null || typeof (value as Manifest).schema_version !== "string") {
    throw new ArtifactError("schema", "manifest", "manifest.json has no schema_version.");
  }
  const manifest = value as Manifest;
  const major = Number.parseInt(manifest.schema_version.split(".")[0] ?? "", 10);
  if (major !== SUPPORTED_SCHEMA_MAJOR) {
    throw new ArtifactError(
      "schema",
      "manifest",
      `The data uses schema ${manifest.schema_version}, but this version of the site reads ${SUPPORTED_SCHEMA_MAJOR}.x.`,
    );
  }
  return manifest;
}

const cache = new Map<ArtifactName, Promise<unknown>>();
const settled = new Map<ArtifactName, unknown>();

async function load<N extends ArtifactName>(name: N): Promise<ArtifactMap[N]> {
  if (name === "manifest") {
    return checkManifest(await getJson("manifest")) as ArtifactMap[N];
  }
  // Content-addressed query string: a refreshed artifact gets a new URL, an
  // unchanged one keeps hitting the CDN cache.
  const manifest = await loadArtifact("manifest");
  const hash = manifest.artifacts?.[name]?.sha256;
  return (await getJson(name, hash ? `?v=${hash.slice(0, 12)}` : "")) as ArtifactMap[N];
}

/** Fetch an artifact once per page load. Concurrent callers share one request. */
export function loadArtifact<N extends ArtifactName>(name: N): Promise<ArtifactMap[N]> {
  let pending = cache.get(name) as Promise<ArtifactMap[N]> | undefined;
  if (!pending) {
    pending = load(name).then(
      (data) => {
        settled.set(name, data);
        return data;
      },
      (error: unknown) => {
        cache.delete(name);
        throw error;
      },
    );
    cache.set(name, pending);
  }
  return pending;
}

/** The artifact if it has already loaded, so revisits render without a loading flash. */
export function peekArtifact<N extends ArtifactName>(name: N): ArtifactMap[N] | undefined {
  return settled.get(name) as ArtifactMap[N] | undefined;
}

/** Test hook: forget everything loaded so far. */
export function resetArtifactCache(): void {
  cache.clear();
  settled.clear();
}

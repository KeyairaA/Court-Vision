import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ArtifactMap, ArtifactName } from "./contract";
import { loadArtifact, peekArtifact, peekArtifactError, subscribeArtifacts, type ArtifactError } from "./load";

export type ArtifactState<T> =
  | { status: "loading" }
  | { status: "error"; error: ArtifactError; retry: () => void }
  | { status: "ready"; data: T };

/**
 * An artifact as React state. Reads straight from the loader's cache through
 * useSyncExternalStore, so a component re-renders whenever the artifact
 * settles, including when a prefetch finished before the component mounted.
 */
export function useArtifact<N extends ArtifactName>(name: N): ArtifactState<ArtifactMap[N]> {
  const data = useSyncExternalStore(subscribeArtifacts, () => peekArtifact(name));
  const error = useSyncExternalStore(subscribeArtifacts, () => peekArtifactError(name));

  useEffect(() => {
    if (!peekArtifact(name) && !peekArtifactError(name)) void loadArtifact(name).catch(() => undefined);
  }, [name]);

  const retry = useCallback(() => void loadArtifact(name).catch(() => undefined), [name]);

  if (data !== undefined) return { status: "ready", data };
  if (error) return { status: "error", error, retry };
  return { status: "loading" };
}

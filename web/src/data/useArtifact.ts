import { useCallback, useEffect, useState } from "react";
import type { ArtifactMap, ArtifactName } from "./contract";
import { ArtifactError, loadArtifact, peekArtifact } from "./load";

export type ArtifactState<T> =
  | { status: "loading" }
  | { status: "error"; error: ArtifactError; retry: () => void }
  | { status: "ready"; data: T };

function toArtifactError(name: ArtifactName, error: unknown): ArtifactError {
  return error instanceof ArtifactError ? error : new ArtifactError("parse", name, String(error));
}

export function useArtifact<N extends ArtifactName>(name: N): ArtifactState<ArtifactMap[N]> {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; value: ArtifactState<ArtifactMap[N]> } | null>(null);
  const key = `${name}:${attempt}`;
  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (peekArtifact(name)) return;
    let live = true;
    loadArtifact(name).then(
      (data) => live && setState({ key, value: { status: "ready", data } }),
      (error: unknown) => live && setState({ key, value: { status: "error", error: toArtifactError(name, error), retry } }),
    );
    return () => {
      live = false;
    };
  }, [name, key, retry]);

  const cached = peekArtifact(name);
  if (cached) return { status: "ready", data: cached };
  if (state && state.key === key) return state.value;
  return { status: "loading" };
}

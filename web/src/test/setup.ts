import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { resetArtifactCache } from "../data/load";

afterEach(() => {
  cleanup();
  resetArtifactCache();
});
import "@testing-library/jest-dom/vitest";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadArtifact } from "./data/load";
import "./index.css";

// Start the manifest request before React renders; every view needs it first.
void loadArtifact("manifest").catch(() => undefined);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

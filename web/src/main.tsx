import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { prefetchRoute } from "./data/prefetch";
import "./index.css";

// Start this page's data before React renders or the route's code arrives.
prefetchRoute(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

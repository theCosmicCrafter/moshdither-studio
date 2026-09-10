import { logger } from "./utils/logger";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Self-hosted fonts for offline/universal distribution
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource/architects-daughter/index.css";

import "./index.css";

// Anything that escapes a component -- an unhandled rejection from an async
// handler, a throw outside React -- never reaches the logger, and release
// builds have no console to show it. Route both into the app's log file so a
// failure leaves evidence rather than just a status message the user has to
// relay by hand.
window.addEventListener("error", (e) => {
  logger.error("uncaught", e.message, {
    source: `${e.filename}:${e.lineno}:${e.colno}`,
    stack: e.error instanceof Error ? e.error.stack?.slice(0, 2000) : undefined,
  });
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  logger.error("unhandled-rejection", r instanceof Error ? r.message : String(r), {
    stack: r instanceof Error ? r.stack?.slice(0, 2000) : undefined,
  });
});


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

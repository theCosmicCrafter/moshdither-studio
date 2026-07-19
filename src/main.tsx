import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// Self-hosted fonts for offline/universal distribution
import "@fontsource-variable/geist/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource/architects-daughter/index.css";
import "material-symbols/outlined.css";

import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

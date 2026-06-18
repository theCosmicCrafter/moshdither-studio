import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./styles/layout.css";
import "./styles/components.css";
import "./App.css";
import App from "./App.tsx";

window.addEventListener('error', (event) => {
  window.ipcRenderer?.send('renderer:log', { level: 'error', message: 'Uncaught Error: ' + event.error?.stack });
});
window.addEventListener('unhandledrejection', (event) => {
  window.ipcRenderer?.send('renderer:log', { level: 'error', message: 'Unhandled Rejection: ' + event.reason?.stack });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

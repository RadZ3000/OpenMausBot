import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { distribution } from "./lib/distribution";
import { applySkin, readSkin } from "./lib/skins";
import "./styles.css";

// Before the first paint, not inside a component: stamping the skin during
// render would show one frame of the default palette first.
applySkin(readSkin(distribution.defaultSkin));

// Electron takes the window title from here, so a renamed build must set it
// before the shell reads it rather than in a component that mounts later.
document.title = distribution.productName;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

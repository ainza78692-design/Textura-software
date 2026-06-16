import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getServerOrigin } from "./api/client";
import { getRouter } from "./router";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found.");
}

const router = getRouter();

async function scheduleUpdateChecks() {
  if (!window.texturaDesktop?.checkForUpdates) return;

  const check = async () => {
    const serverOrigin = await getServerOrigin();
    await window.texturaDesktop?.checkForUpdates(serverOrigin);
  };

  window.setTimeout(() => void check(), 10_000);
  window.setInterval(() => void check(), 6 * 60 * 60 * 1000);
}

void scheduleUpdateChecks();

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

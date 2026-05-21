import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("openstory shell: #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

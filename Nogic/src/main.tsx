import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n.ts";
import App from "./App.tsx";
import "./App.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

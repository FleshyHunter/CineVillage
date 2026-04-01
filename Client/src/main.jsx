import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AccountProvider } from "./context/AccountContext";
import "./styles/base.css";
import "./styles/layout.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AccountProvider>
      <App />
    </AccountProvider>
  </React.StrictMode>
);

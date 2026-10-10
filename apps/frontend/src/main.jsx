import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { SettingsProvider } from "./contexts/SettingsContext.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HelmetProvider>
      <BrowserRouter>
        <AuthProvider>
          <SettingsProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </SettingsProvider>
        </AuthProvider>
      </BrowserRouter>

    </HelmetProvider>
  </StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { createPortal } from "react-dom";
import "./index.css";
import App from "./App";
import { ThemeProvider } from "./context/ThemeContext";
import { ToastProvider } from "./context/ToastContext";
import { NotificationsProvider } from "./utils/notify";
import reportWebVitals from "./reportWebVitals";
import axios from "axios";
import api from "./api/client";
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { isNativeApp } from './utils/native';

// Marca la app para los estilos que solo aplican dentro de ella (.native-app).
if (isNativeApp()) document.documentElement.classList.add('native-app');

// api client centralizado configura baseURL, Authorization y toasts
axios.defaults.baseURL = (api.defaults && api.defaults.baseURL) || '';

// Los avisos viven en su propio contenedor colgado de <body>: los diálogos dejan
// inerte todo lo demás y así siguen viéndose y anunciándose (AUD-3).
const toastsEl = document.getElementById("toasts") || Object.assign(document.createElement("div"), { id: "toasts" });
if (!toastsEl.isConnected) document.body.appendChild(toastsEl);

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const queryClient = new QueryClient();
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <NotificationsProvider>
          <QueryClientProvider client={queryClient}>
            {createPortal(<Toaster position="top-right" containerStyle={{ top: 'calc(env(safe-area-inset-top, 0px) + 16px)' }} />, toastsEl)}
            <App />
          </QueryClientProvider>
        </NotificationsProvider>
      </ToastProvider>
    </ThemeProvider>
  </React.StrictMode>
);

reportWebVitals();

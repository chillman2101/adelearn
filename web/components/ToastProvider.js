"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const ToastContext = createContext(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast harus digunakan di dalam ToastProvider.");
  return context;
}

export default function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const dismissToast = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const showToast = useCallback((message, type = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), message, type });
    timer.current = setTimeout(() => {
      timer.current = null;
      setToast(null);
    }, 3600);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toast && <div className={`toast ${toast.type === "error" ? "toast-error" : ""}`} key={toast.id} role={toast.type === "error" ? "alert" : "status"}>
          <span className="toast-mark" aria-hidden="true">{toast.type === "error" ? "!" : "✓"}</span>
          <span className="toast-message">{toast.message}</span>
          <button type="button" className="toast-dismiss" onClick={dismissToast} aria-label="Tutup notifikasi">×</button>
        </div>}
      </div>
    </ToastContext.Provider>
  );
}

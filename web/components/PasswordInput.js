"use client";

import { useState } from "react";

export default function PasswordInput({ className = "input", ...props }) {
  const [visible, setVisible] = useState(false);
  return <span className="password-input-wrap">
    <input {...props} className={className} type={visible ? "text" : "password"} />
    <button className={`password-visibility${visible ? " is-visible" : ""}`} type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Sembunyikan sandi" : "Tampilkan sandi"} aria-pressed={visible}>
      {visible ? <svg key="shown" className="eye-icon eye-icon-enter" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.2A10.7 10.7 0 0112 5c5.2 0 8.7 4.6 9.5 6-.3.6-1.2 1.8-2.5 2.9M6.2 6.2C3.9 7.6 2.8 9.8 2.5 11c.8 1.4 4.3 6 9.5 6 1 0 1.9-.2 2.8-.5" /></svg> : <svg key="hidden" className="eye-icon eye-icon-enter" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></svg>}
    </button>
  </span>;
}

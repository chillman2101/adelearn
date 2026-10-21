"use client";

import { useEffect, useRef } from "react";

export default function AppCheckbox({ checked, indeterminate = false, label, className = "", onChange, onClick, ...inputProps }) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return <input
    {...inputProps}
    ref={inputRef}
    className={`app-checkbox ${className}`.trim()}
    type="checkbox"
    aria-label={label}
    checked={checked}
    onChange={onChange}
    onClick={onClick}
  />;
}

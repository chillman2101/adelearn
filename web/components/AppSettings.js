"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { catalogsApi, settingsApi } from "../lib/api";

const STORAGE_KEY = "adelearn-app-settings";
const defaults = {
  activeClass: "Kelas 8A",
  activeClassId: "",
  teacherName: "Nur Aisyah",
  teacherId: "",
  academicYear: "2026 / 2027",
};
const SettingsContext = createContext(null);

export function AppSettingsProvider({ children }) {
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      setSettings({ ...defaults, ...saved });
    } catch {
      setSettings(defaults);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [ready, settings]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    catalogsApi.list("classes").then((classes) => {
      if (!active) return;
      const match = classes.find((item) => item.id === settings.activeClassId) || classes.find((item) => item.name.toLocaleLowerCase() === String(settings.activeClass || "").toLocaleLowerCase());
      if (match) setSettings((current) => current.activeClassId === match.id && current.activeClass === match.name ? current : { ...current, activeClassId: match.id, activeClass: match.name });
    }).catch(() => {});
    return () => { active = false; };
  }, [ready, settings.activeClass, settings.activeClassId]);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    settingsApi.get().then((saved) => {
      if (!active || !saved?.academic_year) return;
      setSettings((current) => ({
        ...current,
        activeClassId: saved.class_id || current.activeClassId,
        activeClass: saved.class || current.activeClass,
        teacherId: saved.teacher_id || current.teacherId,
        teacherName: saved.teacher_name || current.teacherName,
        academicYear: saved.academic_year,
      }));
    }).catch(() => {});
    return () => { active = false; };
  }, [ready]);

  function updateSettings(next) {
    setSettings((current) => ({ ...current, ...next }));
  }

  return <SettingsContext.Provider value={{ settings, ready, updateSettings }}>{children}</SettingsContext.Provider>;
}

export function useAppSettings() {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useAppSettings harus digunakan di dalam AppSettingsProvider.");
  return value;
}

function initials(name) {
  const parts = (name || "Guru").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "G").toUpperCase();
}

export function SettingsDisplay({ variant }) {
  const { settings } = useAppSettings();
  if (variant === "class") return <><strong>{settings.activeClass}</strong><span>{settings.academicYear}</span></>;
  if (variant === "teacher") return <><strong>{settings.teacherName}</strong><small>Guru · {settings.activeClass}</small></>;
  if (variant === "year") return <><div className="breadcrumb">Tahun ajaran <b>{settings.academicYear}</b><span>⌄</span></div></>;
  return <>{initials(settings.teacherName)}</>;
}

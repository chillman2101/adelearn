"use client";

import { useEffect, useMemo, useState } from "react";
import { catalogsApi } from "../lib/api";

export default function CatalogSelect({ kind, value, valueName = "", onChange, subjectId = "", placeholder = "Pilih atau buat baru", disabled = false }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; async function load() { try { const rows = await catalogsApi.list(kind, subjectId); if (active) setItems(rows); } catch {} } load(); return () => { active = false; }; }, [kind, subjectId]);
  const filtered = useMemo(() => items.filter((item) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [items, query]);
  const selected = items.find((item) => item.id === value) || items.find((item) => item.name === valueName) || items.find((item) => item.name === value);
  function choose(item) { onChange(item.id, item.name); setQuery(""); setOpen(false); }
  async function create() {
    const name = query.trim(); if (!name || busy) return;
    setBusy(true);
    try { const item = await catalogsApi.create(kind, name, subjectId); setItems((current) => current.some((row) => row.id === item.id) ? current : [...current, item]); choose(item); }
    finally { setBusy(false); }
  }
  return <div className="catalog-select">
    <button type="button" className="input catalog-select-trigger" aria-expanded={open} disabled={disabled} onClick={() => { setOpen((v) => !v); setQuery(""); }}><span>{selected?.name || valueName || placeholder}</span><span className="catalog-select-chevron" aria-hidden="true"/></button>
    {open && !disabled && <div className="catalog-select-menu"><input autoFocus className="input catalog-select-search" placeholder="Cari…" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); if (filtered.length) choose(filtered[0]); else create(); } if (event.key === "Escape") setOpen(false); }}/>
      <div className="catalog-select-options">{filtered.map((item) => <button type="button" key={item.id} onClick={() => choose(item)}>{item.name}</button>)}
      {!filtered.length && <p>{query ? "Belum ada pilihan yang cocok." : "Belum ada data."}</p>}
      {query.trim() && !items.some((item) => item.name.toLocaleLowerCase() === query.trim().toLocaleLowerCase()) && <button type="button" className="catalog-create" disabled={busy} onClick={create}>＋ Buat “{query.trim()}”</button>}</div>
    </div>}
  </div>;
}

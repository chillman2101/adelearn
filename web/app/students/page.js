"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { catalogsApi, studentsApi } from "../../lib/api";
import { useAppSettings } from "../../components/AppSettings";
import { useToast } from "../../components/ToastProvider";

const blankForm = { name: "", class_id: "" };

export default function StudentsPage() {
  const router = useRouter();
  const { settings } = useAppSettings();
  const { showToast } = useToast();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importRows, setImportRows] = useState([]);
  const [importMessage, setImportMessage] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let active = true;
    catalogsApi.list("classes").then((rows) => { if (active) setClasses(rows); }).catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setError("");
    studentsApi.list({ q: query.trim(), class_id: classFilter }).then((rows) => {
      if (active) setStudents(rows);
    }).catch((e) => {
      if (active) setError(e.message);
    });
    return () => { active = false; };
  }, [query, classFilter, reloadKey]);

  function startCreate() {
    setEditingId("");
    setForm({ ...blankForm, class_id: settings.activeClassId || classes[0]?.id || "" });
    setFormOpen(true);
  }

  function startEdit(student) {
    setEditingId(student.id);
    setForm({ name: student.name, class_id: student.class_id });
    setFormOpen(true);
  }

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.class_id) {
      showToast("Isi nama siswa dan pilih kelas.", "error");
      return;
    }
    setSaving(true);
    try {
      await studentsApi.save({ name: form.name.trim(), class_id: form.class_id }, editingId || undefined);
      setFormOpen(false);
      setForm(blankForm);
      setEditingId("");
      setReloadKey((value) => value + 1);
      showToast(editingId ? "Data siswa berhasil diperbarui." : "Siswa berhasil ditambahkan.");
    } catch (e) {
      showToast(e.message || "Data siswa gagal disimpan.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function archive(student) {
    if (!window.confirm(`Arsipkan data ${student.name}?`)) return;
    try {
      await studentsApi.archive(student.id);
      setReloadKey((value) => value + 1);
      showToast("Siswa berhasil diarsipkan.");
    } catch (e) {
      showToast(e.message || "Siswa gagal diarsipkan.", "error");
    }
  }

  async function previewImport(event) {
    event.preventDefault();
    if (!importFile || importing) return;
    if (!settings.activeClassId) {
      setImportMessage("Pilih kelas aktif di pengaturan guru sebelum mengimpor siswa.");
      return;
    }
    if (importFile.size > 10 * 1024 * 1024) {
      setImportMessage("Ukuran file maksimal 10 MB.");
      return;
    }
    setImporting(true);
    setImportMessage("");
    setImportRows([]);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await importFile.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
      if (!records.length) throw new Error("File tidak memiliki baris judul.");
      const headers = records[0].map((value) => String(value).trim().toLocaleLowerCase().replace(/^\uFEFF/, "").replace(/[ _-]+/g, " "));
      const nameColumn = headers.findIndex((value) => ["nama siswa", "nama", "name", "student name"].includes(value));
      if (nameColumn < 0) throw new Error("Kolom wajib 'Nama siswa' tidak ditemukan.");
      const rows = records.slice(1).map((record, index) => ({ record, row: index + 2 })).filter(({ record }) => record.some((value) => String(value).trim())).map(({ record, row }) => {
        const name = String(record[nameColumn] || "").trim();
        return { row, name, errors: name ? [] : ["Nama siswa wajib diisi."] };
      });
      if (!rows.length) throw new Error("Belum ada nama siswa di dalam file.");
      if (rows.length > 500) throw new Error("Maksimal 500 siswa per impor.");
      setImportRows(rows);
      const invalid = rows.filter((row) => row.errors.length).length;
      setImportMessage(invalid ? `${rows.length} baris terbaca. Perbaiki ${invalid} baris yang ditandai lalu unggah ulang.` : `${rows.length} siswa siap ditambahkan ke ${settings.activeClass}.`);
    } catch (failure) {
      setImportMessage(failure.message || "File tidak dapat dibaca.");
    } finally {
      setImporting(false);
    }
  }

  async function importStudents() {
    if (importing || !importRows.length || importRows.some((row) => row.errors.length) || !settings.activeClassId) return;
    setImporting(true);
    try {
      const result = await studentsApi.import(importRows.map((row) => ({ name: row.name, class_id: settings.activeClassId })));
      setReloadKey((value) => value + 1);
      showToast(`${result.imported} siswa berhasil diimpor ke ${settings.activeClass}.`);
      setImportRows([]);
      setImportFile(null);
      setImportMessage("");
      setImportOpen(false);
      const input = document.getElementById("student-import-file");
      if (input) input.value = "";
    } catch (failure) {
      setImportMessage(failure.message || "Siswa gagal diimpor.");
    } finally {
      setImporting(false);
    }
  }

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">DATA KELAS</span>
        <h1>Siswa</h1>
        <p>Kelola daftar siswa dan kelasnya.</p>
      </div>
      <div className="student-page-actions">
        <button className="button secondary" type="button" onClick={() => { setImportOpen((value) => !value); setImportRows([]); setImportMessage(""); }}>↓ Import siswa</button>
        <button className="button primary" type="button" onClick={startCreate}><span>＋</span> Tambah siswa</button>
      </div>
    </div>

    {error && <div className="notice error">{error} Pastikan API Go dan PostgreSQL aktif.</div>}

    {formOpen && <section className="form-card student-form-card">
      <div className="editor-section-title"><div><h2>{editingId ? "Ubah data siswa" : "Tambah siswa"}</h2><p>Masukkan nama siswa dan pilih kelasnya.</p></div></div>
      <form onSubmit={save}>
        <div className="settings-grid">
          <div className="field">
            <label htmlFor="student-name">Nama siswa</label>
            <input id="student-name" className="input" autoFocus value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nama lengkap siswa" />
          </div>
          <div className="field">
            <label htmlFor="student-class">Kelas</label>
            <select id="student-class" className="select" value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))} required>
              <option value="">Pilih kelas</option>
              {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
        </div>
        {!classes.length && <small className="field-note">Buat kelas terlebih dahulu melalui Pengaturan.</small>}
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={() => { setFormOpen(false); setEditingId(""); }}>Batal</button>
          <button className="button primary" type="submit" disabled={saving || !classes.length}>{saving ? "Menyimpan…" : "Simpan siswa"}</button>
        </div>
      </form>
    </section>}

    {importOpen && <section className="form-card student-import-card">
      <div className="editor-section-title"><div><h2>Import siswa</h2><p>File berisi nama siswa. Semua siswa akan masuk ke kelas aktif: <strong>{settings.activeClass || "belum dipilih"}</strong>.</p></div></div>
      <div className="student-import-template"><a className="button secondary" href="/contoh-import-siswa.csv" download>↓ Unduh template CSV</a><small className="field-note">Gunakan kolom Nama siswa. Format yang didukung: Excel (.xlsx) atau CSV, maksimal 500 siswa dan 10 MB.</small></div>
      <form className="import-upload" onSubmit={previewImport}>
        <input id="student-import-file" className="input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setImportFile(event.target.files?.[0] || null); setImportRows([]); setImportMessage(""); }} />
        <button className="button primary" disabled={!importFile || importing}>{importing ? "Memeriksa…" : "Pratinjau file"}</button>
      </form>
      {!settings.activeClassId && <div className="notice error" style={{ marginTop: 14 }}>Pilih kelas aktif di pengaturan guru sebelum mengimpor siswa.</div>}
      {importMessage && <div className={`notice ${importRows.some((row) => row.errors.length) || !importRows.length ? "error" : ""}`} style={{ marginTop: 14 }}>{importMessage}</div>}
      {importRows.length > 0 && <>
        <div className="import-preview-heading"><h3>Pratinjau {importRows.length} siswa</h3><span>{importRows.some((row) => row.errors.length) ? `${importRows.filter((row) => row.errors.length).length} baris perlu diperbaiki` : "Siap diimpor"}</span></div>
        <div className="table-wrap import-table-wrap"><table className="data-table"><thead><tr><th>Baris</th><th>Status</th><th>Nama siswa</th><th>Kelas</th><th>Masalah</th></tr></thead><tbody>
          {importRows.map((row) => <tr key={row.row} className={row.errors.length ? "import-row-invalid" : ""}><td>{row.row}</td><td><span className={`import-status ${row.errors.length ? "invalid" : "valid"}`}>{row.errors.length ? "Perlu diperbaiki" : "Valid"}</span></td><td>{row.name || "—"}</td><td>{settings.activeClass}</td><td>{row.errors.join(" · ") || "—"}</td></tr>)}
        </tbody></table></div>
        <div className="form-actions"><button type="button" className="button primary" disabled={importing || importRows.some((row) => row.errors.length) || !settings.activeClassId} onClick={importStudents}>{importing ? "Menyimpan…" : `Import ${importRows.length} siswa`}</button></div>
      </>}
    </section>}

    <div className="toolbar students-toolbar">
      <input className="input filter-search" placeholder="⌕  Cari nama siswa…" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select className="select filter-select" aria-label="Filter kelas" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
        <option value="">Semua kelas</option>
        {classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <span className="eyebrow">{students.length} SISWA</span>
    </div>

    <div className="table-wrap">
      <table className="data-table">
        <thead><tr><th>Nama siswa</th><th>Kelas</th><th></th></tr></thead>
        <tbody>
          {students.length ? students.map((student) => <tr key={student.id} className="student-clickable-row" role="link" tabIndex={0} aria-label={`Buka detail ${student.name}`} onClick={() => router.push(`/students/${student.id}`)} onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === "Enter") router.push(`/students/${student.id}`); }}>
            <td><strong>{student.name}</strong></td>
            <td>{student.class}</td>
            <td><div className="row-actions"><button type="button" onClick={(event) => { event.stopPropagation(); startEdit(student); }}>Ubah</button><button type="button" onClick={(event) => { event.stopPropagation(); archive(student); }}>Arsip</button></div></td>
          </tr>) : <tr><td colSpan="3" className="table-empty">{error ? "Belum dapat memuat data siswa." : query || classFilter ? "Tidak ada siswa yang cocok dengan pencarian ini." : "Belum ada siswa. Tambahkan siswa untuk mulai mengisi daftar."}</td></tr>}
        </tbody>
      </table>
    </div>
    <footer className="page-footer"><span>Menampilkan {students.length} siswa</span><span>Data siswa · dikelompokkan berdasarkan kelas</span></footer>
  </>;
}

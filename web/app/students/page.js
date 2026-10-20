"use client";

import { useEffect, useState } from "react";
import { catalogsApi, studentsApi } from "../../lib/api";
import { useAppSettings } from "../../components/AppSettings";
import { useToast } from "../../components/ToastProvider";

const blankForm = { name: "", class_id: "" };

export default function StudentsPage() {
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

  return <>
    <div className="page-heading">
      <div>
        <span className="eyebrow">DATA KELAS</span>
        <h1>Siswa</h1>
        <p>Kelola daftar siswa dan kelasnya.</p>
      </div>
      <button className="button primary" type="button" onClick={startCreate}><span>＋</span> Tambah siswa</button>
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
          {students.length ? students.map((student) => <tr key={student.id}>
            <td><strong>{student.name}</strong></td>
            <td>{student.class}</td>
            <td><div className="row-actions"><button type="button" onClick={() => startEdit(student)}>Ubah</button><button type="button" onClick={() => archive(student)}>Arsip</button></div></td>
          </tr>) : <tr><td colSpan="3" className="table-empty">{error ? "Belum dapat memuat data siswa." : query || classFilter ? "Tidak ada siswa yang cocok dengan pencarian ini." : "Belum ada siswa. Tambahkan siswa untuk mulai mengisi daftar."}</td></tr>}
        </tbody>
      </table>
    </div>
    <footer className="page-footer"><span>Menampilkan {students.length} siswa</span><span>Data siswa · dikelompokkan berdasarkan kelas</span></footer>
  </>;
}

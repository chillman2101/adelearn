"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { catalogsApi, studentsApi } from "../../../lib/api";
import { useToast } from "../../../components/ToastProvider";

const formatDate = (value) => value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date(value)) : "—";

export default function StudentDetailPage() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [student, setStudent] = useState(null);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", class_id: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([studentsApi.get(id), catalogsApi.list("classes")]).then(([record, availableClasses]) => {
      if (!active) return;
      setStudent(record);
      setClasses(availableClasses);
      setForm({ name: record.name, class_id: record.class_id });
    }).catch((failure) => { if (active) setError(failure.message || "Data siswa tidak dapat dimuat."); });
    return () => { active = false; };
  }, [id]);

  async function save(event) {
    event.preventDefault();
    if (!form.name.trim() || !form.class_id) return;
    setSaving(true);
    try {
      const updated = await studentsApi.save({ name: form.name.trim(), class_id: form.class_id }, id);
      setStudent(updated);
      setForm({ name: updated.name, class_id: updated.class_id });
      setEditing(false);
      showToast("Data siswa berhasil diperbarui.");
    } catch (failure) {
      showToast(failure.message || "Data siswa gagal disimpan.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (error && !student) return <><div className="page-heading"><div><span className="eyebrow">DATA KELAS</span><h1>Detail siswa</h1></div><Link className="button secondary" href="/students">← Kembali ke siswa</Link></div><div className="notice error">{error}</div></>;
  if (!student) return <div className="notice">Memuat data siswa…</div>;

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">DATA KELAS · DETAIL SISWA</span><h1>{student.name}</h1><p>Informasi siswa dan kelas yang terdaftar.</p></div>
      <div className="student-page-actions"><Link className="button secondary" href="/students">← Kembali ke siswa</Link><button className="button primary" type="button" onClick={() => setEditing((value) => !value)}>{editing ? "Tutup ubah" : "Ubah data"}</button></div>
    </div>
    <section className="form-card student-detail-card">
      <div className="editor-section-title"><div><h2>Informasi siswa</h2><p>Data siswa tersimpan dalam daftar kelas.</p></div></div>
      <dl className="student-detail-grid"><div><dt>Nama siswa</dt><dd>{student.name}</dd></div><div><dt>Kelas</dt><dd>{student.class}</dd></div><div><dt>Terdaftar sejak</dt><dd>{formatDate(student.created_at)}</dd></div><div><dt>ID siswa</dt><dd className="student-detail-id">{student.id}</dd></div></dl>
    </section>
    {editing && <section className="form-card student-form-card"><div className="editor-section-title"><div><h2>Ubah data siswa</h2><p>Perbarui nama atau kelas siswa.</p></div></div><form onSubmit={save}><div className="settings-grid"><div className="field"><label htmlFor="student-detail-name">Nama siswa</label><input id="student-detail-name" className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required /></div><div className="field"><label htmlFor="student-detail-class">Kelas</label><select id="student-detail-class" className="select" value={form.class_id} onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))} required><option value="">Pilih kelas</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></div><div className="form-actions"><button type="button" className="button secondary" onClick={() => setEditing(false)}>Batal</button><button className="button primary" type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan perubahan"}</button></div></form></section>}
  </>;
}

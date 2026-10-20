"use client";

import { useEffect, useState } from "react";
import CatalogSelect from "../../components/CatalogSelect";
import { useAppSettings } from "../../components/AppSettings";
import { useToast } from "../../components/ToastProvider";
import { catalogsApi, settingsApi } from "../../lib/api";
import PasswordInput from "../../components/PasswordInput";

export default function SettingsPage() {
  const { settings, ready, updateSettings } = useAppSettings();
  const { showToast } = useToast();
  const [form, setForm] = useState(settings);
  const [account, setAccount] = useState(null);
  const [credentials, setCredentials] = useState({ old_password: "", new_username: "", new_password: "", confirm_password: "" });

  useEffect(() => {
    if (ready) setForm(settings);
  }, [ready, settings]);
  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()).then((session) => {
      setAccount(session.teacher || null);
      setCredentials((current) => ({ ...current, new_username: session.teacher?.username || "" }));
    }).catch(() => {});
  }, []);

  async function save(event) {
    event.preventDefault();
    const teacherName = form.teacherName.trim();
    const academicYear = form.academicYear.trim();
    if (!form.activeClass || !teacherName || !academicYear) {
      showToast("Lengkapi kelas, nama guru, dan tahun ajaran.", "error");
      return;
    }
    try {
      const activeClass = form.activeClassId
        ? { id: form.activeClassId, name: form.activeClass }
        : await catalogsApi.create("classes", form.activeClass);
      const teacher = form.teacherId
        ? { id: form.teacherId, name: teacherName }
        : await catalogsApi.create("teachers", teacherName);
      const saved = await settingsApi.save({ class_id: activeClass.id, teacher_id: teacher.id, academic_year: academicYear });
      updateSettings({ ...form, activeClassId: saved.class_id, activeClass: saved.class, teacherId: saved.teacher_id, teacherName: saved.teacher_name, academicYear: saved.academic_year });
      showToast("Pengaturan berhasil disimpan.");
    } catch (error) {
      showToast(error.message || "Nama guru gagal disimpan.", "error");
    }
  }

  async function changeCredentials(event) {
    event.preventDefault();
    if (credentials.new_password !== credentials.confirm_password) {
      showToast("Ulangi sandi baru dengan benar.", "error");
      return;
    }
    try {
      await fetch("/api/proxy/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ old_password: credentials.old_password, new_username: credentials.new_username, new_password: credentials.new_password }) }).then(async (response) => {
        if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.message || "Kredensial gagal diperbarui."); }
      });
      setCredentials({ old_password: "", new_username: credentials.new_username, new_password: "", confirm_password: "" });
      showToast("Username dan sandi berhasil diperbarui.");
    } catch (error) { showToast(error.message, "error"); }
  }

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">RUANG GURU</span><h1>Pengaturan</h1><p>Atur identitas kelas yang digunakan di ruang guru ini.</p></div>
    </div>
    <section className="form-card settings-profile-card">
      <div className="editor-section-title"><div><h2>Informasi kelas dan guru</h2><p>Informasi ini tampil di navigasi dan menjadi kelas awal saat membuat soal atau ujian.</p></div></div>
      <form onSubmit={save}>
        <div className="settings-grid">
          <div className="field">
            <label>Kelas aktif</label>
            <CatalogSelect kind="classes" placeholder="Pilih atau buat kelas" value={form.activeClassId} valueName={form.activeClass} onChange={(activeClassId, activeClass) => setForm((current) => ({ ...current, activeClassId, activeClass }))} />
          </div>
          <div className="field">
            <label>Nama guru</label>
            <CatalogSelect kind="teachers" placeholder="Pilih atau buat guru" value={form.teacherId} valueName={form.teacherName} onChange={(teacherId, teacherName) => setForm((current) => ({ ...current, teacherId, teacherName }))} />
          </div>
          <div className="field">
            <label>Tahun ajaran</label>
            <input className="input" value={form.academicYear} onChange={(event) => setForm((current) => ({ ...current, academicYear: event.target.value }))} placeholder="Contoh: 2026 / 2027" />
            <small className="field-note">Contoh: 2026 / 2027</small>
          </div>
        </div>
        <div className="form-actions"><button className="button primary" type="submit">Simpan pengaturan</button></div>
      </form>
    </section>
    <section className="form-card settings-profile-card">
      <div className="editor-section-title"><div><h2>Akun guru</h2><p>Ganti username atau sandi untuk akun yang sedang digunakan.</p></div></div>
      <form onSubmit={changeCredentials}>
        <div className="settings-grid">
          <div className="field"><label>Username</label><input className="input" autoComplete="username" required minLength={3} value={credentials.new_username} onChange={(event) => setCredentials({ ...credentials, new_username: event.target.value })}/></div>
          <div className="field"><label>Sandi lama</label><PasswordInput autoComplete="current-password" required value={credentials.old_password} onChange={(event) => setCredentials({ ...credentials, old_password: event.target.value })}/></div>
          <div className="field"><label>Sandi baru</label><PasswordInput autoComplete="new-password" required minLength={8} value={credentials.new_password} onChange={(event) => setCredentials({ ...credentials, new_password: event.target.value })}/><small className="field-note">Minimal 8 karakter.</small></div>
          <div className="field"><label>Ulangi sandi baru</label><PasswordInput autoComplete="new-password" required value={credentials.confirm_password} onChange={(event) => setCredentials({ ...credentials, confirm_password: event.target.value })}/></div>
        </div>
        <div className="form-actions"><button className="button primary" type="submit" disabled={!account}>Simpan kredensial</button></div>
      </form>
    </section>
  </>;
}

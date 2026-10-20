"use client";

import { useEffect, useState } from "react";

export default function StudentSettingsPage() {
  const [profile, setProfile] = useState(null);
  useEffect(() => { fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()).then((value) => setProfile(value.student || null)).catch(() => {}); }, []);
  return <>
    <div className="page-heading"><div><span className="eyebrow">AKUN SISWA</span><h1>Pengaturan</h1><p>Informasi akun ujian yang sedang digunakan.</p></div></div>
    <section className="form-card student-settings-card">
      <div className="student-settings-card-heading"><span className="student-settings-avatar">{profile?.student_name?.slice(0, 1)?.toUpperCase() || "S"}</span><div><h2>Informasi akun</h2><p>Detail akun yang terhubung ke sesi ujian ini.</p></div></div>
      <dl className="student-settings-grid">
        <div><dt>Nama</dt><dd>{profile?.student_name || "Memuat…"}</dd></div>
        <div><dt>Kelas</dt><dd>{profile?.class_name || "—"}</dd></div>
        <div><dt>Ujian</dt><dd>{profile?.exam_title || "—"}</dd></div>
        <div><dt>Mata pelajaran</dt><dd>{profile?.subject || "—"}</dd></div>
      </dl>
      <p className="student-settings-note">ID dan sandi diberikan oleh guru untuk ujian ini. Jika perlu akses baru, hubungi guru.</p>
    </section>
  </>;
}

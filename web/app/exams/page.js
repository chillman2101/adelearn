"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { examsApi } from "../../lib/api";
const dt = (v) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(v));
export default function ExamsPage() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    examsApi
      .list()
      .then(setItems)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PENGELOLAAN KELAS 8A</span>
          <h1>Manajemen ujian</h1>
          <p>Siapkan jadwal, susun soal, dan terbitkan ujian untuk kelas.</p>
        </div>
        <Link href="/exams/new" className="button primary">
          <span>＋</span> Buat ujian
        </Link>
      </div>
      {error && (
        <div className="notice">
          {error} Pastikan API Go dan PostgreSQL aktif.
        </div>
      )}
      <div className="toolbar">
        <span className="eyebrow">{items.length} UJIAN</span>
        <span className="field-note">
          Draf dapat diubah; ujian terbit menyimpan snapshot tetap.
        </span>
      </div>
      <div className="exam-list">
        {items.length ? (
          items.map((e) => (
            <Link className="exam-card" href={`/exams/${e.id}`} key={e.id}>
              <span
                className={`quick-icon ${e.status === "published" ? "mint" : "peach"}`}
              >
                {e.status === "published" ? "▤" : "✎"}
              </span>
              <div className="exam-card-main">
                <h3>{e.title}</h3>
                <p>
                  {e.subject || "Mata pelajaran belum diisi"} · {e.class} ·{" "}
                  {e.question_count} soal ·{" "}
                  {e.timer_enabled
                    ? `${e.duration_minutes} menit`
                    : "Tanpa timer"}
                </p>
              </div>
              <div className="exam-meta">
                <span className={`status-pill ${e.status}`}>
                  {e.status === "published" ? "Terbit" : "Draf"}
                </span>
                <span className="field-note">{dt(e.starts_at)}</span>
              </div>
              <b style={{ color: "#a1aabd" }}>→</b>
            </Link>
          ))
        ) : (
          <section className="panel empty-state">
            <div className="empty-illustration">▤</div>
            <strong>
              {error ? "Belum dapat memuat daftar" : "Belum ada ujian dibuat"}
            </strong>
            <span>Mulai dengan mengatur jadwal dan jumlah soal.</span>
            <Link href="/exams/new" className="text-link">
              Buat ujian pertama →
            </Link>
          </section>
        )}
      </div>
    </>
  );
}

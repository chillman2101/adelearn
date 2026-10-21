"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { examsApi, questionsApi } from "../lib/api";

const date = (value) =>
  value
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "—";
export default function Home() {
  const [exams, setExams] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([examsApi.list(), questionsApi.list()])
      .then(([e, q]) => {
        setExams(e);
        setQuestions(q);
      })
      .catch(() =>
        setError(
          "API belum terhubung. Jalankan PostgreSQL dan server Go untuk melihat data.",
        ),
      );
  }, []);
  const upcoming = exams.filter((e) => e.status === "published").slice(0, 3);
  return (
    <>
      <div className="welcome-row">
        <div>
          <div className="eyebrow blue">
            RUANG KERJA GURU
          </div>
          <h1>
            Ruang kelasmu, <em>siap dimulai.</em>
          </h1>
          <p className="lead">
            Atur soal dan persiapkan ujian kelas 8A dari satu tempat.
          </p>
        </div>
        <Link className="button primary" href="/exams/new">
          <span>＋</span> Buat ujian baru
        </Link>
      </div>
      {error && <div className="notice">◌ {error}</div>}
      <section className="metric-grid">
        <article className="metric-card">
          <div className="metric-top">
            <span>Total bank soal</span>
            <span className="metric-icon violet">◈</span>
          </div>
          <strong>{questions.length.toString().padStart(2, "0")}</strong>
          <small>tersedia untuk kelas 8A</small>
          <div className="metric-underline violet-line" />
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Ujian aktif</span>
            <span className="metric-icon green">◷</span>
          </div>
          <strong>
            {exams
              .filter((e) => e.status === "published")
              .length.toString()
              .padStart(2, "0")}
          </strong>
          <small>siap dikerjakan siswa</small>
          <div className="metric-underline green-line" />
        </article>
        <article className="metric-card">
          <div className="metric-top">
            <span>Ujian mendatang</span>
            <span className="metric-icon orange">↗</span>
          </div>
          <strong>{upcoming.length.toString().padStart(2, "0")}</strong>
          <small>terjadwal berikutnya</small>
          <div className="metric-underline orange-line" />
        </article>
      </section>
      <div className="dashboard-grid">
        <section className="panel schedule-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">JADWAL KELAS 8A</span>
              <h2>Ujian mendatang</h2>
            </div>
            <Link href="/exams" className="text-link">
              Semua ujian <span>↗</span>
            </Link>
          </div>
          {upcoming.length ? (
            <div className="schedule-list">
              {upcoming.map((exam, i) => (
                <div className="schedule-item" key={exam.id}>
                  <div className={`date-tile date-${i}`}>
                    <strong>{new Date(exam.starts_at).getDate()}</strong>
                    <small>
                      {new Intl.DateTimeFormat("id-ID", {
                        month: "short",
                      }).format(new Date(exam.starts_at))}
                    </small>
                  </div>
                  <div className="schedule-info">
                    <strong>{exam.title}</strong>
                    <span>
                      {exam.subject || "Mata pelajaran"} · {exam.question_count}{" "}
                      soal
                    </span>
                  </div>
                  <span className="schedule-time">
                    {date(exam.starts_at).split(", ")[1]}
                  </span>
                  <span className="status-pill published">Terbit</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-illustration">▤</div>
              <strong>Belum ada jadwal ujian</strong>
              <span>Ujian yang sudah diterbitkan akan muncul di sini.</span>
              <Link href="/exams/new" className="text-link">
                Mulai buat ujian <span>→</span>
              </Link>
            </div>
          )}
        </section>
        <section className="panel quick-panel">
          <div className="panel-heading">
            <div>
              <span className="eyebrow">MULAI CEPAT</span>
              <h2>Yang ingin dilakukan?</h2>
            </div>
            <span className="sparkle">✳</span>
          </div>
          <Link href="/questions/new" className="quick-action">
            <span className="quick-icon lilac">✎</span>
            <span>
              <strong>Tulis soal baru</strong>
              <small>Tambahkan ke bank soal</small>
            </span>
            <b>→</b>
          </Link>
          <Link href="/questions" className="quick-action">
            <span className="quick-icon mint">◈</span>
            <span>
              <strong>Jelajahi bank soal</strong>
              <small>Temukan soal sesuai topik</small>
            </span>
            <b>→</b>
          </Link>
          <Link href="/exams" className="quick-action">
            <span className="quick-icon peach">▤</span>
            <span>
              <strong>Kelola ujian</strong>
              <small>Atur jadwal dan soal ujian</small>
            </span>
            <b>→</b>
          </Link>
          <div className="tip-card">
            <span>✦</span>
            <p>
              <strong>Tips kecil untuk hari ini</strong>
              <br />
              Soal dengan bobot yang jelas membantu penilaian lebih konsisten.
            </p>
          </div>
        </section>
      </div>
      <footer className="page-footer">
        <span>
          adelearn <b>·</b> Ruang kerja guru
        </span>
        <span>
          Dirancang untuk belajar, satu langkah setiap hari <b>✳</b>
        </span>
      </footer>
    </>
  );
}

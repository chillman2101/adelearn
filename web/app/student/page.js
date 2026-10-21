"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { studentApi } from "../../lib/api";
import { useToast } from "../../components/ToastProvider";

const dateTime = (value) => new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" }).format(new Date(value));
const durationBetween = (start, end) => {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes} menit ${remaining} detik` : `${remaining} detik`;
};

export default function StudentExamPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [exam, setExam] = useState(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const refreshExam = useCallback(() => {
    return studentApi.exam().then((latestExam) => {
      setExam(latestExam);
      setError("");
      return latestExam;
    }).catch((failure) => {
      setError(failure.message);
      throw failure;
    });
  }, []);
  useEffect(() => {
    refreshExam().catch(() => {});
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshExam().catch(() => {});
    };
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("pageshow", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      window.removeEventListener("pageshow", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshExam]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer); }, []);
  const activeAttempt = exam?.attempts?.find((item) => item.status === "in_progress");
  const available = exam && exam.status === "published" && now >= new Date(exam.starts_at).getTime() && now <= new Date(exam.checkin_ends_at).getTime() && exam.attempts_left > 0;
  const unavailableMessage = exam && (exam.attempts_left <= 0 ? "Kesempatan mengerjakan ujian sudah habis." : exam.status !== "published" ? "Ujian belum diaktifkan oleh guru." : now < new Date(exam.starts_at).getTime() ? `Ujian baru dapat dimulai ${dateTime(exam.starts_at)}.` : now > new Date(exam.checkin_ends_at).getTime() ? "Batas waktu untuk mulai ujian sudah lewat." : "Ujian belum dapat dimulai saat ini.");
  async function requestStart() {
    setBusy(true);
    try {
      const latestExam = await refreshExam();
      const latestActiveAttempt = latestExam.attempts?.find((item) => item.status === "in_progress");
      if (latestActiveAttempt) {
        router.push(`/student/attempt/${latestActiveAttempt.id}`);
        return;
      }
      const currentTime = Date.now();
      let reason = "";
      if (latestExam.attempts_left <= 0) reason = "Kesempatan mengerjakan ujian sudah habis.";
      else if (latestExam.status !== "published") reason = "Ujian belum diaktifkan oleh guru.";
      else if (currentTime < new Date(latestExam.starts_at).getTime()) reason = `Ujian baru dapat dimulai ${dateTime(latestExam.starts_at)}.`;
      else if (currentTime > new Date(latestExam.checkin_ends_at).getTime()) reason = "Batas waktu untuk mulai ujian sudah lewat.";
      if (reason) {
        showToast(reason, "error");
        return;
      }
      setConfirm(true);
    } catch (failure) {
      showToast(failure.message || "Informasi ujian belum dapat diperbarui. Coba lagi.", "error");
    } finally {
      setBusy(false);
    }
  }
  async function start() {
    setBusy(true); setError("");
    try { const attempt = await studentApi.startAttempt(); router.push(`/student/attempt/${attempt.id}`); }
    catch (failure) { showToast(failure.message || "Ujian belum dapat dimulai. Coba lagi sebentar.", "error"); setConfirm(false); }
    finally { setBusy(false); }
  }
  if (error && !exam) return <div className="notice error">{error}</div>;
  if (!exam) return <div className="notice">Memuat ujian…</div>;
  const status = exam.status !== "published" ? "Menunggu guru mengaktifkan ujian" : now < new Date(exam.starts_at).getTime() ? "Ujian belum dimulai" : now > new Date(exam.checkin_ends_at).getTime() ? "Batas mulai sudah lewat" : activeAttempt ? "Sedang dikerjakan" : exam.attempts_left ? "Siap dikerjakan" : "Kesempatan sudah digunakan";
  return <>
    <div className="page-heading"><div><span className="eyebrow">UJIAN SAYA</span><h1>Ujian</h1><p>Informasi dan pengerjaan ujian yang terhubung dengan ID login ini.</p></div><Link className="button secondary" href="/student/settings">Pengaturan</Link></div>
    <section className="form-card student-exam-card">
      <div className="student-exam-card-head"><div><span className={`status-pill ${exam.status === "published" ? "published" : "draft"}`}>{status}</span><h2>{exam.title}</h2><p>{exam.subject} · {exam.class_name}</p></div><span className="student-exam-points">{exam.question_count} soal<strong>{Number(exam.total_points || 0).toFixed(1)} poin</strong></span></div>
      <div className="student-exam-details"><div><small>Mulai</small><strong>{dateTime(exam.starts_at)}</strong></div><div><small>Batas mulai</small><strong>{dateTime(exam.checkin_ends_at)}</strong></div><div><small>Waktu pengerjaan</small><strong>{exam.timer_enabled ? `${exam.duration_minutes} menit` : "Tanpa timer"}</strong></div><div><small>Sisa kesempatan</small><strong>{exam.attempts_left}</strong></div></div>
      {error && <div className="notice error">{error}</div>}
      <div className="student-exam-actions"><button className="button primary" disabled={busy} onClick={requestStart}>{activeAttempt ? "Lanjutkan ujian" : "Mulai ujian"}</button>{!available && !activeAttempt && <small className="field-note">{unavailableMessage}</small>}</div>
    </section>
    {exam.attempts?.length > 0 && <section className="form-card student-attempt-history"><h2>Riwayat percobaan</h2>{exam.attempts.map((attempt) => <div className="student-attempt-history-row" key={attempt.id}><span>Percobaan {attempt.attempt_number}<small>Mulai {dateTime(attempt.started_at)}</small>{attempt.submitted_at && <small>Selesai {dateTime(attempt.submitted_at)}</small>}</span><span>{attempt.status === "expired" ? "Waktu habis" : attempt.status === "submitted" ? attempt.pending_manual_grading ? "Menunggu penilaian esai" : "Selesai" : "Berlangsung"}{attempt.submitted_at && <small>Durasi {durationBetween(attempt.started_at, attempt.submitted_at)}</small>}</span>{attempt.score_points != null && <strong>{Number(attempt.score_points).toFixed(1)} poin</strong>}</div>)}</section>}
    {confirm && <div className="confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setConfirm(false)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="student-start-title" aria-describedby="student-start-description"><span className="eyebrow">SEBELUM MEMULAI</span><h2 id="student-start-title">Mulai mengerjakan ujian?</h2><p id="student-start-description">Percobaan yang sudah dimulai tidak dapat dibatalkan. Waktu akan terus berjalan dan jawaban tersimpan otomatis. Jika halaman tertutup, kamu dapat masuk kembali untuk melanjutkan selama sesi dan waktu ujian masih aktif.</p><div className="confirm-dialog-actions"><button className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>Belum</button><button className="button primary" disabled={busy} onClick={start}>{busy ? "Menyiapkan…" : "Ya, mulai ujian"}</button></div></section></div>}
  </>;
}

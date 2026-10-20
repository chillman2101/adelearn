"use client";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useToast } from "../../../components/ToastProvider";
import { examsApi } from "../../../lib/api";
const date = (v) =>
  new Intl.DateTimeFormat("id-ID", {
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(v));
const localDateTimeValue = (value) => {
  const parsed = new Date(value);
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
function ExamDetailContent() {
  const { id } = useParams();
  const { showToast } = useToast();
  const [exam, setExam] = useState(null);
  const [studentResults, setStudentResults] = useState(null);
  const [resultsLoading, setResultsLoading] = useState(true);
  const [resultsError, setResultsError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [studentAccess, setStudentAccess] = useState(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessBusy, setAccessBusy] = useState(false);
  const [generatingStudentId, setGeneratingStudentId] = useState("");
  const [accessError, setAccessError] = useState("");
  const [accessConfirmation, setAccessConfirmation] = useState(null);
  const [scheduleDialog, setScheduleDialog] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ starts_at: "", checkin_ends_at: "" });
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    examsApi
      .get(id)
      .then(setExam)
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => {
    let active = true;
    examsApi.results(id).then((items) => { if (active) setStudentResults(items); }).catch((failure) => { if (active) setResultsError(failure.message); }).finally(() => { if (active) setResultsLoading(false); });
    return () => { active = false; };
  }, [id]);
  useEffect(() => {
    let active = true;
    examsApi.studentAccess(id).then((items) => {
      if (active) setStudentAccess(items);
    }).catch((e) => {
      if (active) setAccessError(e.message);
    }).finally(() => {
      if (active) setAccessLoading(false);
    });
    return () => { active = false; };
  }, [id]);
  async function publish() {
    setBusy(true);
    setError("");
    try {
      setExam(await examsApi.publish(id));
      setConfirm(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function requestPublish() {
    if (exam.status === "published") {
      showToast("Ujian sudah diterbitkan dan statusnya tidak bisa dinonaktifkan.", "error");
      return;
    }
    if (!canActivate) {
      const remaining = Math.max(0, Number(exam.question_count) - (exam.questions?.length || 0));
      showToast(`Lengkapi ${remaining} soal lagi sebelum mengaktifkan ujian.`, "error");
      return;
    }
    setConfirm(true);
  }
  function openScheduleEditor() {
    setScheduleForm({ starts_at: localDateTimeValue(exam.starts_at), checkin_ends_at: localDateTimeValue(exam.checkin_ends_at) });
    setScheduleDialog(true);
  }
  async function saveSchedule(event) {
    event.preventDefault();
    const startsAt = new Date(scheduleForm.starts_at);
    const checkinEndsAt = new Date(scheduleForm.checkin_ends_at);
    if (!scheduleForm.starts_at || !scheduleForm.checkin_ends_at || checkinEndsAt <= startsAt) {
      showToast("Batas mulai harus setelah waktu mulai ujian.", "error");
      return;
    }
    setScheduleSaving(true);
    try {
      setExam(await examsApi.updateSchedule(id, { starts_at: startsAt.toISOString(), checkin_ends_at: checkinEndsAt.toISOString() }));
      setScheduleDialog(false);
      showToast("Jadwal ujian berhasil diperbarui.");
    } catch (failure) {
      showToast(failure.message || "Jadwal ujian gagal diperbarui.", "error");
    } finally {
      setScheduleSaving(false);
    }
  }
  async function generateStudentAccess() {
    setAccessBusy(true);
    setAccessError("");
    try {
      setStudentAccess(await examsApi.generateStudentAccess(id));
    } catch (e) {
      setAccessError(e.message || "Akses siswa gagal dibuat.");
    } finally {
      setAccessBusy(false);
    }
  }
  async function generateAccessForStudent(access) {
    setGeneratingStudentId(access.student_id);
    setAccessError("");
    try {
      const updated = await examsApi.generateStudentAccessForStudent(id, access.student_id);
      setStudentAccess((items) => items.map((item) => item.student_id === updated.student_id ? updated : item));
      showToast(access.user_id ? `Akses ${access.student_name} diperbarui.` : `Akses ${access.student_name} dibuat.`);
    } catch (e) {
      showToast(e.message || `Akses ${access.student_name} gagal dibuat.`, "error");
    } finally {
      setGeneratingStudentId("");
    }
  }
  function requestGenerateAll() {
    setAccessConfirmation({ scope: "all", replacesExisting: Boolean(studentAccess?.some((access) => access.user_id)) });
  }
  function requestGenerateStudent(access) {
    setAccessConfirmation({ scope: "student", access, replacesExisting: Boolean(access.user_id) });
  }
  async function confirmAccessGeneration() {
    const confirmation = accessConfirmation;
    setAccessConfirmation(null);
    if (confirmation?.scope === "all") await generateStudentAccess();
    else if (confirmation?.scope === "student") await generateAccessForStudent(confirmation.access);
  }
  const credentialsReady = Boolean(studentAccess?.length) && studentAccess.every((access) => access.password);
  async function copyStudentAccess(access) {
    try {
      await navigator.clipboard.writeText([access.student_name, access.user_id, access.password].join("\t"));
      showToast(`Akses ${access.student_name} berhasil disalin.`);
    } catch {
      showToast("Clipboard tidak tersedia di browser ini.", "error");
    }
  }
  async function copyAllStudentAccess() {
    const rows = [
      ["Nama siswa", "ID pengguna", "Kata sandi"],
      ...studentAccess.map((access) => [access.student_name, access.user_id, access.password]),
    ];
    try {
      await navigator.clipboard.writeText(rows.map((row) => row.join("\t")).join("\n"));
      showToast("Daftar akses berhasil disalin.");
    } catch {
      showToast("Clipboard tidak tersedia di browser ini.", "error");
    }
  }
  async function exportStudentAccess() {
    try {
      const XLSX = await import("xlsx");
      const rows = studentAccess.map((access) => ({
        "Nama siswa": access.student_name,
        "ID pengguna": access.user_id,
        "Kata sandi": access.password,
      }));
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Akses ujian");
      XLSX.writeFile(workbook, `akses-siswa-${exam.title.replace(/[^a-z0-9-_]+/gi, "-")}.xlsx`);
      showToast("File Excel berhasil diunduh.");
    } catch {
      showToast("File Excel gagal dibuat. Coba lagi.", "error");
    }
  }
  if (!exam)
    return (
      <>
        <Link href="/exams" className="text-link">
          ← Kembali ke daftar ujian
        </Link>
        <div className="notice" style={{ marginTop: 16 }}>
          {error || "Memuat detail ujian…"}
        </div>
      </>
    );
  const read = (item) => {
    if (item.question) return item.question;
    if (item.snapshot && typeof item.snapshot === "object") return item.snapshot;
    if (item.snapshot) {
      try {
        return JSON.parse(item.snapshot);
      } catch {
        return null;
      }
    }
    return null;
  };
  const canActivate = (exam.questions?.length || 0) === Number(exam.question_count);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            UJIAN · {exam.status === "published" ? "TERBIT" : "DRAF"}
          </span>
          <h1>{exam.title}</h1>
          <p>
            {exam.subject} · {exam.class} · Dibuat {date(exam.created_at)}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/exams" className="button secondary">
            ← Daftar ujian
          </Link>
          {exam.status === "draft" && (
            <Link className="button secondary" href={`/exams/${exam.id}/edit`}>Ubah draf</Link>
          )}
          <button type="button" className="button secondary" onClick={openScheduleEditor}>Ubah jadwal</button>
          <div className="exam-publish-control">
            <span>
              <strong>{exam.status === "published" ? "Ujian aktif" : "Aktifkan ujian"}</strong>
              {exam.status === "draft" && !canActivate && <small>Lengkapi {exam.question_count} soal untuk mengaktifkan.</small>}
            </span>
            <button
              type="button"
              className={`publish-switch ${exam.status === "published" ? "on" : ""}`}
              role="switch"
              aria-checked={exam.status === "published"}
              aria-label={exam.status === "published" ? "Ujian aktif dan terkunci" : "Aktifkan ujian"}
              onClick={requestPublish}
            ><span /></button>
          </div>
        </div>
      </div>
      {error && !confirm && <div className="notice error">{error}</div>}
      {confirm && (
        <div className="confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setConfirm(false)}>
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="publish-title" aria-describedby="publish-description">
            <span className="eyebrow">KONFIRMASI AKTIVASI</span>
            <h2 id="publish-title">Aktifkan ujian ini?</h2>
            <p id="publish-description">Setelah diaktifkan, jadwal, pengaturan, soal, dan kunci jawaban akan dikunci dan tidak bisa diubah lagi. Pastikan semua sudah benar.</p>
            {error && <div className="notice error">{error}</div>}
            <div className="confirm-dialog-actions">
              <button type="button" className="button secondary" disabled={busy} onClick={() => setConfirm(false)}>Periksa lagi</button>
              <button type="button" className="button primary" disabled={busy} onClick={publish}>{busy ? "Mengaktifkan…" : "Ya, aktifkan ujian"}</button>
            </div>
          </section>
        </div>
      )}
      {accessConfirmation && (
        <div className="confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !accessBusy && !generatingStudentId && setAccessConfirmation(null)}>
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="access-generate-title" aria-describedby="access-generate-description">
            <span className="eyebrow">KONFIRMASI AKSES SISWA</span>
            <h2 id="access-generate-title">{accessConfirmation.scope === "all" ? accessConfirmation.replacesExisting ? "Generate ulang akses semua siswa?" : "Generate akses semua siswa?" : accessConfirmation.replacesExisting ? `Generate ulang akses ${accessConfirmation.access.student_name}?` : `Generate akses ${accessConfirmation.access.student_name}?`}</h2>
            <p id="access-generate-description">{accessConfirmation.scope === "all" ? accessConfirmation.replacesExisting ? "ID dan sandi lama seluruh siswa akan langsung tidak berlaku. Semua siswa perlu menggunakan akses baru. Progres ujian dan jawaban yang sudah tersimpan tetap dipertahankan." : "ID dan sandi baru akan dibuat untuk semua siswa aktif di kelas ujian ini." : accessConfirmation.replacesExisting ? `ID dan sandi lama ${accessConfirmation.access.student_name} akan tidak berlaku. Akses siswa lain tidak berubah. Progres dan jawaban siswa ini tetap dipertahankan.` : `ID dan sandi baru akan dibuat untuk ${accessConfirmation.access.student_name}. Akses siswa lain tidak berubah.`}</p>
            <div className="confirm-dialog-actions">
              <button type="button" className="button secondary" onClick={() => setAccessConfirmation(null)}>Batal</button>
              <button type="button" className="button primary" onClick={confirmAccessGeneration}>{accessConfirmation.replacesExisting ? "Ya, generate ulang" : "Ya, generate akses"}</button>
            </div>
          </section>
        </div>
      )}
      {scheduleDialog && (
        <div className="confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !scheduleSaving && setScheduleDialog(false)}>
          <section className="confirm-dialog schedule-dialog" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
            <span className="eyebrow">JADWAL UJIAN</span>
            <h2 id="schedule-title">Ubah tanggal dan waktu</h2>
            <p>Perubahan ini hanya mengatur kapan siswa dapat mulai ujian. Soal dan pengaturan lainnya tetap sama.</p>
            <form onSubmit={saveSchedule}>
              <div className="schedule-edit-grid">
                <label className="field"><span>Mulai ujian</span><input className="input" type="datetime-local" required value={scheduleForm.starts_at} onChange={(event) => setScheduleForm((value) => ({ ...value, starts_at: event.target.value }))}/></label>
                <label className="field"><span>Batas mulai</span><input className="input" type="datetime-local" required value={scheduleForm.checkin_ends_at} onChange={(event) => setScheduleForm((value) => ({ ...value, checkin_ends_at: event.target.value }))}/></label>
              </div>
              <div className="confirm-dialog-actions">
                <button type="button" className="button secondary" disabled={scheduleSaving} onClick={() => setScheduleDialog(false)}>Batal</button>
                <button type="submit" className="button primary" disabled={scheduleSaving}>{scheduleSaving ? "Menyimpan…" : "Simpan jadwal"}</button>
              </div>
            </form>
          </section>
        </div>
      )}
      <div className="form-layout">
        <div>
          <section className="form-card">
            <h2>Rincian ujian</h2>
            <div className="settings-grid" style={{ marginTop: 15 }}>
              <div className="preview-paper">
                <span className="preview-label">WAKTU MULAI</span>
                <p>{date(exam.starts_at)}</p>
              </div>
              <div className="preview-paper">
                <span className="preview-label">BATAS CHECK-IN</span>
                <p>{date(exam.checkin_ends_at)}</p>
              </div>
              <div className="preview-paper">
                <span className="preview-label">DURASI</span>
                <p>
                  {exam.timer_enabled
                    ? `${exam.duration_minutes} menit sejak check-in`
                    : "Tanpa timer"}
                </p>
              </div>
              <div className="preview-paper">
                <span className="preview-label">PENGULANGAN</span>
                <p>
                  {exam.repeat_count} kali ·{" "}
                  {
                    {
                      highest: "Nilai tertinggi",
                      latest: "Percobaan terakhir",
                      average: "Rata-rata",
                    }[exam.score_policy]
                  }
                </p>
              </div>
            </div>
          </section>
          <section className="form-card">
            <div className="student-access-heading">
              <div>
                <span className="eyebrow">AKSES SISWA</span>
                <h2>Login ujian</h2>
                <p>Generate ID pengguna dan sandi untuk semua siswa aktif di {exam.class || "kelas ujian"}.</p>
              </div>
              <div className="student-access-actions">
                <button type="button" className="button secondary" onClick={copyAllStudentAccess} disabled={!credentialsReady}>Salin daftar</button>
                <button type="button" className="button secondary" onClick={exportStudentAccess} disabled={!credentialsReady}>Ekspor Excel</button>
                <button type="button" className="button primary" onClick={requestGenerateAll} disabled={accessBusy || accessLoading || Boolean(accessError) || !exam.class_id}>
                  {accessBusy ? "Membuat akses…" : studentAccess?.some((access) => access.user_id) ? "Generate ulang semua" : "Generate akses siswa"}
                </button>
              </div>
            </div>
            <p className="field-note student-access-note">
              {studentAccess?.some((access) => access.password)
                ? "Generate ulang per siswa hanya mengubah akses siswa tersebut. Generate ulang semua akan merotasi akses seluruh siswa."
                : "Buat akses untuk semua siswa sekaligus atau generate per siswa dari baris masing-masing."}
            </p>
            {!exam.class_id && <p className="field-note">Ujian ini belum memiliki relasi kelas. Atur kelas ujian terlebih dahulu.</p>}
            {accessError && <div className="notice error">{accessError}</div>}
            {accessLoading ? <p className="field-note">Memuat akses siswa…</p> : studentAccess?.length ? (
              <div className="table-wrap student-access-table-wrap">
                <table className="data-table student-access-table">
                  <thead><tr><th>Nama siswa</th><th>ID pengguna</th><th>Kata sandi</th><th>Aksi</th></tr></thead>
                  <tbody>{studentAccess.map((access) => <tr key={access.student_id}>
                    <td><strong>{access.student_name}</strong></td>
                    <td><code>{access.user_id || "Belum dibuat"}</code></td>
                    <td><code>{access.password || (access.user_id ? "Tersedia saat generate" : "—")}</code></td>
                    <td className="student-access-row-actions"><button type="button" className="student-access-copy" onClick={() => copyStudentAccess(access)} disabled={!access.password} title={`Salin akses ${access.student_name}`} aria-label={`Salin nama, ID, dan sandi ${access.student_name}`}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" stroke="currentColor" strokeWidth="1.7"/></svg>
                    </button><button type="button" className="student-access-copy student-access-generate" onClick={() => requestGenerateStudent(access)} disabled={accessBusy || Boolean(generatingStudentId)} title={`${access.user_id ? "Generate ulang" : "Generate"} akses ${access.student_name}`} aria-label={`${access.user_id ? "Generate ulang" : "Generate"} akses ${access.student_name}`}>
                      {generatingStudentId === access.student_id ? <span className="student-access-spinner" aria-hidden="true"/> : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </button></td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : !accessError && <p className="field-note">Belum ada akses yang dibuat untuk siswa di kelas ini.</p>}
          </section>
          <section className="form-card exam-results-card">
            <div className="student-access-heading">
              <div><span className="eyebrow">HASIL UJIAN</span><h2>Daftar siswa dan nilai</h2><p>Nilai akhir dihitung dengan kebijakan {({ highest: "tertinggi", latest: "terbaru", average: "rata-rata" })[exam.score_policy] || exam.score_policy}.</p></div>
            </div>
            {resultsError && <div className="notice error">{resultsError}</div>}
            {resultsLoading ? <p className="field-note">Memuat hasil siswa…</p> : studentResults?.length ? (
              <div className="table-wrap exam-results-table-wrap">
                <table className="data-table exam-results-table">
                  <thead><tr><th>Nama siswa</th><th>Status</th><th>Percobaan</th><th>Nilai akhir</th></tr></thead>
                  <tbody>{studentResults.map((student) => <tr key={student.student_id}>
                    <td><strong>{student.student_name}</strong></td>
                    <td><span className={`exam-result-status${student.status === "Selesai" ? " is-complete" : student.status === "Sedang mengerjakan" ? " is-active" : student.pending_manual_grading ? " is-pending" : ""}`}>{student.status}</span></td>
                    <td>{student.completed_attempts} selesai · {student.attempts} total</td>
                    <td>{student.score_points != null ? <><strong>{Number(student.score_points).toFixed(1)} / {Number(student.max_points).toFixed(1)} poin</strong>{student.score_percent != null && <small className="exam-result-percent">{Number(student.score_percent).toFixed(1)}%</small>}</> : student.pending_manual_grading ? "Menunggu penilaian esai" : "—"}</td>
                  </tr>)}</tbody>
                </table>
              </div>
            ) : !resultsError && <div className="empty-state exam-results-empty"><strong>Belum ada siswa di kelas ujian</strong><span>Tambahkan siswa ke kelas ini untuk melihat nilai mereka.</span></div>}
          </section>
          <section className="form-card">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">KOMPOSISI</span>
                <h2>Soal ujian</h2>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="type-badge">
                  {exam.questions?.length || 0} soal ·{" "}
                  {Number(exam.total_points || 0).toFixed(1)} poin
                </span>
                {exam.status === "draft" && <Link className="button primary" href={`/exams/${exam.id}/edit?step=questions`}>＋ Tambah soal</Link>}
              </div>
            </div>
            {exam.questions?.length ? (
              exam.questions.map((item, i) => {
                const q = read(item);
                return (
                  <div className="compose-question" key={item.id || i}>
                    <span>
                      <strong>{String(i + 1).padStart(2, "0")}</strong>　
                      {q?.prompt || "Konten soal tidak tersedia"}
                      <small>
                        {item.source_kind.replace("bank_", "Bank · ")} ·{" "}
                        {item.points} poin
                        {q?.type ? ` · ${q.type.replaceAll("_", " ")}` : ""}
                      </small>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="empty-state">
                <strong>Belum ada susunan soal</strong>
                <span>Pilih dan susun soal sebelum mengaktifkan ujian.</span>
                {exam.status === "draft" && <Link className="button primary" href={`/exams/${exam.id}/edit?step=questions`}>＋ Tambah soal</Link>}
              </div>
            )}
            {exam.status === "draft" && (
              <p className="field-note" style={{ marginTop: 15 }}>
        Draf dapat diubah sebelum diterbitkan.
              </p>
            )}
          </section>
        </div>
        <aside className="form-card question-preview">
          <span className="eyebrow">NILAI</span>
          <h2 style={{ marginTop: 7 }}>
            {Number(exam.total_points || 0).toFixed(1)}{" "}
            <span className="field-note">poin maksimal</span>
          </h2>
          <div className="preview-paper">
            <span className="preview-label">KONVERSI NILAI</span>
            <p>
              poin diperoleh ÷ {Number(exam.total_points || 0).toFixed(1)} × 100
            </p>
            <small className="field-note">
              Jawaban salah tidak mengurangi poin pada pilihan ganda kompleks.
            </small>
          </div>
          <div className={`status-pill ${exam.status}`}>
            {exam.status === "published"
              ? "Terbit · snapshot terkunci"
              : "Draf · belum terlihat siswa"}
          </div>
        </aside>
      </div>
    </>
  );
}

export default function ExamDetailPage() {
  return <Suspense fallback={<div className="notice">Memuat detail ujian…</div>}><ExamDetailContent /></Suspense>;
}

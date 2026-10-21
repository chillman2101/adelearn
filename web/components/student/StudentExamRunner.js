"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { studentApi } from "../../lib/api";
import AppCheckbox from "../AppCheckbox";

function questionTitle(question, index) { return `Soal ${index + 1}`; }
function formatDuration(start, end) {
  if (!start || !end) return "—";
  const seconds = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes ? `${minutes} menit ${seconds % 60} detik` : `${seconds} detik`;
}
function formatDateTime(value) {
  return value ? new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short" }).format(new Date(value)) : "—";
}
function parseAnswer(raw, type) {
  if (raw) { try { return JSON.parse(raw); } catch { return raw; } }
  if (type === "multi_select") return { selected: [] };
  if (type === "true_false") return {};
  if (type === "short_answer" || type === "essay") return { text: "" };
  if (type === "fill_blank") return { blanks: {} };
  if (type === "matching") return { pairs: {} };
  if (type === "ordering") return { order: [] };
  return "";
}

function QuestionInput({ question, answer, onChange }) {
  const data = question.data || {};
  if (question.type === "single_choice") return <div className="student-answer-options">{(data.options || []).map((option) => <label className={`student-answer-option${answer === option.id ? " selected" : ""}`} key={option.id}><input type="radio" name={`question-${question.id}`} checked={answer === option.id} onChange={() => onChange(option.id)}/><span>{option.text}{option.media?.url && <img className="student-question-image" src={option.media.url} alt="Gambar pilihan"/>}</span></label>)}</div>;
  if (question.type === "multi_select") { const selected = answer.selected || []; return <div className="student-answer-options">{(data.options || []).map((option) => <label className={`student-answer-option${selected.includes(option.id) ? " selected" : ""}`} key={option.id}><AppCheckbox className="app-checkbox--answer" checked={selected.includes(option.id)} onChange={(event) => onChange({ selected: event.target.checked ? [...selected, option.id] : selected.filter((id) => id !== option.id) })}/><span>{option.text}{option.media?.url && <img className="student-question-image" src={option.media.url} alt="Gambar pilihan"/>}</span></label>)}</div>; }
  if (question.type === "true_false") return <div className="student-structured-answers">{(data.statements || []).map((statement) => <div className="student-structured-row" key={statement.id}><span>{statement.text}</span><div className="true-false-toggle"><button type="button" className={answer[statement.id] === true ? "selected" : ""} onClick={() => onChange({ ...answer, [statement.id]: true })}>Benar</button><button type="button" className={answer[statement.id] === false ? "selected" : ""} onClick={() => onChange({ ...answer, [statement.id]: false })}>Salah</button></div></div>)}</div>;
  if (question.type === "short_answer") return <input className="input student-text-answer" value={answer.text || ""} onChange={(event) => onChange({ text: event.target.value })} placeholder="Tulis jawaban singkat"/>;
  if (question.type === "fill_blank") return <div className="student-structured-answers">{(data.blanks || []).map((blank, index) => <label className="field" key={blank.id}><span>Isian {index + 1}</span><input className="input" value={answer.blanks?.[blank.id] || ""} onChange={(event) => onChange({ blanks: { ...answer.blanks, [blank.id]: event.target.value } })}/></label>)}</div>;
  if (question.type === "essay") return <textarea className="textarea student-essay-answer" rows="8" value={answer.text || ""} onChange={(event) => onChange({ text: event.target.value })} placeholder="Tulis jawabanmu di sini"/>;
  if (question.type === "matching") return <div className="student-structured-answers">{(data.pairs || []).map((pair) => <label className="student-structured-row" key={pair.id}><span>{pair.left}</span><select className="select" value={answer.pairs?.[pair.id] || ""} onChange={(event) => onChange({ pairs: { ...answer.pairs, [pair.id]: event.target.value } })}><option value="">Pilih pasangan</option>{(data.choices || []).map((choice) => <option value={choice.id} key={choice.id}>{choice.text}</option>)}</select></label>)}</div>;
  if (question.type === "ordering") { const allItems = data.items || []; const displayed = answer.order?.length ? answer.order.map((id) => allItems.find((item) => item.id === id)).filter(Boolean) : allItems; function move(index, direction) { const next = [...displayed]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange({ order: next.map((item) => item.id) }); } return <div className="student-order-list">{displayed.map((item, index) => <div className="student-order-item" key={item.id}><span>{index + 1}. {item.text}</span><div><button type="button" className="button secondary" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Naikkan ${item.text}`}>↑</button><button type="button" className="button secondary" disabled={index === displayed.length - 1} onClick={() => move(index, 1)} aria-label={`Turunkan ${item.text}`}>↓</button></div></div>)}</div>; }
  return <p className="field-note">Tipe soal ini belum dapat ditampilkan.</p>;
}

export default function StudentExamRunner({ attemptId }) {
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const timers = useRef(new Map());
  const latest = useRef(new Map());
  const submitting = useRef(false);
  useEffect(() => { studentApi.attempt(attemptId).then(setAttempt).catch((failure) => setError(failure.message)); }, [attemptId]);
  const questions = attempt?.questions || [];
  const current = questions[currentIndex];
  const answers = attempt?.answers || {};
  const answeredCount = questions.filter((question) => {
    const raw = answers[question.id]; if (!raw) return false;
    try { const parsed = JSON.parse(raw); return parsed !== "" && Object.keys(parsed || {}).length > 0; } catch { return Boolean(raw); }
  }).length;
  const maxPoints = useMemo(() => questions.reduce((sum, question) => sum + Number(question.points || 0), 0), [questions]);
  const scorePoints = Number(attempt?.score_points || 0);
  const scorePercent = maxPoints > 0 ? Math.round(Math.max(0, Math.min(100, scorePoints / maxPoints * 100))) : 0;

  const refreshClosedAttempt = useCallback(async (failure) => {
    if (failure.code !== "exam_unavailable") {
      setError(failure.message);
      return;
    }
    try {
      const latestAttempt = await studentApi.attempt(attemptId);
      setAttempt(latestAttempt);
      setError(latestAttempt.status === "in_progress" ? failure.message : "");
    } catch {
      setError(failure.message);
    }
  }, [attemptId]);

  const flushSave = useCallback(async (questionId) => {
    const answer = latest.current.get(questionId);
    if (answer === undefined) return;
    latest.current.delete(questionId);
    setSaving(true);
    try { await studentApi.saveAnswer(attemptId, questionId, answer); setSavedAt(new Date()); }
    catch (failure) { await refreshClosedAttempt(failure); }
    finally { setSaving(latest.current.size > 0); }
  }, [attemptId, refreshClosedAttempt]);

  const flushAll = useCallback(async () => {
    for (const timer of timers.current.values()) clearTimeout(timer);
    timers.current.clear();
    await Promise.all([...latest.current.keys()].map(flushSave));
  }, [flushSave]);

  const updateAnswer = (questionId, answer) => {
    latest.current.set(questionId, answer);
    setAttempt((previous) => ({ ...previous, answers: { ...previous.answers, [questionId]: JSON.stringify(answer) } }));
    setSaving(true);
    if (timers.current.has(questionId)) clearTimeout(timers.current.get(questionId));
    timers.current.set(questionId, setTimeout(() => { timers.current.delete(questionId); flushSave(questionId); }, 450));
  };

  useEffect(() => {
    if (!attempt?.expires_at || attempt.status !== "in_progress") return;
    const update = () => setSecondsLeft(Math.max(0, Math.ceil((new Date(attempt.expires_at).getTime() - Date.now()) / 1000)));
    update(); const timer = setInterval(update, 1000); return () => clearInterval(timer);
  }, [attempt?.expires_at, attempt?.status]);

  useEffect(() => {
    if (secondsLeft !== 0 || attempt?.status !== "in_progress" || submitting.current) return;
    submitting.current = true;
    flushAll().then(() => studentApi.submitAttempt(attemptId)).then(setAttempt).catch(refreshClosedAttempt).finally(() => { submitting.current = false; });
  }, [attempt?.status, attemptId, flushAll, refreshClosedAttempt, secondsLeft]);

  useEffect(() => () => { for (const timer of timers.current.values()) clearTimeout(timer); }, []);

  async function submit() {
    setConfirmSubmit(false); setError(""); setSaving(true);
    await flushAll();
    try { setAttempt(await studentApi.submitAttempt(attemptId)); }
    catch (failure) { await refreshClosedAttempt(failure); }
    finally { setSaving(false); }
  }

  if (error && !attempt) return <div className="notice error">{error}</div>;
  if (!attempt) return <div className="notice">Memuat percobaan…</div>;
  if (attempt.status !== "in_progress") return (
    <section className="form-card student-finished-card">
      <span className="eyebrow">PERCOBAAN SELESAI</span>
      <h1>{attempt.status === "expired" ? "Waktu ujian habis" : "Jawaban sudah dikirim"}</h1>
      <div className={`student-finished-score${attempt.pending_manual_grading ? " is-pending" : ""}`}>
        <div className="student-finished-score-heading">
          <span>{attempt.pending_manual_grading ? "Nilai sementara" : "Nilai akhir"}</span>
          <strong>{scorePoints.toFixed(1)} <small>/ {maxPoints.toFixed(1)} poin</small></strong>
        </div>
        {attempt.pending_manual_grading ? <p>Nilai esai masih menunggu penilaian guru.</p> : maxPoints > 0 && <div className="student-finished-score-progress">
          <div role="progressbar" aria-label="Persentase nilai" aria-valuemin="0" aria-valuemax="100" aria-valuenow={scorePercent}><span style={{ width: `${scorePercent}%` }}/></div>
          <strong>{scorePercent}%</strong>
        </div>}
      </div>
      <dl className="student-finished-meta">
        <div><dt>Mulai</dt><dd>{formatDateTime(attempt.started_at)}</dd></div>
        <div><dt>Selesai</dt><dd>{formatDateTime(attempt.submitted_at)}</dd></div>
        <div><dt>Waktu pengerjaan</dt><dd>{formatDuration(attempt.started_at, attempt.submitted_at)}</dd></div>
      </dl>
      <Link href="/student" className="button primary">Kembali ke ujian</Link>
    </section>
  );
  if (!current) return <div className="notice error">Soal ujian tidak tersedia.</div>;

  const rawAnswer = answers[current.id];
  const answer = parseAnswer(rawAnswer, current.type);
  const answered = Boolean(rawAnswer);
  const timeLabel = secondsLeft == null ? "" : `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;
  return <div className="student-runner">
    <header className="student-runner-header"><div><span className="eyebrow">PERCOBAAN {attempt.attempt_number}</span><h1>Mengerjakan ujian</h1><p>{answeredCount} dari {questions.length} soal terjawab</p></div><div className={`student-runner-save ${saving ? "is-saving" : ""}`} aria-live="polite">{saving ? "Menyimpan jawaban…" : savedAt ? `Tersimpan ${savedAt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}` : "Jawaban tersimpan otomatis"}{timeLabel && <strong className="student-timer">{timeLabel}</strong>}</div></header>
    {error && <div className="notice error">{error}</div>}
    <div className="student-runner-layout"><aside className="student-question-nav"><span>Daftar soal</span><div className="student-question-board" role="group" aria-label="Papan nomor soal">{questions.map((question, index) => <button type="button" key={question.id} className={`${index === currentIndex ? "active" : ""}${answers[question.id] ? " answered" : ""}`} onClick={async () => { await flushAll(); setCurrentIndex(index); }} aria-label={`${questionTitle(question, index)}${answers[question.id] ? ", terjawab" : ", belum dijawab"}`} aria-current={index === currentIndex ? "step" : undefined}>{String(index + 1).padStart(2, "0")}</button>)}</div><div className="student-question-legend"><span><i className="current"/>Aktif</span><span><i className="answered"/>Terjawab</span><span><i/>Belum</span></div></aside>
      <main className="form-card student-question-card"><div className="student-question-progress"><span>{questionTitle(current, currentIndex)}</span><span>{Number(current.points).toFixed(1)} poin</span></div><h2>{current.prompt}</h2>{current.data?.prompt_media?.url && <img className="student-question-image" src={current.data.prompt_media.url} alt="Gambar pada soal"/>}<QuestionInput key={current.id} question={current} answer={answer} onChange={(next) => updateAnswer(current.id, next)}/><div className="student-question-nav-actions"><button type="button" className="button secondary" disabled={currentIndex === 0} onClick={async () => { await flushAll(); setCurrentIndex((value) => Math.max(0, value - 1)); }}>Sebelumnya</button>{currentIndex < questions.length - 1 ? <button type="button" className="button primary" onClick={async () => { await flushAll(); setCurrentIndex((value) => Math.min(questions.length - 1, value + 1)); }}>Berikutnya</button> : <button type="button" className="button primary" onClick={() => setConfirmSubmit(true)}>Kirim jawaban</button>}</div></main>
    </div>
    {confirmSubmit && <div className="confirm-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setConfirmSubmit(false)}><section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="student-submit-title"><span className="eyebrow">KONFIRMASI AKHIR</span><h2 id="student-submit-title">Kirim jawaban sekarang?</h2><p>{answeredCount < questions.length ? `Masih ada ${questions.length - answeredCount} soal belum dijawab. ` : ""}Setelah dikirim, jawaban tidak dapat diubah.</p><div className="confirm-dialog-actions"><button className="button secondary" onClick={() => setConfirmSubmit(false)}>Periksa lagi</button><button className="button primary" onClick={submit}>Ya, kirim jawaban</button></div></section></div>}
  </div>;
}

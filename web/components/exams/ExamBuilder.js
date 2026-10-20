"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { examsApi, questionsApi, request } from "../../lib/api";
import CatalogSelect from "../CatalogSelect";
import { useAppSettings } from "../AppSettings";
import { useToast } from "../ToastProvider";
const TYPES = [
  ["single_choice", "Pilihan ganda"],
  ["multi_select", "PG kompleks"],
  ["true_false", "Benar/salah"],
  ["short_answer", "Jawaban singkat"],
  ["fill_blank", "Isian"],
  ["essay", "Esai"],
  ["matching", "Menjodohkan"],
  ["ordering", "Urutan"],
];
const inlineTemplates = {
  single_choice: { options: [{ id: "a", text: "", correct: true }, { id: "b", text: "", correct: false }] },
  multi_select: { options: [{ id: "a", text: "", correct: true }, { id: "b", text: "", correct: true }, { id: "c", text: "", correct: false }] },
  true_false: { statements: [{ id: "s1", text: "", correct: true }] },
  short_answer: { accepted_answers: [""] },
  fill_blank: { blanks: [{ id: "b1", accepted_answers: [""] }] },
  essay: { rubric: "", manual_grading: true },
  matching: { pairs: [{ id: "p1", left: "", right: "" }, { id: "p2", left: "", right: "" }] },
  ordering: { items: [{ id: "i1", text: "" }, { id: "i2", text: "" }] },
};
const cloneInlineData = (value) => JSON.parse(JSON.stringify(value));
const newInlineItemId = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const dtLocal = (d) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const later = (hours) => {
  const d = new Date(Date.now() + hours * 3600000);
  d.setSeconds(0, 0);
  return dtLocal(d);
};
export default function ExamBuilder({ initialId, initialStep = "settings" }) {
  const { settings } = useAppSettings();
  const { showToast } = useToast();
  const [form, setForm] = useState({
    title: "",
    subject_id: "",
    subject: "",
    class_id: "",
    class: "",
    starts_at: "",
    checkin_ends_at: "",
    timer_enabled: true,
    duration_minutes: 60,
    repeat_count: 0,
    score_policy: "highest",
    question_count: 10,
  });
  const [bank, setBank] = useState([]);
  const [filters, setFilters] = useState({});
  const [selected, setSelected] = useState([]);
  const [randomCount, setRandomCount] = useState(0);
  const [randomDraftCount, setRandomDraftCount] = useState(0);
  const [inline, setInline] = useState([]);
  const [savingInline, setSavingInline] = useState(false);
  const [draft, setDraft] = useState(null);
  const [compositionSaved, setCompositionSaved] = useState("saved");
  const [compositionReady, setCompositionReady] = useState(!initialId);
  const lastCompositionRef = useRef("");
  const autoSaveSequenceRef = useRef(0);
  const autoSaveQueueRef = useRef(Promise.resolve());
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(initialStep);
  const [tab, setTab] = useState("manual");
  const [inlineForm, setInlineForm] = useState({
    type: "single_choice",
    prompt: "",
    points: 1,
    data: cloneInlineData(inlineTemplates.single_choice),
  });
  const [draggedInlineOption, setDraggedInlineOption] = useState(null);
  useEffect(() => {
    if (initialId) return;
    setForm((current) => ({
      ...current,
      class_id: current.class_id || settings.activeClassId || "",
      class: current.class || settings.activeClass || "",
      starts_at: current.starts_at || later(48),
      checkin_ends_at: current.checkin_ends_at || later(50),
    }));
  }, [initialId, settings.activeClass, settings.activeClassId]);
  useEffect(() => {
    questionsApi
      .list({ ...filters, ...(form.subject_id ? { subject_id: form.subject_id } : {}) })
      .then(setBank)
      .catch(() => showToast("API belum terhubung. Bank soal belum dapat dimuat.", "error"));
  }, [filters, form.subject_id, showToast]);
  const usedCount = selected.length + inline.length + Number(randomCount || 0);
  const totalPoints =
    selected.reduce((n, q) => n + Number(q.points), 0) +
    inline.reduce((n, q) => n + Number(q.points), 0);
  const [randomFilters, setRandomFilters] = useState({});
  useEffect(() => {
    if (!initialId) return;
    examsApi.get(initialId).then((exam) => {
      if (exam.status !== "draft") throw new Error("Ujian terbit tidak dapat diubah.");
      setDraft(exam);
      const localDate = (value) => {
        const date = new Date(value);
        date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
        return date.toISOString().slice(0, 16);
      };
      setForm({
        title: exam.title, subject_id: exam.subject_id || "", subject: exam.subject, class_id: exam.class_id || "", class: exam.class,
        starts_at: localDate(exam.starts_at), checkin_ends_at: localDate(exam.checkin_ends_at),
        timer_enabled: exam.timer_enabled, duration_minutes: exam.duration_minutes || 60,
        repeat_count: exam.repeat_count, score_policy: exam.score_policy,
        question_count: exam.question_count,
      });
      const bankItems = [];
      const inlineItems = [];
      for (const item of exam.questions || []) {
        const snapshot = item.question || item.snapshot;
        const question = typeof snapshot === "string" ? JSON.parse(snapshot) : snapshot;
        if (!question) continue;
        question.points = item.points;
        if (item.source_kind === "inline") inlineItems.push({ ...question, local_id: newInlineItemId() });
        else bankItems.push(question);
      }
      setSelected(bankItems);
      setInline(inlineItems);
      lastCompositionRef.current = JSON.stringify(compositionPayload(bankItems, inlineItems, 0, {}));
      setCompositionReady(true);
    }).catch((e) => showToast(e.message, "error"));
  }, [initialId, showToast]);
  function update(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }
  function openComposer(nextTab) {
    setTab(nextTab);
    setStep("questions");
  }
  function toggle(q) {
    const alreadySelected = selected.some((item) => item.id === q.id);
    if (!alreadySelected && usedCount >= Number(form.question_count)) {
      showToast(`Jumlah soal sudah mencapai batas ${form.question_count}. Hapus soal lain atau tambah jumlah soal di pengaturan.`, "error");
      return;
    }
    setSelected((items) => alreadySelected ? items.filter((item) => item.id !== q.id) : [...items, q]);
  }
  function drawRandomQuestions() {
    const count = Number(randomDraftCount || 0);
    if (randomCount > 0) return;
    if (!form.subject_id) {
      showToast("Pilih mata pelajaran ujian terlebih dahulu.", "error");
      return;
    }
    if (count < 1) {
      showToast("Tentukan jumlah soal acak terlebih dahulu.", "error");
      return;
    }
    if (count > randomMax) {
      showToast(`Maksimal ${randomMax} soal acak sesuai sisa kuota ujian.`, "error");
      setRandomDraftCount(randomMax);
      return;
    }
    setRandomCount(count);
  }
  function resetQuestions() {
    if (usedCount === 0 && compositionSaved !== "error") return;
    const emptyComposition = compositionPayload([], [], 0, randomFilters);
    const signature = JSON.stringify(emptyComposition);
    const sequence = ++autoSaveSequenceRef.current;
    lastCompositionRef.current = signature;
    setSelected([]);
    setInline([]);
    setRandomCount(0);
    setRandomDraftCount(0);
    if (!draft?.id) return;
    setCompositionSaved("saving");
    autoSaveQueueRef.current = autoSaveQueueRef.current.then(async () => {
      if (sequence !== autoSaveSequenceRef.current) return;
      try {
        await examsApi.compose(draft.id, emptyComposition);
        if (sequence === autoSaveSequenceRef.current) setCompositionSaved("saved");
      } catch (error) {
        if (sequence === autoSaveSequenceRef.current) {
          setCompositionSaved("error");
          showToast(error.message || "Reset soal belum tersimpan. Coba lagi.", "error");
        }
      }
    });
  }
  function compositionPayload(bankQuestions = selected, inlineQuestions = inline, count = randomCount, drawFilters = randomFilters) {
    return {
      questions: [
        ...bankQuestions.map((question) => ({ source_kind: "bank_manual", question_id: question.id, points: Number(question.points) })),
        ...inlineQuestions.map(({ save_to_bank, local_id, ...question }) => ({ source_kind: "inline", question, save_to_bank })),
      ],
      random: Number(count) > 0 ? [{ count: Number(count), ...drawFilters, subject_id: form.subject_id }] : [],
    };
  }
  function setInlineType(type) {
    setInlineForm({
      ...inlineForm,
      type,
      data: cloneInlineData(inlineTemplates[type]),
    });
    setDraggedInlineOption(null);
  }
  function updateInlineData(update) {
    setInlineForm((current) => ({ ...current, data: update(current.data) }));
  }
  async function uploadInlineImage(file, target = "prompt") {
    const body = new FormData();
    body.append("file", file);
    try {
      const image = await request("/media", { method: "POST", body });
      updateInlineData((data) => {
        if (target.startsWith("option:")) {
          const optionId = target.slice(7);
          return { ...data, options: data.options.map((option) => option.id === optionId ? { ...option, media: image } : option) };
        }
        return { ...data, prompt_media: image };
      });
      showToast("Gambar soal inline berhasil diunggah.");
    } catch (e) { showToast(e.message, "error"); }
  }
  function reorderInlineOptions(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    updateInlineData((data) => {
      const options = [...data.options];
      const from = options.findIndex((option) => option.id === fromId);
      const to = options.findIndex((option) => option.id === toId);
      if (from < 0 || to < 0) return data;
      const [option] = options.splice(from, 1);
      options.splice(to, 0, option);
      return { ...data, options };
    });
  }
  function moveInlineOrder(index, offset) {
    updateInlineData((data) => {
      const items = [...data.items];
      const nextIndex = index + offset;
      if (nextIndex < 0 || nextIndex >= items.length) return data;
      [items[index], items[nextIndex]] = [items[nextIndex], items[index]];
      return { ...data, items };
    });
  }
  async function saveInlineQuestion() {
    if (savingInline) return;
    try {
      if (!inlineForm.prompt.trim())
        throw new Error("Tulis pertanyaan sebelum menyimpan.");
      if (usedCount >= Number(form.question_count))
        throw new Error(`Jumlah soal sudah mencapai batas ${form.question_count}. Hapus soal lain atau tambah jumlah soal di pengaturan.`);
      const data = inlineForm.data;
      if (Number(inlineForm.points) <= 0) throw new Error("Bobot soal harus lebih dari 0.");
      if (["single_choice", "multi_select"].includes(inlineForm.type)) {
        if (data.options.length < 2 || data.options.some((option) => !option.text.trim())) throw new Error("Lengkapi minimal dua pilihan jawaban.");
        const correctCount = data.options.filter((option) => option.correct).length;
        if ((inlineForm.type === "single_choice" && correctCount !== 1) || (inlineForm.type === "multi_select" && correctCount < 2)) throw new Error("Tandai kunci jawaban sesuai tipe soal.");
      }
      if (inlineForm.type === "true_false" && (!data.statements.length || data.statements.some((item) => !item.text.trim()))) throw new Error("Lengkapi pernyataan benar atau salah.");
      if (inlineForm.type === "short_answer" && !data.accepted_answers.some((answer) => answer.trim())) throw new Error("Isi minimal satu jawaban yang diterima.");
      if (inlineForm.type === "fill_blank" && (!data.blanks.length || data.blanks.some((blank) => !blank.accepted_answers.some((answer) => answer.trim())))) throw new Error("Isi jawaban untuk setiap bagian isian.");
      if (inlineForm.type === "matching" && (data.pairs.length < 2 || data.pairs.some((pair) => !pair.left.trim() || !pair.right.trim()))) throw new Error("Lengkapi minimal dua pasangan.");
      if (inlineForm.type === "ordering" && (data.items.length < 2 || data.items.some((item) => !item.text.trim()))) throw new Error("Lengkapi minimal dua item urutan.");
      setSavingInline(true);
      const saved = await questionsApi.save({
        type: inlineForm.type,
        prompt: inlineForm.prompt.trim(),
        data: cloneInlineData(data),
        points: Number(inlineForm.points),
        subject_id: form.subject_id,
        subject: form.subject,
        difficulty: "Sedang",
        tags: [],
      });
      setSelected((items) => [...items, saved]);
      setInlineForm((current) => ({ ...current, prompt: "" }));
      showToast("Soal disimpan ke bank dan ditambahkan ke ujian.");
    } catch (e) {
      showToast(e.message, "error");
    } finally {
      setSavingInline(false);
    }
  }
  const remaining = Math.max(0, Number(form.question_count) - usedCount);
  const randomMax = Math.max(0, Number(form.question_count) - selected.length - inline.length);
  useEffect(() => {
    const count = Number(randomDraftCount || 0);
    if (count > randomMax) setRandomDraftCount(randomMax);
  }, [randomDraftCount, randomMax]);
  function examPayload() {
    return {
      ...form,
      starts_at: new Date(form.starts_at).toISOString(),
      checkin_ends_at: new Date(form.checkin_ends_at).toISOString(),
      question_count: Number(form.question_count),
      duration_minutes: form.timer_enabled ? Number(form.duration_minutes) : null,
      repeat_count: Number(form.repeat_count),
    };
  }
  async function continueToQuestions() {
    setErrors({});
    setBusy(true);
    try {
      const saved = await examsApi.save(examPayload(), draft?.id);
      setDraft(saved);
      lastCompositionRef.current = JSON.stringify(compositionPayload());
      setCompositionReady(true);
      setStep("questions");
    } catch (err) {
      setErrors(err.fieldErrors || {});
      showToast(err.message || "Draf ujian belum dapat disimpan.", "error");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!draft?.id || !compositionReady) return;
    const composition = compositionPayload();
    const signature = JSON.stringify(composition);
    if (signature === lastCompositionRef.current) return;

    const sequence = ++autoSaveSequenceRef.current;
    setCompositionSaved("saving");
    const timeout = setTimeout(async () => {
      autoSaveQueueRef.current = autoSaveQueueRef.current.then(async () => {
        if (sequence !== autoSaveSequenceRef.current) return;
        try {
          const saved = await examsApi.compose(draft.id, composition);
          lastCompositionRef.current = signature;

          const bankInlineIds = inline.filter((question) => question.save_to_bank).map((question) => question.local_id);
          if (bankInlineIds.length) {
            setInline((items) => items.map((question) => bankInlineIds.includes(question.local_id) ? { ...question, save_to_bank: false } : question));
          }

          if (Number(randomCount) > 0) {
            const resolvedBankQuestions = (saved.questions || []).filter((item) => item.source_kind !== "inline").map((item) => {
              let question = item.question || item.snapshot;
              if (typeof question === "string") {
                try { question = JSON.parse(question); } catch { question = null; }
              }
              return question ? { ...question, id: item.question_id || question.id, points: Number(item.points) } : null;
            }).filter(Boolean);
            setSelected(resolvedBankQuestions);
            setRandomCount(0);
            setRandomDraftCount(0);
          }

          if (sequence === autoSaveSequenceRef.current) setCompositionSaved("saved");
        } catch (error) {
          if (sequence === autoSaveSequenceRef.current) {
            setCompositionSaved("error");
            if (Number(randomCount) > 0) setRandomCount(0);
            showToast(error.message || "Susunan soal belum dapat disimpan otomatis.", "error");
          }
        }
      });
    }, 350);

    return () => clearTimeout(timeout);
  }, [draft?.id, compositionReady, selected, inline, randomCount, randomFilters]);
  const pointsMax = totalPoints;
  const previewQuestions = [
    ...selected.map((question) => ({ ...question, previewKey: `bank-${question.id}` })),
    ...inline.map((question) => ({ ...question, previewKey: `inline-${question.local_id}` })),
  ];
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <div className="exam-steps" aria-label="Langkah pembuatan ujian">
        <div className={`exam-step ${step === "settings" ? "active" : "complete"}`}>
          <span>1</span> Atur ujian
        </div>
        <div className={`exam-step ${step === "questions" ? "active" : ""}`}>
          <span>2</span> Susun soal
        </div>
      </div>
      <div className="form-layout">
        <div>
          {step === "settings" && <section className="form-card">
            <h2>Informasi ujian</h2>
            <p>
              Tentukan jumlah soal di awal agar susunan ujian tetap sesuai
              rencana.
            </p>
            <div className="settings-grid">
              <div className="field full">
                <label>Nama ujian</label>
                <input
                  className="input"
                  placeholder="Contoh: Ujian Bab Pecahan"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                />
                {errors.title && (
                  <small className="error-text">{errors.title}</small>
                )}
              </div>
              <div className="field">
                <label>Mata pelajaran</label>
                <CatalogSelect kind="subjects" placeholder="Pilih mata pelajaran" value={form.subject_id} valueName={form.subject} onChange={(id, name) => { setForm((current) => ({ ...current, subject_id: id, subject: name })); setRandomFilters({}); }} />
              </div>
              <div className="field">
                <label>Kelas</label>
                <CatalogSelect kind="classes" placeholder="Pilih kelas" value={form.class_id} valueName={form.class} onChange={(id, name) => setForm((current) => ({ ...current, class_id: id, class: name }))} />
              </div>
              <div className="field">
                <label>Jumlah soal</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="200"
                  value={form.question_count}
                  onChange={(e) => update("question_count", e.target.value)}
                />
                {errors.question_count && (
                  <small className="error-text">{errors.question_count}</small>
                )}
              </div>
              <div className="field">
                <label>Jumlah pengulangan</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  max="10"
                  step="1"
                  value={form.repeat_count}
                  onChange={(e) => update("repeat_count", e.target.value)}
                />
                <small className="field-note">Isi 0 jika ujian tidak dapat diulang. Maksimal 10 kali.</small>
              </div>
              <div className="field">
                <label>Waktu mulai</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => update("starts_at", e.target.value)}
                />
                {errors.starts_at && (
                  <small className="error-text">{errors.starts_at}</small>
                )}
              </div>
              <div className="field">
                <label>Batas check-in</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.checkin_ends_at}
                  onChange={(e) => update("checkin_ends_at", e.target.value)}
                />
                {errors.checkin_ends_at && (
                  <small className="error-text">{errors.checkin_ends_at}</small>
                )}
                <small className="field-note">
                  Siswa harus mulai sebelum waktu ini.
                </small>
              </div>
              {Number(form.repeat_count) > 0 && <div className="field">
                <label>Nilai akhir beberapa percobaan</label>
                <select
                  className="select"
                  value={form.score_policy}
                  onChange={(e) => update("score_policy", e.target.value)}
                >
                  <option value="highest">Nilai tertinggi</option>
                  <option value="latest">Percobaan terakhir</option>
                  <option value="average">Rata-rata</option>
                </select>
              </div>}
              <div className="field">
                <label className="check timer-toggle-label">
                  <input
                    type="checkbox"
                    checked={form.timer_enabled}
                    onChange={(e) => update("timer_enabled", e.target.checked)}
                  />{" "}
                  Gunakan timer
                </label>
                {form.timer_enabled && (
                  <input
                    className="input"
                    type="number"
                    min="1"
                    placeholder="Durasi menit"
                    value={form.duration_minutes}
                    onChange={(e) => update("duration_minutes", e.target.value)}
                  />
                )}
              </div>
            </div>
          </section>}
          {step === "questions" && <section className="form-card">
            <h2>Susun {form.question_count} soal</h2>
            <p>
              Pilih soal secara manual, ambil acak dari bank, atau tulis soal
              khusus untuk ujian ini.
            </p>
            <div className="tabs">
              <button
                type="button"
                className={`tab ${tab === "manual" ? "active" : ""}`}
                onClick={() => setTab("manual")}
              >
                Pilih dari bank
              </button>
              <button
                type="button"
                className={`tab ${tab === "random" ? "active" : ""}`}
                onClick={() => setTab("random")}
              >
                Ambil acak
              </button>
              <button
                type="button"
                className={`tab ${tab === "inline" ? "active" : ""}`}
                onClick={() => setTab("inline")}
              >
                Tulis soal baru
              </button>
            </div>
            {tab === "manual" && (
              <>
                <div className="toolbar">
                  <input
                    className="input"
                    placeholder="Cari soal…"
                    value={filters.q || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, q: e.target.value })
                    }
                  />
                  <select
                    className="select"
                    value={filters.type || ""}
                    onChange={(e) =>
                      setFilters({ ...filters, type: e.target.value })
                    }
                  >
                    <option value="">Semua tipe</option>
                    {TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ maxHeight: 300, overflowY: "auto" }}>
                  {bank.map((q) => (
                    <label className="compose-question" key={q.id}>
                      <input
                        type="checkbox"
                        checked={selected.some((s) => s.id === q.id)}
                        onChange={() => toggle(q)}
                      />
                      <span>
                        {q.prompt}
                        <small>
                          {q.type.replaceAll("_", " ")} · {q.topic || q.subject}{" "}
                          · bobot awal {q.points} poin
                        </small>
                      </span>
                      {selected.some((s) => s.id === q.id) && (
                        <input
                          className="input"
                          aria-label="Bobot soal pada ujian"
                          type="number"
                          min="0.1"
                          step="0.1"
                          style={{ width: 82 }}
                          value={selected.find((s) => s.id === q.id).points}
                          onChange={(e) => setSelected((items) => items.map((item) => item.id === q.id ? { ...item, points: Number(e.target.value) } : item))}
                        />
                      )}
                    </label>
                  ))}
                  {bank.length === 0 && (
                    <p className="field-note">
                      Belum ada soal cocok. Isi bank soal terlebih dahulu.
                    </p>
                  )}
                </div>
              </>
            )}
            {tab === "random" && (
              <>
              <div className="settings-grid">
                <div className="field">
                  <label>Jumlah soal acak</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    max={randomMax}
                    value={randomDraftCount}
                    disabled={randomCount > 0}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") return setRandomDraftCount("");
                      const count = Number(value);
                      if (count > randomMax) {
                        setRandomDraftCount(randomMax);
                        showToast(`Maksimal ${randomMax} soal acak sesuai sisa kuota ujian.`, "error");
                      } else {
                        setRandomDraftCount(Math.max(0, count));
                      }
                    }}
                  />
                  <small className="field-note">
                    Atur jumlah dan filter, lalu pilih soal secara acak.
                  </small>
                </div>
                <div className="field">
                  <label>Tipe soal</label>
                  <select
                    className="select"
                    value={randomFilters.type || ""}
                    disabled={randomCount > 0}
                    onChange={(e) =>
                      setRandomFilters({
                        ...randomFilters,
                        type: e.target.value,
                      })
                    }
                  >
                    <option value="">Semua tipe</option>
                    {TYPES.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Topik</label>
                  <CatalogSelect kind="topics" subjectId={form.subject_id} value={randomFilters.topic_id || ""} disabled={randomCount > 0} onChange={(id) => setRandomFilters({ ...randomFilters, topic_id: id })} />
                </div>
                <div className="field">
                  <label>Kesulitan</label>
                  <select
                    className="select"
                    value={randomFilters.difficulty || ""}
                    disabled={randomCount > 0}
                    onChange={(e) =>
                      setRandomFilters({
                        ...randomFilters,
                        difficulty: e.target.value,
                      })
                    }
                  >
                    <option value="">Semua tingkat</option>
                    {["Mudah", "Sedang", "Sulit"].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Tag</label>
                  <input
                    className="input"
                    value={randomFilters.tag || ""}
                    disabled={randomCount > 0}
                    onChange={(e) =>
                      setRandomFilters({
                        ...randomFilters,
                        tag: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button type="button" className="button primary" onClick={drawRandomQuestions} disabled={randomCount > 0 || Number(randomDraftCount || 0) < 1}>
                  {randomCount > 0 ? "Memilih soal…" : "Pilih soal acak"}
                </button>
              </div>
              </>
            )}
            {tab === "inline" && (
              <>
                <div className="settings-grid">
                  <div className="field">
                    <label>Tipe soal</label>
                    <select
                      className="select"
                      value={inlineForm.type}
                      onChange={(e) => setInlineType(e.target.value)}
                    >
                      {TYPES.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Bobot</label>
                    <input
                      className="input"
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={inlineForm.points}
                      onChange={(e) =>
                        setInlineForm({ ...inlineForm, points: e.target.value })
                      }
                    />
                  </div>
                  <div className="field full inline-question-editor">
                    <label>Pertanyaan</label>
                    <div className="question-prompt-row">
                      <textarea className="question-prompt" rows="2" placeholder="Tulis pertanyaan" value={inlineForm.prompt} onChange={(event) => setInlineForm({ ...inlineForm, prompt: event.target.value })} />
                      <label className="image-button" title="Tambahkan gambar pada pertanyaan">▧<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && uploadInlineImage(event.target.files[0], "prompt")} /></label>
                    </div>
                    {inlineForm.data.prompt_media?.url && <div className="attached-image"><img src={inlineForm.data.prompt_media.url} alt="Gambar pada pertanyaan" /><button type="button" onClick={() => updateInlineData((data) => { const next = { ...data }; delete next.prompt_media; return next; })}>Hapus gambar</button></div>}
                  </div>
                  {(["single_choice", "multi_select"].includes(inlineForm.type)) && <div className="field full answer-editor">
                    <div className="answer-editor-heading"><div><strong>Pilihan jawaban</strong><small>{inlineForm.type === "single_choice" ? "Pilih satu jawaban benar" : "Tandai semua jawaban yang benar"}</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>
                    {inlineForm.data.options.map((option, index) => <div className={`answer-option ${option.correct ? "is-correct" : ""}`} key={option.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderInlineOptions(draggedInlineOption, option.id); setDraggedInlineOption(null); }}>
                      <button type="button" className="drag-handle" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedInlineOption(option.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedInlineOption(null)} aria-label={`Pindahkan pilihan ${index + 1}`} title="Seret untuk mengubah urutan">⠿</button>
                      <button type="button" className={`correct-toggle ${inlineForm.type === "multi_select" ? "complex-toggle" : ""} ${option.correct ? "checked" : ""}`} onClick={() => updateInlineData((data) => ({ ...data, options: data.options.map((item) => ({ ...item, correct: inlineForm.type === "single_choice" ? item.id === option.id : item.id === option.id ? !item.correct : item.correct })) }))} aria-label={option.correct ? "Jawaban benar" : "Tandai sebagai jawaban benar"}>{option.correct ? "✓" : inlineForm.type === "single_choice" ? "○" : "□"}</button>
                      <input className="input option-input" aria-label={`Teks pilihan ${index + 1}`} placeholder={`Pilihan ${index + 1}`} value={option.text} onChange={(event) => updateInlineData((data) => ({ ...data, options: data.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) }))} />
                      <label className="option-image-button" title="Tambahkan gambar pada pilihan">▧<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && uploadInlineImage(event.target.files[0], `option:${option.id}`)} /></label>
                      <button type="button" className="remove-row" onClick={() => updateInlineData((data) => ({ ...data, options: data.options.filter((item) => item.id !== option.id) }))} aria-label={`Hapus pilihan ${index + 1}`}>×</button>
                      {option.media?.url && <img className="option-thumbnail" src={option.media.url} alt="Gambar pilihan" />}
                    </div>)}
                    <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, options: [...data.options, { id: newInlineItemId(), text: "", correct: false }] }))}>＋ Tambahkan pilihan</button>
                  </div>}
                  {inlineForm.type === "true_false" && <div className="field full inline-structured-editor">
                    <label>Pernyataan</label>
                    {inlineForm.data.statements.map((statement, index) => <div className="inline-editor-row inline-statement-row" key={statement.id}>
                      <input className="input" aria-label={`Pernyataan ${index + 1}`} placeholder={`Pernyataan ${index + 1}`} value={statement.text} onChange={(event) => updateInlineData((data) => ({ ...data, statements: data.statements.map((item, itemIndex) => itemIndex === index ? { ...item, text: event.target.value } : item) }))} />
                      <select className="select" aria-label={`Kunci pernyataan ${index + 1}`} value={String(statement.correct)} onChange={(event) => updateInlineData((data) => ({ ...data, statements: data.statements.map((item, itemIndex) => itemIndex === index ? { ...item, correct: event.target.value === "true" } : item) }))}><option value="true">Benar</option><option value="false">Salah</option></select>
                      <button type="button" className="remove-row" aria-label={`Hapus pernyataan ${index + 1}`} onClick={() => updateInlineData((data) => ({ ...data, statements: data.statements.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>
                    </div>)}
                    <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, statements: [...data.statements, { id: newInlineItemId(), text: "", correct: true }] }))}>＋ Tambahkan pernyataan</button>
                  </div>}
                  {inlineForm.type === "short_answer" && <div className="field full inline-structured-editor">
                    <label>Jawaban yang diterima</label>
                    <small className="field-note">Tambahkan variasi jika ada lebih dari satu jawaban yang benar.</small>
                    {inlineForm.data.accepted_answers.map((answer, index) => <div className="inline-editor-row" key={index}>
                      <input className="input" aria-label={`Jawaban yang diterima ${index + 1}`} placeholder={index ? "Variasi jawaban" : "Jawaban benar"} value={answer} onChange={(event) => updateInlineData((data) => ({ ...data, accepted_answers: data.accepted_answers.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} />
                      {inlineForm.data.accepted_answers.length > 1 && <button type="button" className="remove-row" aria-label={`Hapus jawaban ${index + 1}`} onClick={() => updateInlineData((data) => ({ ...data, accepted_answers: data.accepted_answers.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>}
                    </div>)}
                    <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, accepted_answers: [...data.accepted_answers, ""] }))}>＋ Tambahkan variasi jawaban</button>
                  </div>}
                  {inlineForm.type === "fill_blank" && <div className="field full inline-structured-editor">
                    <label>Kunci tiap bagian isian</label>
                    <small className="field-note">Tulis bagian kosong pada pertanyaan dengan tanda garis bawah (___).</small>
                    {inlineForm.data.blanks.map((blank, index) => <div className="inline-blank-card" key={blank.id}>
                      <div className="inline-blank-heading"><strong>Bagian {index + 1}</strong><button type="button" className="remove-row" aria-label={`Hapus bagian ${index + 1}`} onClick={() => updateInlineData((data) => ({ ...data, blanks: data.blanks.filter((item) => item.id !== blank.id) }))}>×</button></div>
                      {blank.accepted_answers.map((answer, answerIndex) => <div className="inline-editor-row" key={answerIndex}>
                        <input className="input" aria-label={`Jawaban bagian ${index + 1}`} placeholder={answerIndex ? "Variasi jawaban" : "Jawaban benar"} value={answer} onChange={(event) => updateInlineData((data) => ({ ...data, blanks: data.blanks.map((item) => item.id === blank.id ? { ...item, accepted_answers: item.accepted_answers.map((value, valueIndex) => valueIndex === answerIndex ? event.target.value : value) } : item) }))} />
                        {answerIndex > 0 && <button type="button" className="remove-row" aria-label="Hapus variasi jawaban" onClick={() => updateInlineData((data) => ({ ...data, blanks: data.blanks.map((item) => item.id === blank.id ? { ...item, accepted_answers: item.accepted_answers.filter((_, valueIndex) => valueIndex !== answerIndex) } : item) }))}>×</button>}
                      </div>)}
                      <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, blanks: data.blanks.map((item) => item.id === blank.id ? { ...item, accepted_answers: [...item.accepted_answers, ""] } : item) }))}>＋ Variasi jawaban</button>
                    </div>)}
                    <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, blanks: [...data.blanks, { id: newInlineItemId(), accepted_answers: [""] }] }))}>＋ Tambahkan bagian isian</button>
                  </div>}
                  {inlineForm.type === "essay" && <div className="field full inline-structured-editor">
                    <label>Panduan penilaian</label>
                    <textarea className="textarea" placeholder="Tuliskan poin-poin yang diharapkan dari jawaban siswa" value={inlineForm.data.rubric} onChange={(event) => updateInlineData((data) => ({ ...data, rubric: event.target.value }))} />
                    <small className="field-note">Jawaban esai akan dinilai manual oleh guru.</small>
                  </div>}
                  {inlineForm.type === "matching" && <div className="field full inline-structured-editor">
                    <label>Pasangan yang benar</label>
                    {inlineForm.data.pairs.map((pair, index) => <div className="inline-editor-row inline-matching-row" key={pair.id}>
                      <span className="order-number">{index + 1}</span>
                      <input className="input" aria-label={`Istilah ${index + 1}`} placeholder="Istilah" value={pair.left} onChange={(event) => updateInlineData((data) => ({ ...data, pairs: data.pairs.map((item, itemIndex) => itemIndex === index ? { ...item, left: event.target.value } : item) }))} />
                      <span className="match-arrow">↔</span>
                      <input className="input" aria-label={`Pasangan ${index + 1}`} placeholder="Pasangan yang benar" value={pair.right} onChange={(event) => updateInlineData((data) => ({ ...data, pairs: data.pairs.map((item, itemIndex) => itemIndex === index ? { ...item, right: event.target.value } : item) }))} />
                      <button type="button" className="remove-row" aria-label={`Hapus pasangan ${index + 1}`} onClick={() => updateInlineData((data) => ({ ...data, pairs: data.pairs.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>
                    </div>)}
                    <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, pairs: [...data.pairs, { id: newInlineItemId(), left: "", right: "" }] }))}>＋ Tambahkan pasangan</button>
                  </div>}
                  {inlineForm.type === "ordering" && <div className="field full inline-structured-editor">
                    <label>Urutan yang benar</label>
                    <small className="field-note">Susun item dari urutan pertama sampai terakhir.</small>
                    {inlineForm.data.items.map((item, index) => <div className="inline-editor-row inline-order-row" key={item.id}>
                      <span className="order-number">{index + 1}</span>
                      <input className="input" aria-label={`Item urutan ${index + 1}`} placeholder={`Item urutan ${index + 1}`} value={item.text} onChange={(event) => updateInlineData((data) => ({ ...data, items: data.items.map((row, itemIndex) => itemIndex === index ? { ...row, text: event.target.value } : row) }))} />
                      <button type="button" className="move-row" aria-label={`Naikkan item ${index + 1}`} disabled={index === 0} onClick={() => moveInlineOrder(index, -1)}>↑</button>
                      <button type="button" className="move-row" aria-label={`Turunkan item ${index + 1}`} disabled={index === inlineForm.data.items.length - 1} onClick={() => moveInlineOrder(index, 1)}>↓</button>
                      <button type="button" className="remove-row" aria-label={`Hapus item ${index + 1}`} onClick={() => updateInlineData((data) => ({ ...data, items: data.items.filter((_, itemIndex) => itemIndex !== index) }))}>×</button>
                    </div>)}
                    <button type="button" className="add-row" onClick={() => updateInlineData((data) => ({ ...data, items: [...data.items, { id: newInlineItemId(), text: "" }] }))}>＋ Tambahkan item</button>
                  </div>}
                  <div className="field full">
                    <button
                      type="button"
                      className="button primary"
                      onClick={saveInlineQuestion}
                      disabled={savingInline}
                    >
                      {savingInline ? "Menyimpan soal…" : "Simpan soal ke bank dan ujian"}
                    </button>
                    <small className="field-note">
                      Soal baru akan disimpan ke bank dan ditambahkan ke ujian setelah tombol ini ditekan.
                    </small>
                  </div>
                </div>
                {inline.map((q, i) => (
                  <div className="compose-question" key={i}>
                    <span>
                      {q.prompt}
                      <small>
                        {q.type.replaceAll("_", " ")} · {q.points} poin
                      </small>
                    </span>
                    <button
                      type="button"
                      className="row-actions"
                      onClick={() =>
                        setInline((s) => s.filter((_, n) => n !== i))
                      }
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </>
            )}
          </section>}
          <div className="form-actions">
            {step === "settings" ? (
              <>
                <Link className="button secondary" href="/exams">Batal</Link>
                <button type="button" className="button primary" disabled={busy} onClick={continueToQuestions}>{busy ? "Menyimpan draf…" : "Lanjut pilih soal →"}</button>
              </>
            ) : (
              <button type="button" className="button secondary" onClick={() => setStep("settings")}>Kembali ke pengaturan</button>
            )}
          </div>
        </div>
        <aside className="form-card question-preview">
          <span className="eyebrow">{step === "settings" ? "RINGKASAN UJIAN" : "PRATINJAU UJIAN"}</span>
          <h2 style={{ marginTop: 7 }}>{form.title || "Ujian tanpa judul"}</h2>
          <p className="field-note">
            {form.subject} · {form.class}
          </p>
          <div className="counter-card">
            <span>
              Terpilih{" "}
              <strong>
                {usedCount}/{form.question_count}
              </strong>
            </span>
            <span>
              Sisa <strong>{remaining}</strong>
            </span>
          </div>
          <div className="preview-paper">
            <span className="preview-label">JADWAL</span>
            <p>
              {form.starts_at.replace("T", " ")}
              <br />
              Check-in sampai {form.checkin_ends_at.replace("T", " ")}
            </p>
            <small className="field-note">
              {form.timer_enabled
                ? `Timer ${form.duration_minutes} menit`
                : "Tanpa timer"}{" "}
              · {Number(form.repeat_count) === 0 ? "Tanpa pengulangan" : `${form.repeat_count} kali pengulangan`}
            </small>
          </div>
          <div className="preview-paper">
            <span className="preview-label">BOBOT YANG SUDAH DIKETAHUI</span>
            <p>
              <strong>{pointsMax.toFixed(1)} poin</strong>
              {randomCount > 0 && <small className="field-note"> · bobot soal acak dihitung saat disimpan</small>}
            </p>
            <small className="field-note">
              Nilai akhir akan dikonversi ke skala 100 setelah seluruh soal tersusun.
            </small>
          </div>
          {step === "settings" ? (
            <div className="preview-add-questions">
              <span className="field-note">Atur jadwal dan jumlah soal terlebih dahulu.</span>
              <button type="button" className="button primary" disabled={busy} onClick={continueToQuestions}>{busy ? "Menyimpan draf…" : "Lanjut pilih soal →"}</button>
            </div>
          ) : remaining > 0 && (
            <div className="preview-add-questions">
              <strong>Tambah {remaining} soal lagi</strong>
              <button type="button" className="button secondary" onClick={() => openComposer("manual")}>Pilih dari bank soal</button>
              <button type="button" className="button secondary" onClick={() => openComposer("random")}>Ambil soal acak</button>
              <button type="button" className="button secondary" onClick={() => openComposer("inline")}>Tulis soal baru</button>
            </div>
          )}
          {(step === "questions" || (Boolean(initialId) && step === "settings")) && <section className="exam-question-preview-list" aria-live="polite">
            <div className="exam-question-preview-heading">
              <strong>{step === "questions" ? "Soal dalam ujian" : "Soal dalam draf"}</strong>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span>{usedCount} / {form.question_count}</span>
                {initialId && <button type="button" className="button secondary" onClick={resetQuestions} disabled={usedCount === 0 && compositionSaved !== "error"}>{usedCount === 0 ? "Coba simpan reset" : "Reset soal"}</button>}
              </div>
            </div>
            {compositionSaved === "saving" && <small className="field-note">Menyimpan susunan soal…</small>}
            {compositionSaved === "saved" && usedCount > 0 && <small className="field-note">Susunan soal tersimpan otomatis</small>}
            {randomCount > 0 && <small className="field-note">Memilih {randomCount} soal acak…</small>}
            {previewQuestions.map((question, index) => <article className="exam-question-preview-item" key={question.previewKey}>
              <div className="exam-question-preview-top"><span>{String(index + 1).padStart(2, "0")}</span><small>{String(question.type || "").replaceAll("_", " ")} · {Number(question.points || 0)} poin</small></div>
              <p>{question.prompt || "Pertanyaan belum tersedia"}</p>
              {question.data?.prompt_media?.url && <img className="exam-question-preview-image" src={question.data.prompt_media.url} alt="Gambar pada soal" />}
              {question.data?.options?.map((option) => <div className="exam-question-preview-answer" key={option.id}>
                <span>{question.type === "multi_select" ? (option.correct ? "☑" : "□") : (option.correct ? "◉" : "○")}</span>
                {option.text || "Pilihan belum diisi"}
                {option.media?.url && <img src={option.media.url} alt="Gambar pilihan" />}
              </div>)}
              {question.data?.statements?.map((statement) => <div className="exam-question-preview-answer" key={statement.id}><span>{statement.correct ? "Benar" : "Salah"}</span>{statement.text}</div>)}
              {question.data?.accepted_answers?.filter(Boolean).length > 0 && <small className="field-note">Jawaban: {question.data.accepted_answers.filter(Boolean).join(" / ")}</small>}
              {question.data?.blanks?.map((blank, blankIndex) => <small className="field-note" key={blank.id}>Bagian {blankIndex + 1}: {(blank.accepted_answers || []).filter(Boolean).join(" / ") || "jawaban belum diisi"}</small>)}
              {question.data?.pairs?.map((pair) => <div className="exam-question-preview-answer" key={pair.id}>{pair.left} ↔ {pair.right}</div>)}
              {question.data?.items?.map((item, itemIndex) => <div className="exam-question-preview-answer" key={item.id}>{itemIndex + 1}. {item.text}</div>)}
              {question.data?.rubric && <small className="field-note">Panduan penilaian: {question.data.rubric}</small>}
              {question.type === "essay" && <small className="field-note">Jawaban esai dinilai manual</small>}
            </article>)}
            {previewQuestions.length === 0 && randomCount === 0 && <p className="field-note">Belum ada soal yang dipilih.</p>}
          </section>}
          <p className="field-note" style={{ lineHeight: 1.6 }}>
            Susunan soal yang sama dipakai semua siswa. Urutan dapat dibedakan
            saat alur siswa tersedia.
          </p>
        </aside>
      </div>
    </form>
  );
}

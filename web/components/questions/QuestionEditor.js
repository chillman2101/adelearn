"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { questionsApi, request } from "../../lib/api";
import CatalogSelect from "../CatalogSelect";
import { useToast } from "../ToastProvider";

const kinds = [
  ["single_choice", "Pilihan ganda"],
  ["multi_select", "Pilihan ganda kompleks"],
  ["true_false", "Benar / salah"],
  ["short_answer", "Jawaban singkat"],
  ["fill_blank", "Isian"],
  ["essay", "Esai"],
  ["matching", "Menjodohkan"],
  ["ordering", "Mengurutkan"],
];

const newItemId = () => globalThis.crypto?.randomUUID?.() || `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const templates = {
  single_choice: { options: [{ id: "a", text: "", correct: true }, { id: "b", text: "", correct: false }] },
  multi_select: { options: [{ id: "a", text: "", correct: true }, { id: "b", text: "", correct: true }, { id: "c", text: "", correct: false }] },
  true_false: { statements: [{ id: "s1", text: "", correct: true }] },
  short_answer: { accepted_answers: [""] },
  fill_blank: { blanks: [{ id: "b1", accepted_answers: [""] }] },
  essay: { rubric: "", manual_grading: true },
  matching: { pairs: [{ id: "p1", left: "", right: "" }, { id: "p2", left: "", right: "" }] },
  ordering: { items: [{ id: "i1", text: "" }, { id: "i2", text: "" }] },
};
const clone = (value) => JSON.parse(JSON.stringify(value));

export default function QuestionEditor({ questionId }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [form, setForm] = useState({ type: "single_choice", prompt: "", data: clone(templates.single_choice), points: 1, subject_id: "", topic_id: "", subject: "", topic: "", difficulty: "Sedang", tags: [] });
  const [tagInput, setTagInput] = useState("");
  const [draggedOption, setDraggedOption] = useState(null);
  const [draggedOrderItem, setDraggedOrderItem] = useState(null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!questionId) return;
    questionsApi.get(questionId).then((question) => setForm({ ...question, data: question.data || {}, tags: question.tags || [] })).catch((error) => setMessage(error.message));
  }, [questionId]);

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function updateData(change) { setForm((current) => ({ ...current, data: change(current.data || {}) })); }
  function addTag(raw = tagInput) {
    const value = raw.trim().replace(/,$/, "").trim();
    addTags(value ? [value] : []);
    setTagInput("");
  }
  function addTags(values) {
    const combined = [...form.tags];
    values.map((value) => value.trim()).filter(Boolean).forEach((value) => { if (!combined.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) combined.push(value); });
    update("tags", combined);
  }
  function reorderDataList(key, fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    updateData((current) => {
      const items = [...(current[key] || [])];
      const from = items.findIndex((item) => item.id === fromId);
      const to = items.findIndex((item) => item.id === toId);
      if (from < 0 || to < 0) return current;
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...current, [key]: items };
    });
  }
  async function attachImage(file, target = "prompt") {
    const body = new FormData();
    body.append("file", file);
    try {
      const media = await request("/media", { method: "POST", body });
      updateData((data) => {
        if (target === "prompt") return { ...data, prompt_media: media };
        return { ...data, options: data.options.map((option) => option.id === target ? { ...option, media } : option) };
      });
      setMessage("Gambar berhasil ditambahkan.");
    } catch (error) { setMessage(error.message); }
  }

  function addChoice() {
    updateData((data) => ({ ...data, options: [...(data.options || []), { id: newItemId(), text: "", correct: false }] }));
  }
  function changeCorrect(optionId, checked) {
    updateData((data) => ({ ...data, options: data.options.map((option) => ({ ...option, correct: form.type === "single_choice" ? option.id === optionId : option.id === optionId ? checked : option.correct })) }));
  }
  function addTextAnswer() {
    updateData((data) => ({ ...data, accepted_answers: [...(data.accepted_answers || []), ""] }));
  }
  function addBlank() {
    updateData((data) => ({ ...data, blanks: [...(data.blanks || []), { id: newItemId(), accepted_answers: [""] }] }));
  }
  function addPair() {
    updateData((data) => ({ ...data, pairs: [...(data.pairs || []), { id: newItemId(), left: "", right: "" }] }));
  }
  function addOrderItem() {
    updateData((data) => ({ ...data, items: [...(data.items || []), { id: newItemId(), text: "" }] }));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setErrors({}); setMessage("");
    const body = { ...form, points: Number(form.points), tags: [...form.tags, ...(tagInput.trim() ? [tagInput.trim()] : [])] };
    for (const key of ["id", "used", "created_by", "created_at", "updated_at", "class", "class_id"]) delete body[key];
    try {
      const saved = await questionsApi.save(body, questionId);
      showToast(questionId ? "Perubahan soal berhasil disimpan." : "Soal berhasil disimpan ke bank soal.");
      router.push(`/questions/${saved.id}`);
    } catch (error) { setErrors(error.fieldErrors || {}); setMessage(error.message); }
    finally { setBusy(false); }
  }

  const data = form.data || {};
  const title = kinds.find(([kind]) => kind === form.type)?.[1] || "Soal";

  return (
    <form onSubmit={submit} className="question-editor-layout">
      <div className="question-editor-main">
        <section className="form-card question-card">
          <div className="question-card-top">
            <span className="question-number">Q</span>
            <select className="select question-type-select" value={form.type} onChange={(event) => { update("type", event.target.value); update("data", clone(templates[event.target.value])); }} aria-label="Tipe soal">
              {kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label className="points-control"><input type="number" min="0.1" step="0.1" value={form.points} onChange={(event) => update("points", event.target.value)} aria-label="Bobot soal"/><span>poin</span></label>
          </div>
          <div className="question-prompt-row">
            <textarea className="question-prompt" rows="2" placeholder="Tulis pertanyaan" value={form.prompt} onChange={(event) => update("prompt", event.target.value)} />
            <label className="image-button" title="Tambahkan gambar pada pertanyaan">▧<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && attachImage(event.target.files[0])}/></label>
          </div>
          {errors.prompt && <small className="error-text">{errors.prompt}</small>}
          {data.prompt_media?.url && <div className="attached-image"><img src={data.prompt_media.url} alt="Gambar pada pertanyaan"/><button type="button" onClick={() => updateData((current) => { const next = { ...current }; delete next.prompt_media; return next; })}>Hapus gambar</button></div>}

          {(form.type === "single_choice" || form.type === "multi_select") && <div className="answer-editor">
            <div className="answer-editor-heading"><div><strong>Pilihan jawaban</strong><small>{form.type === "single_choice" ? "Pilih satu jawaban benar" : "Tandai semua jawaban yang benar"}</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>
            {(data.options || []).map((option, index) => <div className={`answer-option ${option.correct ? "is-correct" : ""}`} key={option.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderDataList("options", draggedOption, option.id); setDraggedOption(null); }}>
              <button type="button" className="drag-handle" draggable onDragStart={(event) => { event.stopPropagation(); setDraggedOption(option.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDraggedOption(null)} aria-label={`Pindahkan pilihan ${index + 1}`} title="Seret untuk mengubah urutan">⠿</button>
              <button type="button" className={`correct-toggle ${form.type === "multi_select" ? "complex-toggle" : ""} ${option.correct ? "checked" : ""}`} onClick={() => changeCorrect(option.id, form.type === "single_choice" ? true : !option.correct)} aria-label={option.correct ? "Jawaban benar" : "Tandai sebagai jawaban benar"}>{option.correct ? "✓" : form.type === "single_choice" ? "○" : "□"}</button>
              <input className="input option-input" placeholder={`Pilihan ${index + 1}`} value={option.text} onChange={(event) => updateData((current) => ({ ...current, options: current.options.map((item) => item.id === option.id ? { ...item, text: event.target.value } : item) }))}/>
              <label className="option-image-button" title="Tambahkan gambar pada pilihan">▧<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => event.target.files?.[0] && attachImage(event.target.files[0], option.id)}/></label>
              <button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, options: current.options.filter((item) => item.id !== option.id) }))} aria-label="Hapus pilihan">×</button>
              {option.media?.url && <img className="option-thumbnail" src={option.media.url} alt="Gambar pilihan"/>}
            </div>)}
            {errors["data.options"] && <small className="error-text">{errors["data.options"]}</small>}
            <button type="button" className="add-row" onClick={addChoice}>＋ Tambahkan pilihan</button>
          </div>}

          {form.type === "true_false" && <div className="answer-editor"><div className="answer-editor-heading"><div><strong>Pernyataan</strong><small>Pilih kunci benar atau salah untuk setiap pernyataan</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>{(data.statements || []).map((item) => <div className="structured-row" key={item.id}><input className="input" placeholder="Tulis pernyataan" value={item.text} onChange={(event) => updateData((current) => ({ ...current, statements: current.statements.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row) }))}/><div className="true-false-toggle"><button type="button" className={item.correct ? "selected" : ""} onClick={() => updateData((current) => ({ ...current, statements: current.statements.map((row) => row.id === item.id ? { ...row, correct: true } : row) }))}>Benar</button><button type="button" className={!item.correct ? "selected" : ""} onClick={() => updateData((current) => ({ ...current, statements: current.statements.map((row) => row.id === item.id ? { ...row, correct: false } : row) }))}>Salah</button></div><button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, statements: current.statements.filter((row) => row.id !== item.id) }))}>×</button></div>)}{errors["data.statements"] && <small className="error-text">{errors["data.statements"]}</small>}<button type="button" className="add-row" onClick={() => updateData((current) => ({ ...current, statements: [...(current.statements || []), { id: newItemId(), text: "", correct: true }] }))}>＋ Tambahkan pernyataan</button></div>}

          {form.type === "short_answer" && <div className="answer-editor"><div className="answer-editor-heading"><div><strong>Jawaban yang diterima</strong><small>Tambahkan variasi jawaban yang dianggap benar</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>{(data.accepted_answers || []).map((answer, index) => <div className="structured-row" key={index}><span className="answer-dot">Aa</span><input className="input" placeholder={`Jawaban ${index + 1}`} value={answer} onChange={(event) => updateData((current) => ({ ...current, accepted_answers: current.accepted_answers.map((value, i) => i === index ? event.target.value : value) }))}/>{data.accepted_answers.length > 1 && <button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, accepted_answers: current.accepted_answers.filter((_, i) => i !== index) }))}>×</button>}</div>)}{errors["data.accepted_answers"] && <small className="error-text">{errors["data.accepted_answers"]}</small>}<button type="button" className="add-row" onClick={addTextAnswer}>＋ Tambahkan variasi jawaban</button></div>}

          {form.type === "fill_blank" && <div className="answer-editor"><div className="answer-editor-heading"><div><strong>Kunci tiap bagian isian</strong><small>Tulis bagian kosong sebagai garis bawah pada pertanyaan</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>{(data.blanks || []).map((blank, index) => <div className="blank-answer-row" key={blank.id}><span>Bagian {index + 1}</span><div className="blank-answers">{(blank.accepted_answers || [""]).map((answer, answerIndex) => <div className="blank-variant" key={answerIndex}><input className="input" placeholder={answerIndex === 0 ? "Jawaban benar" : "Variasi jawaban"} value={answer} onChange={(event) => updateData((current) => ({ ...current, blanks: current.blanks.map((item) => item.id === blank.id ? { ...item, accepted_answers: item.accepted_answers.map((value, i) => i === answerIndex ? event.target.value : value) } : item) }))}/>{answerIndex > 0 && <button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, blanks: current.blanks.map((item) => item.id === blank.id ? { ...item, accepted_answers: item.accepted_answers.filter((_, i) => i !== answerIndex) } : item) }))}>×</button>}</div>)}<button type="button" className="add-row" onClick={() => updateData((current) => ({ ...current, blanks: current.blanks.map((item) => item.id === blank.id ? { ...item, accepted_answers: [...(item.accepted_answers || []), ""] } : item) }))}>＋ Variasi jawaban</button></div><button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, blanks: current.blanks.filter((item) => item.id !== blank.id) }))}>×</button></div>)}{errors["data.blanks"] && <small className="error-text">{errors["data.blanks"]}</small>}<button type="button" className="add-row" onClick={addBlank}>＋ Tambahkan bagian isian</button></div>}

          {form.type === "essay" && <div className="answer-editor"><div className="answer-editor-heading"><div><strong>Panduan penilaian</strong><small>Jawaban esai dinilai manual oleh guru</small></div><span className="answer-key-label">PENILAIAN MANUAL</span></div><textarea className="textarea" placeholder="Tuliskan rubrik atau poin yang perlu diperhatikan saat menilai…" value={data.rubric || ""} onChange={(event) => updateData((current) => ({ ...current, rubric: event.target.value, manual_grading: true }))}/></div>}

          {form.type === "matching" && <div className="answer-editor"><div className="answer-editor-heading"><div><strong>Pasangan yang benar</strong><small>Isi istilah dan pasangan jawabannya</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>{(data.pairs || []).map((pair, index) => <div className="matching-row" key={pair.id}><span>{index + 1}</span><input className="input" placeholder="Kolom A" value={pair.left} onChange={(event) => updateData((current) => ({ ...current, pairs: current.pairs.map((item) => item.id === pair.id ? { ...item, left: event.target.value } : item) }))}/><span className="match-arrow">↔</span><input className="input" placeholder="Pasangan benar" value={pair.right} onChange={(event) => updateData((current) => ({ ...current, pairs: current.pairs.map((item) => item.id === pair.id ? { ...item, right: event.target.value } : item) }))}/><button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, pairs: current.pairs.filter((item) => item.id !== pair.id) }))}>×</button></div>)}{errors["data.pairs"] && <small className="error-text">{errors["data.pairs"]}</small>}<button type="button" className="add-row" onClick={addPair}>＋ Tambahkan pasangan</button></div>}

          {form.type === "ordering" && <div className="answer-editor"><div className="answer-editor-heading"><div><strong>Urutan yang benar</strong><small>Tarik ikon ⠿ untuk menyusun item pertama hingga terakhir</small></div><span className="answer-key-label">KUNCI JAWABAN</span></div>{(data.items || []).map((item, index) => <div className="structured-row ordering-row" key={item.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); reorderDataList("items", draggedOrderItem, item.id); setDraggedOrderItem(null); }}><button type="button" className="drag-handle" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggedOrderItem(item.id); }} onDragEnd={() => setDraggedOrderItem(null)} aria-label={`Pindahkan item ${index + 1}`} title="Seret untuk mengubah urutan">⠿</button><span className="order-number">{index + 1}</span><input className="input" placeholder={`Item urutan ${index + 1}`} value={item.text} onChange={(event) => updateData((current) => ({ ...current, items: current.items.map((row) => row.id === item.id ? { ...row, text: event.target.value } : row) }))}/><button type="button" className="remove-row" onClick={() => updateData((current) => ({ ...current, items: current.items.filter((row) => row.id !== item.id) }))}>×</button></div>)}{errors["data.items"] && <small className="error-text">{errors["data.items"]}</small>}<button type="button" className="add-row" onClick={addOrderItem}>＋ Tambahkan item</button></div>}
        </section>

        <section className="form-card">
          <div className="editor-section-title"><div><h2>Kategori soal</h2><p>Supaya soal mudah ditemukan kembali di bank.</p></div></div>
          <div className="field-grid">
            <div className="field"><label>Mata pelajaran</label><CatalogSelect kind="subjects" value={form.subject_id} valueName={form.subject} onChange={(id, name) => setForm((current) => ({ ...current, subject_id: id, subject: name, topic_id: "", topic: "" }))}/></div>
            <div className="field"><label>Topik / bab</label><CatalogSelect kind="topics" subjectId={form.subject_id} value={form.topic_id} valueName={form.topic} placeholder="Pilih atau buat topik" onChange={(id, name) => setForm((current) => ({ ...current, topic_id: id, topic: name }))}/></div>
            <div className="field"><label>Tingkat kesulitan</label><select className="select" value={form.difficulty} onChange={(event) => update("difficulty", event.target.value)}>{["Mudah", "Sedang", "Sulit"].map((value) => <option key={value}>{value}</option>)}</select></div>
            <div className="field full"><label>Tag</label><div className="tag-input-wrap" onClick={(event) => event.currentTarget.querySelector("input")?.focus()}>{form.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}<button type="button" aria-label={`Hapus tag ${tag}`} onClick={() => update("tags", form.tags.filter((item) => item !== tag))}>×</button></span>)}<input className="tag-input" placeholder={form.tags.length ? "Tambah tag…" : "Ketik tag lalu tekan Enter"} value={tagInput} onChange={(event) => { if (event.target.value.includes(",")) { const parts = event.target.value.split(","); addTags(parts.slice(0, -1)); setTagInput(parts.at(-1)); } else setTagInput(event.target.value); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === ",") { event.preventDefault(); addTag(); } if (event.key === "Backspace" && !tagInput && form.tags.length) update("tags", form.tags.slice(0, -1)); }} onBlur={() => tagInput.trim() && addTag()}/></div><small className="field-note">Tekan Enter atau koma untuk menambahkan tag.</small></div>
          </div>
          <div className="form-actions"><Link href="/questions" className="button secondary">Batal</Link><button className="button primary" disabled={busy}>{busy ? "Menyimpan…" : questionId ? "Simpan perubahan" : "Simpan ke bank soal"}</button></div>
          {message && <div className={`notice ${errors.data || errors["data.options"] ? "error" : ""}`} style={{ marginTop: 12 }}>{message}</div>}
        </section>
      </div>

      <aside className="question-preview form-card">
        <span className="eyebrow">PRATINJAU</span><h2 style={{ marginTop: 7 }}>Tampilan siswa</h2>
        <div className="preview-paper"><span className="preview-label">{title.toUpperCase()} · {form.points || 0} POIN</span><p>{form.prompt || "Pertanyaan yang kamu tulis akan muncul di sini."}</p>{data.prompt_media?.url && <img className="preview-image" src={data.prompt_media.url} alt="Lampiran pertanyaan"/>}
          {(form.type === "single_choice" || form.type === "multi_select") && (data.options || []).map((option) => <div className="preview-choice" key={option.id}><span>{form.type === "single_choice" ? "○" : "□"}</span><div>{option.text || "Pilihan jawaban"}{option.media?.url && <img className="preview-image" src={option.media.url} alt="Lampiran pilihan"/>}</div></div>)}
          {form.type === "true_false" && (data.statements || []).map((statement) => <div className="preview-choice" key={statement.id}><span>○</span><div>{statement.text || "Pernyataan"}</div></div>)}
          {form.type === "short_answer" && <div className="preview-answer-line">Jawaban singkat</div>}
          {form.type === "fill_blank" && <div className="preview-answer-line">Isian jawaban</div>}
          {form.type === "essay" && <div className="preview-answer-line tall">Jawaban panjang</div>}
          {form.type === "matching" && <div className="preview-answer-line">Daftar pasangan</div>}
          {form.type === "ordering" && <div className="preview-answer-line">Susun urutan item</div>}
          <small className="field-note">{form.subject || "Mata pelajaran"}{form.topic ? ` · ${form.topic}` : ""}</small>
        </div>
        <div className="preview-score"><span>Bobot soal</span><strong>{form.points || 0} poin</strong></div>
      </aside>
    </form>
  );
}

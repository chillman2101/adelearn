"use client";

import Link from "next/link";
import { useState } from "react";
import { API, questionsApi } from "../../../lib/api";
import { useToast } from "../../../components/ToastProvider";

const typeNames = {
  single_choice: "Pilihan ganda", multi_select: "Pilihan ganda kompleks",
  true_false: "Benar / salah", short_answer: "Jawaban singkat",
  fill_blank: "Isian", essay: "Esai", matching: "Menjodohkan", ordering: "Mengurutkan",
};

export default function ImportQuestionsPage() {
  const { showToast } = useToast();
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const invalidCount = rows.filter((row) => row.errors && Object.keys(row.errors).length).length;
  const duplicateCount = rows.filter((row) => row.warnings && Object.keys(row.warnings).length).length;

  async function preview(event) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true); setMessage(""); setRows([]);
    const body = new FormData(); body.append("file", file);
    try {
      const result = await questionsApi.previewImport(body);
      setRows(result.rows || []);
      const duplicates = result.rows?.filter((row) => row.warnings && Object.keys(row.warnings).length).length || 0;
      setMessage(`File terbaca: ${result.count} soal. ${result.rows?.some((row) => row.errors) ? "Perbaiki baris yang ditandai lalu unggah ulang." : "Semua baris lolos validasi."}${duplicates ? ` Ada ${duplicates} soal dengan peringatan duplikat; tetap bisa diimpor.` : ""}`);
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  async function importAll() {
    if (busy || !rows.length || invalidCount) return;
    setBusy(true); setMessage("");
    try {
      const result = await questionsApi.import(rows.map((row) => row.question));
      showToast(`${result.imported} soal berhasil diimpor ke bank soal.`);
      setMessage("");
      setRows([]); setFile(null);
      const input = document.getElementById("question-import-file"); if (input) input.value = "";
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }

  return <>
    <div className="page-heading">
      <div><span className="eyebrow">BANK SOAL · IMPOR</span><h1>Import bank soal</h1><p>Unggah Excel atau CSV, periksa semua baris, lalu simpan sekaligus.</p></div>
      <Link className="button secondary" href="/questions">← Kembali ke bank soal</Link>
    </div>
    <section className="form-card import-card">
      <div className="editor-section-title"><div><h2>1. Siapkan file</h2><p>Gunakan template supaya nama kolom dan struktur jawaban sesuai.</p></div></div>
      <div className="import-template-actions">
        <a className="button primary import-template-link" href="/bank-soal-200-campuran.csv" download>↓ Unduh 200 soal campuran</a>
        <a className="button primary import-template-link" href="/contoh-import-bank-soal-v3.xlsx" download>↓ Unduh contoh Excel</a>
        <a className="button secondary import-template-link" href={`${API}/questions/import-template`} download>Unduh template CSV</a>
      </div>
      <p className="field-note import-help">Sheet Soal berada di urutan pertama dan bisa langsung diunggah; sheet Panduan menjelaskan formatnya. Isi kolom jawaban sesuai tipe soal dan kosongkan kolom yang tidak dipakai. Daftar ditulis satu item per baris dalam satu sel; variasi jawaban dipisahkan dengan <code>|</code>. Untuk gambar, isi URL gambar yang bisa dibuka siswa.</p>
      <p className="field-note import-help"><strong>Contoh:</strong> pilihan ganda memakai kolom Pilihan jawaban dan Nomor kunci pilihan (mis. <code>1</code>); pilihan ganda kompleks bisa memakai <code>1, 3</code>. Menjodohkan memakai format <code>istilah -&gt; pasangan</code>, satu pasangan per baris. Esai memakai kolom Rubrik esai.</p>
      <div className="import-type-guide"><strong>Tipe yang didukung</strong><span>Pilihan ganda</span><span>Pilihan ganda kompleks</span><span>Benar / salah</span><span>Jawaban singkat</span><span>Isian</span><span>Esai</span><span>Menjodohkan</span><span>Mengurutkan</span></div>
    </section>
    <section className="form-card import-card">
      <div className="editor-section-title"><div><h2>2. Unggah dan periksa</h2><p>Maksimal 500 soal dan ukuran file 10 MB per impor.</p></div></div>
      <form className="import-upload" onSubmit={preview}>
        <input id="question-import-file" className="input" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { setFile(event.target.files?.[0] || null); setRows([]); setMessage(""); }} />
        <button className="button primary" disabled={!file || busy}>{busy ? "Memeriksa…" : "Pratinjau file"}</button>
      </form>
      {message && <div className={`notice ${invalidCount ? "error" : ""}`} style={{ marginTop: 14 }}>{message}</div>}
      {rows.length > 0 && <>
        <div className="import-preview-heading"><h3>Pratinjau {rows.length} soal</h3><span>{invalidCount ? `${invalidCount} baris perlu diperbaiki` : duplicateCount ? `${duplicateCount} kemungkinan duplikat` : "Siap diimpor"}</span></div>
        <div className="table-wrap import-table-wrap"><table className="data-table"><thead><tr><th>Baris</th><th>Status</th><th>Pertanyaan</th><th>Tipe</th><th>Bobot</th><th>Masalah / peringatan</th></tr></thead><tbody>
          {rows.map((row) => { const errors = Object.values(row.errors || {}); const warnings = Object.values(row.warnings || {}); return <tr key={row.row} className={errors.length ? "import-row-invalid" : ""}><td>{row.row}</td><td><span className={`import-status ${errors.length ? "invalid" : warnings.length ? "warning" : "valid"}`}>{errors.length ? "Perlu diperbaiki" : warnings.length ? "Duplikat?" : "Valid"}</span></td><td>{row.question.prompt || "—"}</td><td>{typeNames[row.question.type] || row.question.type || "—"}</td><td>{row.question.points || "—"}</td><td>{errors.length ? errors.join(" · ") : warnings.length ? warnings.join(" · ") : "—"}</td></tr>; })}
        </tbody></table></div>
        <div className="form-actions"><button type="button" className="button primary" disabled={busy || invalidCount > 0} onClick={importAll}>{busy ? "Menyimpan…" : `Import ${rows.length} soal ke bank`}</button></div>
      </>}
    </section>
  </>;
}

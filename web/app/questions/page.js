"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { questionsApi } from "../../lib/api";
import CatalogSelect from "../../components/CatalogSelect";
const labels = {
  single_choice: "Pilihan ganda",
  multi_select: "Pilihan ganda kompleks",
  true_false: "Benar / salah",
  short_answer: "Jawaban singkat",
  fill_blank: "Isian",
  essay: "Esai",
  matching: "Menjodohkan",
  ordering: "Mengurutkan",
};
export default function QuestionsPage() {
  const router = useRouter();
  const [data, setData] = useState([]);
  const [filters, setFilters] = useState({});
  const [shownFilters, setShownFilters] = useState([]);
  const [error, setError] = useState("");
  const load = () =>
    questionsApi
      .list(filters)
      .then(setData)
      .catch((e) => setError(e.message));
  const filterOptions = [
    ["subject_id", "Mata pelajaran"], ["topic_id", "Topik"],
    ["tag", "Tag"], ["created_by", "Pembuat"], ["difficulty", "Tingkat kesulitan"], ["used", "Status pemakaian"],
  ];
  function removeFilter(key) {
    setShownFilters((current) => current.filter((item) => item !== key));
    setFilters((current) => { const next = { ...current }; delete next[key]; return next; });
  }
  useEffect(() => {
    load();
  }, [filters]);
  async function archive(id) {
    if (
      !window.confirm("Arsipkan soal ini? Soal tidak akan muncul di bank soal.")
    )
      return;
    try {
      await questionsApi.archive(id);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PERPUSTAKAAN SOAL</span>
          <h1>Bank soal</h1>
          <p>Kumpulan soal siap pakai untuk menyusun ujian.</p>
        </div>
        <div className="question-bank-actions">
          <Link className="button secondary" href="/questions/import">↓ Import soal</Link>
          <Link className="button primary" href="/questions/new"><span>＋</span> Tulis soal</Link>
        </div>
      </div>
      {error && (
        <div className="notice error">
          {error} Pastikan API Go sudah berjalan.
        </div>
      )}
      <div className="toolbar">
        <input
          className="input filter-search"
          placeholder="⌕  Cari pertanyaan atau kata kunci…"
          value={filters.q || ""}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <select
          className="select filter-select"
          value={filters.type || ""}
          onChange={(e) => setFilters({ ...filters, type: e.target.value })}
        >
          <option value="">Semua tipe soal</option>
          {Object.entries(labels).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className="select filter-select filter-add-select" aria-label="Tambah filter" value="" onChange={(event) => { const key = event.target.value; if (key && !shownFilters.includes(key)) setShownFilters((current) => [...current, key]); }}>
          <option value="">＋ Tambah filter</option>
          {filterOptions.filter(([key]) => !shownFilters.includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        {shownFilters.length > 0 && <div className="active-filter-list">
          {shownFilters.map((key) => <div className="filter-control" key={key}>
            {key === "subject_id" && <CatalogSelect kind="subjects" placeholder="Semua mata pelajaran" value={filters.subject_id || ""} onChange={(id) => setFilters({ ...filters, subject_id: id })} />}
            {key === "topic_id" && <CatalogSelect kind="topics" placeholder="Semua topik" value={filters.topic_id || ""} onChange={(id) => setFilters({ ...filters, topic_id: id })} />}
            {key === "tag" && <input className="input filter-select" placeholder="Tag" value={filters.tag || ""} onChange={(e) => setFilters({ ...filters, tag: e.target.value })} />}
            {key === "created_by" && <input className="input filter-select" placeholder="Pembuat" value={filters.created_by || ""} onChange={(e) => setFilters({ ...filters, created_by: e.target.value })} />}
            {key === "difficulty" && <select className="select filter-select" value={filters.difficulty || ""} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}><option value="">Semua tingkat</option>{["Mudah", "Sedang", "Sulit"].map((x) => <option key={x}>{x}</option>)}</select>}
            {key === "used" && <select className="select filter-select" value={filters.used || ""} onChange={(e) => setFilters({ ...filters, used: e.target.value })}><option value="">Status pemakaian</option><option value="true">Sudah dipakai</option><option value="false">Belum dipakai</option></select>}
            <button type="button" className="filter-remove" aria-label={`Hapus filter ${filterOptions.find(([id]) => id === key)?.[1]}`} onClick={() => removeFilter(key)}>×</button>
          </div>)}
        </div>}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pertanyaan</th>
              <th>Tipe</th>
              <th>Mata pelajaran</th>
              <th>Topik</th>
              <th>Kesulitan</th>
              <th>Bobot</th>
              <th>Dipakai</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {data.length ? (
              data.map((q) => (
                <tr
                  key={q.id}
                  className="question-bank-row"
                  tabIndex={0}
                  aria-label={`Buka soal: ${q.prompt}`}
                  onClick={(event) => {
                    if (event.target.closest("a, button, input, select, textarea")) return;
                    router.push(`/questions/${q.id}`);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      router.push(`/questions/${q.id}`);
                    }
                  }}
                >
                  <td>
                    <strong>
                      {q.prompt.length > 72
                        ? q.prompt.slice(0, 72) + "…"
                        : q.prompt}
                    </strong>
                  </td>
                  <td>
                    <span className="type-badge">
                      {labels[q.type] || q.type}
                    </span>
                  </td>
                  <td>{q.subject || "—"}</td>
                  <td>{q.topic || "—"}</td>
                  <td>{q.difficulty}</td>
                  <td>{q.points} poin</td>
                  <td>{q.used ? "Ya" : "Belum"}</td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/questions/${q.id}`}>Ubah</Link>
                      <button onClick={() => archive(q.id)}>Arsip</button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="table-empty">
                  {error
                    ? "Hubungkan API untuk memuat bank soal."
                    : "Belum ada soal yang cocok. Coba ubah filter atau tulis soal pertama."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="page-footer">
        <span>
          Menampilkan {data.length} soal <b>·</b> filter dapat digabung
        </span>
        <span>Bank soal · lintas kelas</span>
      </footer>
    </>
  );
}

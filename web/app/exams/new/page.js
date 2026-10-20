import ExamBuilder from "../../../components/exams/ExamBuilder";
export default function NewExamPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">UJIAN · DRAF BARU</span>
          <h1>Buat ujian</h1>
          <p>Atur jadwal dan susun soal untuk kelas 8A.</p>
        </div>
      </div>
      <ExamBuilder />
    </>
  );
}

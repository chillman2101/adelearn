import ExamBuilder from "../../../../components/exams/ExamBuilder";
export default async function EditExamPage({ params, searchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">UJIAN · UBAH DRAF</span>
          <h1>Ubah draf ujian</h1>
          <p>Perbarui pengaturan atau susunan soal sebelum diterbitkan.</p>
        </div>
      </div>
      <ExamBuilder initialId={id} initialStep={query?.step === "questions" ? "questions" : "settings"} />
    </>
  );
}

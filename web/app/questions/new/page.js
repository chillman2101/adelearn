import QuestionEditor from "../../../components/questions/QuestionEditor";
export default function NewQuestionPage() {
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BANK SOAL · SOAL BARU</span>
          <h1>Tulis soal baru</h1>
          <p>Buat satu soal yang dapat dipakai di beberapa ujian.</p>
        </div>
      </div>
      <QuestionEditor />
    </>
  );
}

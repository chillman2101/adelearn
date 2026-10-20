"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import QuestionEditor from "../../../components/questions/QuestionEditor";

function EditQuestionContent() {
  const { id } = useParams();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">BANK SOAL · EDIT</span>
          <h1>Ubah soal</h1>
          <p>
            Perubahan soal di bank tidak mengubah snapshot ujian yang sudah
            diterbitkan.
          </p>
        </div>
      </div>
      <QuestionEditor questionId={id} />
    </>
  );
}

export default function EditQuestionPage() {
  return (
    <Suspense fallback={<div className="notice">Memuat soal…</div>}>
      <EditQuestionContent />
    </Suspense>
  );
}

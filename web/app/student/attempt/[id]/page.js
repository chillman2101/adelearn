"use client";

import { useParams } from "next/navigation";
import StudentExamRunner from "../../../../components/student/StudentExamRunner";

export default function StudentAttemptPage() {
  const { id } = useParams();
  return <StudentExamRunner attemptId={id}/>;
}

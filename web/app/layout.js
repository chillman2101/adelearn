import { Suspense } from "react";
import AppFrame from "../components/AppFrame";
import ToastProvider from "../components/ToastProvider";
import "./globals.css";

export const metadata = {
  title: "Adelearn · Ruang Guru",
  description: "Kelola bank soal dan ujian kelas",
};
export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <ToastProvider>
        <Suspense fallback={<div className="notice">Memuat halaman…</div>}><AppFrame><Suspense fallback={<div className="notice">Memuat halaman…</div>}>{children}</Suspense></AppFrame></Suspense>
        </ToastProvider>
      </body>
    </html>
  );
}

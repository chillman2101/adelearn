"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppSettingsProvider, SettingsDisplay } from "./AppSettings";
import SidebarNav from "./SidebarNav";
import StudentWorkspace from "./student/StudentWorkspace";

function TeacherWorkspace({ children }) {
  return <AppSettingsProvider><div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark">a</span><span><strong>adelearn</strong><small>RUANG GURU</small></span></Link>
      <div className="class-switch"><span className="eyebrow">KELAS AKTIF</span><SettingsDisplay variant="class" /></div>
      <SidebarNav />
      <div className="sidebar-bottom"><div className="teacher-avatar"><SettingsDisplay variant="initials" /></div><div><SettingsDisplay variant="teacher" /></div><button className="more" type="button" aria-label="Keluar" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/login"); }}>···</button></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><SettingsDisplay variant="year" /><div className="topbar-right"><span className="today-label">Ruang guru</span><div className="teacher-avatar mini"><SettingsDisplay variant="initials" /></div></div></header>
      <div className="content">{children}</div>
    </main>
  </div></AppSettingsProvider>;
}

export default function AppFrame({ children }) {
  const pathname = usePathname() || "/";
  if (pathname === "/login") return <div className="auth-page-shell">{children}</div>;
  if (pathname === "/student" || pathname.startsWith("/student/")) return <StudentWorkspace>{children}</StudentWorkspace>;
  return <TeacherWorkspace>{children}</TeacherWorkspace>;
}

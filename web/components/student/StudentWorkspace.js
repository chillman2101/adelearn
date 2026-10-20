"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const links = [{ href: "/student", label: "Ujian", icon: "▤" }, { href: "/student/settings", label: "Pengaturan", icon: "⚙" }];

export default function StudentWorkspace({ children }) {
  const pathname = usePathname() || "/student";
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    let live = true;
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()).then((value) => { if (live) setProfile(value.student || null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const activeAttempt = pathname.startsWith("/student/attempt/");
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return <div className={`app-shell student-shell${activeAttempt ? " student-exam-shell" : ""}`}>
    <aside className="sidebar student-sidebar">
      <Link href="/student" className="brand"><span className="brand-mark">a</span><span><strong>adelearn</strong><small>RUANG SISWA</small></span></Link>
      <nav className="nav" aria-label="Menu siswa"><span className="eyebrow nav-title">MENU</span>{links.map(({ href, label, icon }) => { const active = href === "/student" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} className={`nav-link${active ? " active" : ""}`} aria-current={active ? "page" : undefined}><span>{icon}</span>{label}</Link>; })}</nav>
      <div className="sidebar-bottom"><div className="teacher-avatar">{profile?.student_name?.slice(0, 1)?.toUpperCase() || "S"}</div><div><strong>{profile?.student_name || "Siswa"}</strong><small>{profile?.class_name || "Akun ujian"}</small></div><button className="more" type="button" aria-label="Keluar" onClick={logout}>···</button></div>
    </aside>
    <main className="workspace"><header className="topbar"><span className="breadcrumb">{profile?.exam_title || "Ujian"}</span><div className="topbar-right"><span className="today-label">{profile?.student_name || "Siswa"}</span><button type="button" className="student-logout" onClick={logout}>Keluar</button></div></header><div className={`content${activeAttempt ? " student-attempt-content" : ""}`}>{children}</div></main>
  </div>;
}

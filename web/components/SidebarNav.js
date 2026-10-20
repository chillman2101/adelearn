"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", icon: "⌂", label: "Ringkasan" },
  { href: "/exams", icon: "▤", label: "Manajemen ujian" },
  { href: "/questions", icon: "◈", label: "Bank soal" },
  { href: "/students", icon: "♙", label: "Siswa" },
  { href: "/settings", icon: "⚙", label: "Pengaturan" },
];

export function SidebarLinks({ pathname }) {
  return (
    <nav className="nav" aria-label="Menu utama">
      <span className="eyebrow nav-title">MENU UTAMA</span>
      {items.map(({ href, icon, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`nav-link${active ? " active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span>{icon}</span>{label}
          </Link>
        );
      })}
    </nav>
  );
}

export default function SidebarNav() {
  return <SidebarLinks pathname={usePathname() || "/"} />;
}

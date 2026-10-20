"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import PasswordInput from "../../components/PasswordInput";

export default function LoginPage() {
  const router = useRouter();
  const [role, setRole] = useState("teacher");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, ...(role === "teacher" ? { username } : { user_id: username }), password }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Login gagal.");
      router.replace(role === "student" ? "/student" : "/"); router.refresh();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <main className="auth-layout">
    <div className="brand auth-brand"><span className="brand-mark">a</span><span><strong>adelearn</strong><small>RUANG BELAJAR</small></span></div>
    <section className="form-card auth-card">
      <span className="eyebrow">SELAMAT DATANG</span><h1>Masuk ke Adelearn</h1><p>Pilih jenis akun, lalu masukkan kredensial yang diberikan.</p>
      <div className="auth-role-switch" role="tablist" aria-label="Jenis akun">
        <button type="button" role="tab" aria-selected={role === "student"} className={role === "student" ? "selected" : ""} onClick={() => { setRole("student"); setUsername(""); setError(""); }}>Siswa</button>
        <button type="button" role="tab" aria-selected={role === "teacher"} className={role === "teacher" ? "selected" : ""} onClick={() => { setRole("teacher"); setUsername(""); setError(""); }}>Guru</button>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <label className="field"><span>{role === "student" ? "ID pengguna" : "Username"}</span><input className="input" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} placeholder={role === "student" ? "Masukkan ID ujian" : "Masukkan username"}/></label>
        <label className="field"><span>Kata sandi</span><PasswordInput autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Masukkan kata sandi"/></label>
        {error && <div className="notice error" role="alert">{error}</div>}
        <button className="button primary auth-submit" disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</button>
      </form>
    </section>
  </main>;
}

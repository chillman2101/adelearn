import { NextResponse } from "next/server";
import { API_BASE, SESSION_COOKIE } from "./lib/server-auth";

async function backend(path, token) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(`${API_BASE}${path}`, { headers, cache: "no-store", signal: AbortSignal.timeout(2500) });
}

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  let session = null;
  let backendAvailable = true;

  try {
    if (token) {
      const response = await backend("/auth/session", token);
      if (response.ok) session = await response.json();
    }
  } catch {
    backendAvailable = false;
  }

  if (!backendAvailable) return NextResponse.next();
  if (pathname === "/login") {
    if (session) return NextResponse.redirect(new URL(session.role === "student" ? "/student" : "/", request.url));
    return NextResponse.next();
  }
  if (!session) {
    const response = NextResponse.redirect(new URL("/login", request.url));
    if (token) response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }

  const studentRoute = pathname === "/student" || pathname.startsWith("/student/");
  if (studentRoute && session.role !== "student") return NextResponse.redirect(new URL("/", request.url));
  if (!studentRoute && session.role !== "teacher") return NextResponse.redirect(new URL("/student", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

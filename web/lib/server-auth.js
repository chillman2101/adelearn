export const SESSION_COOKIE = "adelearn_session";
export const API_BASE = (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/v1").replace(/\/$/, "");

export async function callApi(path, token, options = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  return fetch(`${API_BASE}${path}`, { ...options, headers, cache: "no-store" });
}

export async function jsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  return Response.json(body, { status: response.status });
}

export function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 24 * 60 * 60 };
}

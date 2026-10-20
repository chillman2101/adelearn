import { cookies } from "next/headers";
import { callApi, jsonResponse, SESSION_COOKIE } from "../../../../lib/server-auth";

export async function GET() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return Response.json({ message: "Sesi tidak ditemukan." }, { status: 401 });
  try {
    return await jsonResponse(await callApi("/auth/session", token));
  } catch {
    return Response.json({ message: "Server API belum dapat dihubungi." }, { status: 503 });
  }
}

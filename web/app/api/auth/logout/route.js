import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { callApi, cookieOptions, SESSION_COOKIE } from "../../../../lib/server-auth";

export async function POST() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  try {
    if (token) await callApi("/auth/logout", token, { method: "POST" });
  } catch {}
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  return response;
}

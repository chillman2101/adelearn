import { NextResponse } from "next/server";
import { callApi, cookieOptions } from "../../../../lib/server-auth";

export async function POST(request) {
  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ message: "Format data tidak valid." }, { status: 400 });
  try {
    const upstream = await callApi("/auth/login", null, { method: "POST", body: JSON.stringify(body) });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return NextResponse.json(payload, { status: upstream.status });
    const response = NextResponse.json({ session: payload.session });
    response.cookies.set("adelearn_session", payload.token, cookieOptions());
    return response;
  } catch {
    return NextResponse.json({ message: "Server API belum dapat dihubungi." }, { status: 503 });
  }
}

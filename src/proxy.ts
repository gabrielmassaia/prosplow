import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

const publicPaths = ["/login", "/register"];
const authApiPrefix = "/api/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.includes(pathname) || pathname.startsWith(authApiPrefix)) {
    return NextResponse.next();
  }

  // Validação real de sessão (consulta o banco via Better Auth), não só presença do cookie.
  // Só é possível porque o Proxy (Next.js 16) sempre roda em runtime Node.js — o pool pg
  // usado pelo Drizzle não funcionaria em Edge Runtime.
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

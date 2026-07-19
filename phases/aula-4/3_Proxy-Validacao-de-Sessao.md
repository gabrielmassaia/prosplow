# Aula 4 — 3. Proxy: Validação Real de Sessão

> Parte de `aula-4`. Pré-requisito: `2_Metadata-Error-e-NotFound.md`. Próximo arquivo: `4_Verificacao-Armadilhas-e-Pendencias.md`.

## Task 4: Validação real de sessão no Proxy

Antes, o Proxy só olhava se o cookie de sessão existia — qualquer valor passava, e a invalidação real só acontecia depois, no Server Component, via `requireUser()`. Agora o Proxy chama `auth.api.getSession()` e só deixa passar se a sessão for válida no banco. Isso é possível porque o Proxy do Next.js 16 **sempre roda em runtime Node.js** — o pool `pg` do Drizzle não funcionaria em Edge.

- [ ] **Substituir o conteúdo de `src/proxy.ts`** pelo arquivo completo:

```typescript
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
```

**Armadilha:** não declare `export const runtime = "..."` no arquivo de Proxy — no Next.js 16 isso é erro de build (`Route segment config is not allowed in Proxy file... Proxy always runs on Node.js runtime`). O Proxy já roda em Node.js por padrão; não há nada a configurar.

**Trade-off (dito em voz alta na live):** isso adiciona uma query ao banco em toda requisição a rota protegida. Para um app de ensino/demo, o custo é aceitável e é o comportamento que o SPEC pede. Em altíssima escala, a recomendação do próprio Better Auth seria o oposto (checar só o cookie no edge e validar de verdade só na página) — as duas abordagens são válidas; aqui priorizamos segurança/simplicidade.


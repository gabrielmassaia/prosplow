# Aula 4 — 3. Proxy: Validação Real de Sessão

> Parte de `aula-4`. Pré-requisito: `2_Metadata-Error-e-NotFound.md`. Próximo arquivo: `4_Verificacao-Armadilhas-e-Pendencias.md`.

## Task 4: Validação real de sessão no Proxy

- [x] `src/proxy.ts`: removida a checagem de presença de cookie, substituída por:

```typescript
import { auth } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.includes(pathname) || pathname.startsWith(authApiPrefix)) {
    return NextResponse.next();
  }

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}
```

Não foi necessário (e não é permitido) declarar `export const runtime` — o Proxy do Next.js 16 já roda sempre em Node.js.


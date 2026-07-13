# Aula 1 — 6. Proxy de Proteção de Rotas

> Parte de `aula-1`. Pré-requisito: `5_Actions-Login-e-Cadastro.md`. Próximo arquivo: `7_UI-Paginas-Auth.md`.

---

### Passo 15 — Proxy de proteção de rotas (Next.js 16)

> **⚠️ Mudança importante do Next.js 16:** o arquivo `middleware.ts` foi renomeado para `proxy.ts` e a função exportada de `middleware` para `proxy`. Se você usar o nome antigo, o Next.js 16 ignora silenciosamente o arquivo — suas rotas ficam desprotegidas sem nenhum erro.

Crie `src/proxy.ts` (dentro de `src/`, ao lado de `app/`):

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const publicPaths = ["/login", "/register"];
const authApiPrefix = "/api/auth";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (publicPaths.includes(pathname) || pathname.startsWith(authApiPrefix)) {
    return NextResponse.next();
  }

  // Presença do cookie verificada aqui; validade real checada pelo requireUser() nos Server Components
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
```

**Por que checar o cookie na mão em vez de `getSessionCookie` do Better Auth?**

O Next.js 16 suporta Node.js runtime no proxy, então *daria* para chamar `auth.api.getSession()` aqui e validar a sessão de verdade. Mas não fazemos isso por uma razão importante: o proxy roda em **toda requisição**, incluindo arquivos estáticos, fontes e imagens. Validar a sessão no banco a cada request de imagem é desperdício — por isso o check aqui é só "esse cookie existe?", nunca "esse cookie é válido?".

A estratégia correta é em duas camadas:
- **`proxy.ts`** → check rápido de presença do cookie (UX: evita renderizar página antes de redirecionar)
- **`requireUser()` no layout/página** → validação real da sessão no banco (segurança)

**Por que o matcher exclui qualquer path com ponto (`.*\\..*`)?** Além das pastas internas do Next.js (`_next/static`, `_next/image`) e do favicon, qualquer arquivo estático servido da pasta `public/` (imagens, fontes, etc.) tem extensão no nome — o padrão evita rodar a checagem de sessão nesses assets.

**Importante:** o cookie só prova que existe uma sessão — nunca que ela é válida. Por isso o `requireUser()` nas páginas continua obrigatório: é a camada de segurança real.

> Na Fase 4 este mesmo arquivo troca a checagem de presença do cookie por uma validação real de sessão (`auth.api.getSession()`), aproveitando que o Proxy do Next.js 16 sempre roda em Node.js.

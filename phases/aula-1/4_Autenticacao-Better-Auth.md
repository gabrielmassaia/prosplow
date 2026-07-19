# Aula 1 — 4. Autenticação com Better Auth

> Parte de `aula-1`. Pré-requisito: `3_Dominio-e-Repositorios.md`. Próximo arquivo: `5_Actions-Login-e-Cadastro.md`.

---

### Passo 10 — Use case: criar usuário com empresa

Crie `src/use-cases/auth/CreateUserWithCompany.ts`:

```typescript
import { auth } from "@/lib/auth";
import type { ICompanyRepository } from "@/domain/repositories/ICompanyRepository";

interface Input {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

type Result = { ok: true } | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class CreateUserWithCompany {
  constructor(private companyRepo: ICompanyRepository) {}

  async execute({ name, email, password, companyName }: Input): Promise<Result> {
    try {
      // 1. Criar usuário via Better Auth (server-side)
      const response = await auth.api.signUpEmail({
        body: { name, email, password },
        asResponse: true,
      });

      if (!response.ok) {
        const err = (await response.json()) as { message?: string };
        return { ok: false, error: err.message ?? "Erro ao criar usuário" };
      }

      const data = (await response.json()) as { user: { id: string } };
      const userId = data.user.id;

      // 2. Gerar slug da empresa
      const slug = slugify(companyName);

      // 3. Criar empresa + membro em transação
      await this.companyRepo.create({ name: companyName, slug, ownerId: userId });

      return { ok: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Erro inesperado";
      return { ok: false, error: message };
    }
  }
}
```

**Por que `asResponse: true`?** Chamar `auth.api.signUpEmail` de dentro de uma Server Action com esse parâmetro é o que permite ao plugin `nextCookies()` (configurado logo abaixo) interceptar o `Set-Cookie` da resposta e aplicá-lo via `next/headers` — a sessão já fica ativa assim que o cadastro termina, sem precisar de uma chamada extra do client SDK. Esse mesmo mecanismo é reaproveitado no Server Action de login (ver `5_Actions-Login-e-Cadastro.md`).

**Por que o use case importa `auth` diretamente?**
O Better Auth é a fronteira de autenticação do sistema — ele gera o usuário, a sessão e o token. Não faz sentido abstrair isso em um repositório porque não vamos trocar de biblioteca de auth sem reescrever essa camada inteira de qualquer forma. A criação de empresa via `ICompanyRepository`, sim, abstraímos porque o banco pode mudar.

---

### Passo 11 — Configurar Better Auth

Crie `src/lib/auth.ts`:

```typescript
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/infrastructure/db";
import * as schema from "@/infrastructure/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: false,
    schema,
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        const bcrypt = await import("bcryptjs");
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        const bcrypt = await import("bcryptjs");
        return await bcrypt.compare(password, hash);
      },
    },
  },
  user: { modelName: "usersTable" },
  session: { modelName: "sessionsTable" },
  account: { modelName: "accountsTable" },
  verification: { modelName: "verificationsTable" },
  plugins: [nextCookies()],
});
```

**Por que `schema` inteiro em vez de mapear campo a campo?** O módulo `schema.ts` só tem uma tabela chamada `users`, `sessions`, `accounts` e `verifications` no sentido que o Better Auth espera — passar o módulo inteiro deixa o `drizzleAdapter` descobrir sozinho. O nome real de cada tabela (`usersTable`, não `users`) é informado à parte, via `user: { modelName: "usersTable" }` etc.

**Por que não passamos `secret` explicitamente?** O Better Auth lê `BETTER_AUTH_SECRET` do `process.env` sozinho quando a opção não é informada — não precisa repetir.

**Por que `await import("bcryptjs")` em vez de import estático?**
O `bcryptjs` é pesado. Importar dinamicamente dentro das funções de hash/verify significa que o módulo só é carregado quando realmente necessário (no login ou cadastro), não em cada request.

**Por que `plugins: [nextCookies()]`?**
No Next.js, Server Actions não conseguem setar cookies diretamente via `Set-Cookie` header — o Next.js bloqueia isso por segurança. O plugin `nextCookies()` do Better Auth intercepta as respostas e usa o helper `cookies()` do Next.js para setar os cookies corretamente. Sem esse plugin, o signup via Server Action cria o usuário no banco mas **não seta a sessão** — o usuário é redirecionado para `/prospeccao` mas está deslogado, o que causa confusão total. Deve ser sempre o **último plugin** no array.

---

Crie `src/lib/auth-client.ts`:

```typescript
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

Este arquivo é importado apenas em componentes `"use client"`. Login e cadastro **não** o usam — ambos são Server Actions (ver `5_Actions-Login-e-Cadastro.md`). Ele só entra em cena mais adiante, no botão de logout da Sidebar (`authClient.signOut()`), a única operação de auth que ainda faz sentido disparar direto do client.

---

### Passo 12 — Helpers de tenant

Crie `src/lib/tenant.ts`:

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";
import { auth } from "@/lib/auth";

export async function requireUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

export async function requireCompany(userId: string) {
  const companyRepo = new DrizzleCompanyRepository(db);
  const company = await companyRepo.findByUserId(userId);

  if (!company) {
    redirect("/login");
  }

  return { companyId: company.id, company };
}
```

> **Por que `requireCompany` usa o repositório e não uma query solta?**
> O `DrizzleCompanyRepository` (criado em `3_Dominio-e-Repositorios.md`) já tem exatamente
> essa consulta em `findByUserId`. Reaproveitar o repositório em vez de reescrever o `join`
> aqui mantém o acesso ao banco concentrado na camada de infraestrutura — o `lib/tenant.ts`
> orquestra sessão + empresa, mas não conhece tabelas nem Drizzle.

**Por que `requireUser` chama `redirect()` e não retorna null?**
O `redirect()` do Next.js lança uma exceção especial que aborta a execução do Server Component e envia o cabeçalho HTTP 307. Isso garante que o código depois de `requireUser()` nunca executa se o usuário não estiver autenticado — sem precisar de `if (!user) return` em todo lugar. `requireCompany()` segue a mesma lógica: se não achar empresa vinculada, redireciona em vez de devolver `company: null` — assim nenhuma página protegida precisa tratar o caso "usuário sem empresa".

**Por que `requireCompany` faz a query direto em vez de passar por `DrizzleCompanyRepository`?**
`tenant.ts` é um helper de infraestrutura cross-cutting, chamado em praticamente toda página protegida — não é lógica de negócio, é resolução de sessão/tenant. Passar por um repositório aqui não traria nenhum ganho de Clean Architecture (não existe uma regra de negócio pra isolar, nem um "use case" fazendo essa chamada) — só adicionaria uma camada de indireção sem propósito. `ICompanyRepository`/`DrizzleCompanyRepository` continuam existindo e são usados de verdade no use case de cadastro (`CreateUserWithCompany`, Passo 10), que é onde a regra de negócio (criar empresa + membro em transação) de fato mora.

Este arquivo ganha um terceiro helper, `redirectIfAuthenticated()`, no próximo passo (`5_Actions-Login-e-Cadastro.md`) — junto com as Server Actions de login/signup, para manter os três helpers de tenant no mesmo lugar conceitual.

---

### Passo 13 — Route Handler do Better Auth

Crie `src/app/api/auth/[...all]/route.ts`:

```typescript
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { POST, GET } = toNextJsHandler(auth);
```

O `[...all]` é um catch-all route do Next.js. Captura qualquer rota em `/api/auth/*`:
- `/api/auth/sign-in/email`
- `/api/auth/sign-up/email`
- `/api/auth/sign-out`
- `/api/auth/get-session`
- etc.

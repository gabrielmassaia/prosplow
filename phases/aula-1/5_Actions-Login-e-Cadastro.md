# Aula 1 — 5. Server Actions de Login e Cadastro

> Parte de `aula-1`. Pré-requisito: `4_Autenticacao-Better-Auth.md`. Próximo arquivo: `6_Proxy-Protecao-de-Rotas.md`.

---

### Passo 14 — Server Action de signup

Crie `src/app/actions/auth/signup.ts`:

```typescript
"use server";

import { z } from "zod";

import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";
import { CreateUserWithCompany } from "@/use-cases/auth/CreateUserWithCompany";

const signupSchema = z.object({
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres"),
  companyName: z.string().min(2, "Nome da empresa deve ter ao menos 2 caracteres"),
});

export async function signupAction(formData: {
  name: string;
  email: string;
  password: string;
  companyName: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = signupSchema.safeParse(formData);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const companyRepo = new DrizzleCompanyRepository(db);
  const useCase = new CreateUserWithCompany(companyRepo);

  return useCase.execute(parsed.data);
}
```

Repare como a action é fina: valida o input com Zod, instancia as dependências concretas, passa para o use case, retorna o resultado. Nenhuma lógica de negócio aqui — a validação de formato fica na action (é responsabilidade do controller), as regras de negócio ficam no use case.

> **Convenção de nome:** toda Server Action termina com o sufixo `Action` (`signupAction`, `loginAction`, e mais tarde `createNicheAction`, `moveLeadAction`...). É o que deixa óbvio, em qualquer import de componente, que aquilo é uma função que roda no servidor — e não um helper client qualquer.

---

### Login e registro — Server Components + Server Actions, sem client SDK

`signup.ts` já é uma Server Action que chama `auth.api.signUpEmail(...)` direto (nada de rota `/api/auth` sendo usada pelo client). O login segue o mesmo caminho, usando o plugin `nextCookies()` já configurado em `src/lib/auth.ts` (ver `4_Autenticacao-Better-Auth.md`) — ele aplica o cookie de sessão automaticamente quando `auth.api.*` é chamado de dentro de uma Server Action (`asResponse: true` é o que permite ao plugin ler o `Set-Cookie` da resposta).

Crie `src/app/actions/auth/login.ts`:

```typescript
"use server";

import { z } from "zod";

import { auth } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export async function loginAction(formData: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = loginSchema.safeParse(formData);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const response = await auth.api.signInEmail({ body: parsed.data, asResponse: true });

  if (!response.ok) {
    const err = (await response.json()) as { message?: string };
    return { ok: false, error: err.message ?? "Credenciais inválidas" };
  }

  return { ok: true };
}
```

Adicione `redirectIfAuthenticated()` em `src/lib/tenant.ts`, ao lado de `requireUser()`/`requireCompany()`. Quem já tem sessão ativa não deveria conseguir abrir `/login` ou `/register` de novo:

```typescript
export async function redirectIfAuthenticated(destination = "/prospeccao") {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    redirect(destination);
  }
}
```

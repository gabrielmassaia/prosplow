# Setup: Next.js 16 + Better Auth + Neon (Drizzle ORM)

Este guia leva você de `npx create-next-app@latest` até um sistema funcional com **autenticação completa**, **banco de dados PostgreSQL (Neon)**, **multi-tenant** (usuários e empresas) e **sessão protegida**.

---

## Índice

1. [Stack e Propósito](#1-stack-e-propósito)
2. [Criação do Projeto](#2-criação-do-projeto)
3. [Neon Database](#3-neon-database)
4. [Drizzle ORM — Configuração e Conexão](#4-drizzle-orm--configuração-e-conexão)
5. [Schema do Banco — Better Auth + Multi-tenant](#5-schema-do-banco--better-auth--multi-tenant)
6. [Better Auth — Servidor (`auth.ts`)](#6-better-auth--servidor-authts)
7. [Better Auth — Cliente React (`auth-client.ts`)](#7-better-auth--cliente-react-auth-clientts)
8. [API Route Handler — `[...all]/route.ts`](#8-api-route-handler--allroutets)
9. [Helpers de Tenant — `tenant.ts`](#9-helpers-de-tenant--tenantts)
10. [Páginas de Login e Register](#10-páginas-de-login-e-register)
11. [Middleware para Rotas Protegidas](#11-middleware-para-rotas-protegidas)
12. [Variáveis de Ambiente](#12-variáveis-de-ambiente)
13. [Comandos para Rodar](#13-comandos-para-rodar)

---

## 1. Stack e Propósito

### Stack

| Camada | Tecnologia | Função |
|---|---|---|
| Framework | Next.js 16 (App Router) | Frontend + API routes (fullstack) |
| Banco | Neon (PostgreSQL serverless) | Dados persistentes |
| ORM | Drizzle ORM | Type-safe, migrations, queries |
| Autenticação | Better Auth | Login, register, sessão, OAuth, providers |
| Senha | bcryptjs | Hash de senha |
| Validação | Zod | Schema validation |

### Propósito de cada arquivo

```
/
├── .env                          # Variáveis de ambiente (DATABASE_URL, BETTER_AUTH_SECRET, etc.)
├── drizzle.config.ts             # Config do Drizzle Kit (dialeto, schema, URL)
├── src/
│   ├── db/
│   │   ├── index.ts              # Pool PostgreSQL + instância Drizzle (singleton)
│   │   └── schema.ts             # Todas as tabelas: Better Auth + Companies + Members
│   ├── lib/
│   │   ├── auth.ts               # Instância do servidor Better Auth (config central)
│   │   ├── auth-client.ts        # Cliente React do Better Auth (hooks no front)
│   │   └── tenant.ts             # Helpers requireUser() e requireCompany()
│   └── app/
│       ├── api/
│       │   └── auth/
│       │       └── [...all]/
│       │           └── route.ts   # Handler universal do Better Auth (POST/GET)
│       ├── (auth)/
│       │   ├── login/page.tsx     # Página de login
│       │   ├── register/page.tsx  # Página de cadastro
│       │   └── layout.tsx         # Layout do grupo (auth)
│       ├── dashboard/
│       │   └── page.tsx           # Home autenticada
│       └── layout.tsx             # Layout raiz
```

---

## 2. Criação do Projeto

```bash
npx create-next-app@latest meu-projeto --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd meu-projeto
```

Instale as dependências:

```bash
npm install drizzle-orm drizzle-kit pg @types/pg better-auth bcryptjs zod
npm install @types/bcryptjs -D
```

> `drizzle-kit` vai em `devDependencies` (junto com `@types/pg`). O resto vai em `dependencies`.

---

## 3. Neon Database

1. Crie uma conta em [neon.tech](https://neon.tech)
2. Crie um projeto (escolha a região mais próxima)
3. Copie a **connection string** — algo como:
   ```
   postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```

> A string é usada na variável `DATABASE_URL` do `.env`.

---

## 4. Drizzle ORM — Configuração e Conexão

### `drizzle.config.ts`

Localizado na raiz do projeto. Informa ao Drizzle Kit onde está o schema, qual banco, e a URL.

```ts
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" }); // ou .env.development

export default defineConfig({
  out: "./drizzle",          // pasta onde as migrations são geradas
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

> **Por que:** Sem ele, `drizzle-kit push` e `drizzle-kit generate` não sabem onde está o schema nem para qual banco conectar.

### `src/db/index.ts`

Cria um **Pool** de conexão PostgreSQL e a instância Drizzle. É o ponto de entrada para qualquer query.

```ts
import "dotenv/config";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

declare global {
  var __drizzlePool: Pool | undefined;
}

let connectionString = process.env.DATABASE_URL!;

// Compatibilidade SSL com Neon (remove warning do node-postgres)
if (!connectionString.includes("uselibpqcompat")) {
  connectionString += connectionString.includes("?") ? "&" : "?";
  connectionString += "uselibpqcompat=true";
}

const pool =
  global.__drizzlePool ??
  new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

if (!global.__drizzlePool) {
  global.__drizzlePool = pool;
}

export const db = drizzle(pool, { schema });
```

> **Motivo:** O Pool é mantido em `globalThis` para reuso em hot-reload (evita múltiplas conexões). O `drizzle(pool, { schema })` devolve um objeto `db` tipado com todas as tabelas.

---

## 5. Schema do Banco — Better Auth + Multi-tenant

### `src/db/schema.ts`

Better Auth exige **4 tabelas obrigatórias** com nomes e formatos específicos. A gente adiciona **companies** e **company_members** para o multi-tenant.

```ts
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ─────────────────────────────────────────
// TABELAS DO BETTER AUTH (OBRIGATÓRIAS)
// ─────────────────────────────────────────

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const sessionsTable = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
});

export const accountsTable = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verificationsTable = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});

// ─────────────────────────────────────────
// MULTI-TENANT
// ─────────────────────────────────────────

export const companiesTable = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const companyRoleEnum = pgEnum("company_role", ["owner", "member"]);

export const companyMembersTable = pgTable(
  "company_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: companyRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    companyUserUnique: uniqueIndex("company_members_company_user_unique").on(
      table.companyId,
      table.userId,
    ),
    companyIdIdx: index("company_members_company_id_idx").on(table.companyId),
  }),
);
```

> **Por que cada tabela:**
> - **users**, **sessions**, **accounts**, **verifications**: Exigidas pelo Better Auth para gerenciar autenticação, login social, recuperação de senha.
> - **companies**: Cada empresa/tenant no sistema.
> - **company_members**: Faz a ponte N:N entre usuários e empresas. Um usuário pode pertencer a múltiplas empresas. A role (`owner` ou `member`) define permissões básicas.

> **Como se conectam:** `sessions.userId -> users.id`, `accounts.userId -> users.id`, `company_members.userId -> users.id`, `company_members.companyId -> companies.id`.

---

## 6. Better Auth — Servidor (`auth.ts`)

### `src/lib/auth.ts`

Cria a **instância central de autenticação**. É usada tanto pelas API routes quanto pelos helpers server-side.

```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: false, // false = tabelas com nome igual ao do schema
    schema,
  }),
  baseURL: process.env.BETTER_AUTH_URL, // ex: http://localhost:3000
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
  user: {
    modelName: "usersTable",
  },
  session: {
    modelName: "sessionsTable",
  },
  account: {
    modelName: "accountsTable",
  },
  verification: {
    modelName: "verificationsTable",
  },
});
```

> **Como funciona:** O `drizzleAdapter` traduz as operações do Better Auth para queries Drizzle. O `modelName` mapeia cada entidade do BA para a tabela correta no schema. O `emailAndPassword` habilita login/senha com hash bcrypt.

> **Social providers** (Google, GitHub, etc.) podem ser adicionados no objeto `socialProviders`.

---

## 7. Better Auth — Cliente React (`auth-client.ts`)

### `src/lib/auth-client.ts`

Cliente que expõe hooks e métodos React (`useSession`, `signIn`, `signUp`, etc.).

```ts
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
```

> **Uso:** Em componentes React, faça:
> ```ts
> import { authClient } from "@/lib/auth-client";
> const { data: session } = authClient.useSession();
> const { signIn, signUp } = authClient;
> ```

---

## 8. API Route Handler — `[...all]/route.ts`

### `src/app/api/auth/[...all]/route.ts`

Traduz as requisições HTTP para o Better Auth. É o **único endpoint** que o BA precisa.

```ts
import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/lib/auth";

export const { POST, GET } = toNextJsHandler(auth);
```

> **Motivo:** Better Auth expõe dezenas de endpoints internos (sign-in, sign-up, session, forgot-password, etc.). O `[...all]` (catch-all route) captura todos eles e delega para o `toNextJsHandler`.

> **Rotas que ficam disponíveis:**
> - `POST /api/auth/sign-in/email`
> - `POST /api/auth/sign-up/email`
> - `GET /api/auth/get-session`
> - `POST /api/auth/sign-out`
> - etc.

---

## 9. Helpers de Tenant — `tenant.ts`

### `src/lib/tenant.ts`

Funções reutilizáveis que toda página/action server-side vai chamar para saber **quem é o usuário** e **qual empresa está ativa**.

```ts
import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { companyMembersTable } from "@/db/schema";
import { auth } from "@/lib/auth";

const ACTIVE_COMPANY_COOKIE = "active_company_id";

// Protege a rota: redireciona para /login se não estiver autenticado
export async function requireUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

// Retorna a empresa ativa do usuário (baseada em cookie ou na primeira disponível)
export async function requireCompany(userId: string) {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  // Tenta pelo cookie (empresa selecionada)
  if (activeCompanyId) {
    const membership = await db.query.companyMembersTable.findFirst({
      where: and(
        eq(companyMembersTable.userId, userId),
        eq(companyMembersTable.companyId, activeCompanyId),
      ),
      with: {
        company: true,
      },
    });

    if (membership?.company) {
      return { companyId: activeCompanyId, company: membership.company, membership };
    }
  }

  // Fallback: pega a primeira empresa que o usuário tem acesso
  const membership = await db.query.companyMembersTable.findFirst({
    where: eq(companyMembersTable.userId, userId),
    with: {
      company: true,
    },
  });

  if (membership?.company) {
    return { companyId: membership.companyId, company: membership.company, membership };
  }

  return { companyId: null, company: null, membership: null };
}
```

> **Como usar:**
> ```ts
> // Em uma Server Component ou Server Action:
> const user = await requireUser();
> const { companyId, company } = await requireCompany(user.id);
> ```

> **Motivo:** Centraliza a lógica de "quem está logado" e "qual empresa está ativa" para evitar repetir `auth.api.getSession()` + query de membership em toda rota.

---

## 10. Páginas de Login e Register

### `src/app/(auth)/layout.tsx`

Agrupa as páginas de auth sem o layout do dashboard.

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center">{children}</div>;
}
```

### `src/app/(auth)/register/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = new FormData(e.currentTarget);
    const { data, error: err } = await authClient.signUp.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
      name: form.get("name") as string,
    });

    if (err) {
      setError(err.message || "Erro ao cadastrar");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-96 flex-col gap-4">
      <h1 className="text-2xl font-bold">Criar conta</h1>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <input name="name" placeholder="Nome" required className="border p-2 rounded" />
      <input name="email" type="email" placeholder="Email" required className="border p-2 rounded" />
      <input name="password" type="password" placeholder="Senha" required minLength={8} className="border p-2 rounded" />
      <button type="submit" className="bg-black text-white p-2 rounded">Cadastrar</button>
    </form>
  );
}
```

### `src/app/(auth)/login/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    const form = new FormData(e.currentTarget);
    const { data, error: err } = await authClient.signIn.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
    });

    if (err) {
      setError(err.message || "Erro ao fazer login");
      return;
    }

    router.push("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-96 flex-col gap-4">
      <h1 className="text-2xl font-bold">Entrar</h1>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <input name="email" type="email" placeholder="Email" required className="border p-2 rounded" />
      <input name="password" type="password" placeholder="Senha" required className="border p-2 rounded" />
      <button type="submit" className="bg-black text-white p-2 rounded">Entrar</button>
    </form>
  );
}
```

> **Como se conecta:** O `authClient.signIn.email()` faz um POST para `/api/auth/sign-in/email` (que é capturado pelo `[...all]/route.ts`), o Better Auth valida, gera a sessão, seta o cookie, e redireciona.

### `src/app/dashboard/page.tsx`

```tsx
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireUser, requireCompany } from "@/lib/tenant";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p>Bem-vindo, {user.name}!</p>
      <p>Email: {user.email}</p>
    </div>
  );
}
```

---

## 11. Middleware para Rotas Protegidas (Opcional)

### `src/middleware.ts`

Redireciona usuários não autenticados para o login antes mesmo de renderizar a página.

```ts
import { betterAuth } from "better-auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Rotas públicas que não precisam de auth
  const publicRoutes = ["/login", "/register"];
  if (publicRoutes.includes(request.nextUrl.pathname)) {
    return NextResponse.next();
  }

  // Verifica se tem cookie de sessão
  const sessionCookie = request.cookies.get("better-auth-session");
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

> **Nota:** Em produção, valide a sessão de verdade em vez de só checar o cookie. O `requireUser()` do `tenant.ts` já faz isso nas Server Components.

---

## 12. Variáveis de Ambiente

### `.env.local`

```env
# Neon PostgreSQL
DATABASE_URL=postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require

# Better Auth
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=cole-aqui-o-secret-gerado
```

Gere o secret com:

```bash
npx better-auth secret
```

> **`BETTER_AUTH_URL`:** Mude para a URL de produção quando fizer deploy.
> **`BETTER_AUTH_SECRET`:** Usado para encriptar tokens de sessão. Mantenha em segredo.

---

## 13. Comandos para Rodar

```bash
# 1. Gerar o secret do Better Auth
npx better-auth secret

# 2. Criar as tabelas no Neon (push direto)
npx drizzle-kit push

# OU (fluxo com migration):
npx drizzle-kit generate   # gera arquivos SQL em ./drizzle
npx drizzle-kit migrate    # aplica no banco

# 3. Rodar o dev server
npm run dev
```

> **`drizzle-kit push`:** Sincroniza o schema direto no banco (ideal para desenvolvimento). **`generate + migrate`** é o fluxo recomendado para staging/produção.

---

## Fluxo Completo (resumo)

```
Usuário acessa /register
  → Preenche formulário
  → authClient.signUp.email() → POST /api/auth/auth/sign-up/email
  → [...all]/route.ts → betterAuth.api.signUpEmail()
  → DrizzleAdapter → INSERT na tabela users + accounts
  → Seta cookie de sessão
  → Redireciona para /dashboard

Dashboard (Server Component)
  → requireUser() → auth.api.getSession() → valida cookie
  → Se inválido → redirect /login
  → Se válido → renderiza dashboard com user.name
```

---

> **Próximos passos sugeridos:**
> - Adicionar OAuth (Google, GitHub) no `socialProviders`
> - Criar fluxo de criação de empresa pós-registro
> - Adicionar `permissions` no `companyMembersTable` para RBAC
> - Página de seleção de empresa (troca o cookie `active_company_id`)
> - Sistema de convite por email para membros da empresa

# Fase 1 — Setup Base

> **Para a live:** Este documento é seu roteiro completo da Fase 1. Leia do início ao fim antes de abrir o editor.
> Tempo estimado: 2–3 horas ao vivo.
> Ao final desta fase: login, cadastro e proteção de rotas funcionando com banco real.

---

## O que foi construído nesta fase

| Arquivo | Propósito |
|---|---|
| `drizzle.config.ts` | Configura o Drizzle Kit (onde está o schema, qual banco, onde gerar migrations) |
| `.env.example` | Template das variáveis de ambiente necessárias |
| `src/infrastructure/db/index.ts` | Pool de conexão PostgreSQL singleton + instância Drizzle tipada |
| `src/infrastructure/db/schema.ts` | Todas as tabelas da Fase 1 (4 do Better Auth + companies + company_members) |
| `src/domain/repositories/IUserRepository.ts` | Contrato de repositório de usuário |
| `src/domain/repositories/ICompanyRepository.ts` | Contrato de repositório de empresa |
| `src/infrastructure/repositories/DrizzleCompanyRepository.ts` | Implementação concreta com Drizzle |
| `src/infrastructure/repositories/DrizzleUserRepository.ts` | Implementação concreta com Drizzle (ainda sem consumidor nesta fase — usado na Fase 4) |
| `src/use-cases/auth/CreateUserWithCompany.ts` | Lógica de negócio: criar usuário + empresa em transação |
| `src/lib/auth.ts` | Instância central do Better Auth (servidor) |
| `src/lib/auth-client.ts` | Cliente React do Better Auth (browser) |
| `src/lib/tenant.ts` | `requireUser()` e `requireCompany()` para proteger Server Components e actions |
| `src/app/api/auth/[...all]/route.ts` | Handler universal de autenticação |
| `src/app/actions/auth/signup.ts` | Server Action de cadastro (controller) |
| `src/app/(auth)/layout.tsx` | Layout público centralizado |
| `src/app/(auth)/login/page.tsx` | Página de login |
| `src/app/(auth)/register/page.tsx` | Página de cadastro |
| `src/app/(protected)/layout.tsx` | Layout protegido: `SidebarProvider` + `AppSidebar` + `SidebarInset` |
| `src/app/(protected)/prospeccao/page.tsx` | Página inicial protegida: header + empty-state (Fase 2 substitui pelo dashboard real) |
| `src/components/layout/Sidebar.tsx` | `AppSidebar` — construída sobre o bloco `sidebar` do shadcn/ui |
| `src/components/ui/sidebar.tsx` | Bloco `sidebar` do shadcn/ui (`npx shadcn add sidebar`) |
| `src/hooks/use-mobile.ts` | Hook usado pelo `sidebar` para detectar viewport mobile |
| `src/app/layout.tsx` | Root layout do Next.js |
| `src/proxy.ts` | Proteção de rotas — redireciona não-autenticados para `/login` |

---

## Conceitos que você precisa entender antes de codar

### 1. O que é Drizzle ORM e por que não usamos Prisma

**Drizzle** é um ORM TypeScript que representa o schema do banco como código TypeScript — não como um arquivo `.prisma` separado. Isso significa que os tipos das suas queries são inferidos diretamente das definições de tabela, sem geração de código intermediário.

```typescript
// Drizzle: você define assim
export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
});

// E usa assim — totalmente tipado, sem geração de código
const user = await db.query.usersTable.findFirst({
  where: eq(usersTable.email, "joao@email.com"),
});
// user é inferido como { id: string, name: string, email: string } | undefined
```

Por que não Prisma? O Prisma gera um cliente em `node_modules/.prisma/client` — isso cria problemas no Edge Runtime do Next.js e requer um passo extra de geração. O Drizzle funciona direto, sem geração, e tem suporte nativo ao `pg` pool que precisamos para o Neon.

---

### 2. Por que usamos Pool de conexão e não conexão direta

O Neon é um PostgreSQL serverless. Cada requisição ao Next.js pode criar uma nova função serverless. Se cada função abrisse uma conexão nova ao banco e não a encerrasse, em poucos segundos teríamos centenas de conexões abertas — o banco recusa novas conexões e a aplicação cai.

O **Pool** mantém um conjunto fixo de conexões abertas (no nosso caso, `max: 5`) e as reutiliza entre requisições. Quando uma requisição termina, a conexão volta pro pool, não é fechada.

```typescript
// SEM pool (errado para serverless)
const client = new Client({ connectionString }); // nova conexão a cada request
await client.connect();
// ...query...
await client.end(); // fecha — mas e se der erro antes?

// COM pool (correto)
const pool = new Pool({ connectionString, max: 5 });
// O pool gerencia abertura, reuso e encerramento automaticamente
```

O truque do `globalThis.__drizzlePool` evita que o pool seja recriado a cada hot-reload durante o desenvolvimento. Sem isso, ao salvar um arquivo você criaria um pool novo sem encerrar o anterior.

---

### 3. O que é Better Auth e como funciona o fluxo

**Better Auth** é uma biblioteca de autenticação que funciona 100% no servidor. Ela gerencia:
- Criação e validação de usuários (email + senha com bcrypt)
- Sessões com tokens seguros em cookies HTTP-only
- Rotas de API para todas as operações de auth

O fluxo completo de login:

```
Usuário → POST /api/auth/sign-in/email
         ↓
[...all]/route.ts recebe → toNextJsHandler(auth) despacha
         ↓
Better Auth valida email + senha no banco
         ↓
Cria registro em `sessions` + seta cookie `better-auth-session`
         ↓
Responde 200 com dados da sessão
         ↓
authClient.signIn.email() no browser recebe e redireciona
```

O cookie é HTTP-only — JavaScript do browser não consegue lê-lo. Isso previne XSS roubar a sessão.

---

### 4. Grupos de rotas no Next.js App Router: `(auth)` e `(protected)`

Parênteses no nome de uma pasta criam um **grupo de rotas** — a pasta existe na estrutura de arquivos mas não aparece na URL.

```
app/
├── (auth)/
│   ├── login/page.tsx     → URL: /login
│   └── register/page.tsx  → URL: /register
└── (protected)/
    └── prospeccao/page.tsx → URL: /prospeccao
```

Por que usamos isso? Para ter **layouts diferentes** sem afetar as URLs:
- `(auth)/layout.tsx` → tela centralizada, sem sidebar, sem autenticação
- `(protected)/layout.tsx` → com sidebar, verifica sessão

Se não usássemos grupos, teríamos que colocar tudo no mesmo layout e fazer lógica condicional feia.

---

### 5. O que é Clean Architecture e como aplicamos aqui

Clean Architecture é uma forma de organizar o código onde as **regras de negócio não dependem de frameworks**. Na prática:

**Camada de Domínio** (`src/domain/`) — define *contratos* (interfaces TypeScript). Não sabe que Drizzle existe.
```typescript
// ICompanyRepository.ts — só uma interface
export interface ICompanyRepository {
  create(data: { name: string; slug: string; ownerId: string }): Promise<Company>;
  findByUserId(userId: string): Promise<Company | null>;
}
```

**Camada de Infraestrutura** (`src/infrastructure/`) — implementa os contratos com ferramentas reais.
```typescript
// DrizzleCompanyRepository.ts — usa Drizzle, implementa a interface
export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DrizzleDB) {}

  async create(data) {
    return await this.db.transaction(async (tx) => { /* ... */ });
  }
}
```

**Use Cases** (`src/use-cases/`) — lógica de negócio. Recebe interfaces, não sabe que Drizzle existe.
```typescript
export class CreateUserWithCompany {
  constructor(private companyRepo: ICompanyRepository) {} // ← interface, não Drizzle

  async execute(input: Input) { /* orquestra a lógica */ }
}
```

**Controllers** (`src/app/actions/`) — único lugar que "conecta" as camadas. Instancia o concreto, passa para o use case.
```typescript
export async function signupAction(data) {
  "use server";
  const companyRepo = new DrizzleCompanyRepository(db); // ← escolha do concreto
  const useCase = new CreateUserWithCompany(companyRepo); // ← injeta a interface
  return useCase.execute(data);
}
```

**Por que isso importa na prática:** se amanhã trocarmos Neon por PlanetScale, só `DrizzleCompanyRepository` muda. O use case, a action e os componentes React continuam idênticos.

---

### 6. Server Actions vs Route Handlers no Next.js 16

**Server Actions** são funções com `"use server"` que rodam no servidor e podem ser chamadas diretamente de componentes React ou formulários.

```typescript
// app/actions/auth/signup.ts
"use server";
export async function signupAction(data: SignupInput) {
  // roda no servidor, pode acessar banco, variáveis de ambiente, etc.
}

// app/(auth)/register/page.tsx (client component)
"use client";
import { signupAction } from "@/app/actions/auth/signup";

const result = await signupAction({ name, email, password, companyName });
```

**Route Handlers** são arquivos `route.ts` que criam endpoints HTTP convencionais (GET, POST, etc.).

Usamos Server Actions para operações de negócio (criar empresa, mover lead) e Route Handlers só para o Better Auth (`[...all]/route.ts`) porque a biblioteca precisa de endpoints HTTP reais.

---

### 7. O que é Multi-tenancy e como implementamos

Multi-tenancy significa que um único sistema atende múltiplos clientes (tenants) isolados. No ProspFlow, cada **empresa** é um tenant.

O risco: sem isolamento, um usuário da empresa A poderia ver dados da empresa B.

Nossa solução: toda query ao banco inclui `WHERE company_id = ?` com o ID da empresa ativa na sessão.

```typescript
// SEGURO — filtra pelo tenant
const niches = await db
  .select()
  .from(prospectingNichesTable)
  .where(eq(prospectingNichesTable.companyId, companyId)); // ← sempre presente

// INSEGURO — vaza dados entre tenants
const niches = await db.select().from(prospectingNichesTable); // ❌
```

O `requireCompany(userId)` em `tenant.ts` extrai o `companyId` da sessão e do banco. Toda action começa com isso.

---

## Decisões técnicas e justificativas

### Por que `id` do usuário é `text` e não `uuid`?

**Decisão:** O Better Auth usa `text` como tipo de PK para a tabela `users`.

**Motivo:** O Better Auth gera IDs próprios no formato de strings (não UUIDs padrão PostgreSQL). Ele precisa controlar o formato do ID para garantir unicidade entre providers OAuth (Google, GitHub) e email/senha. Se forçarmos `uuid`, o adaptador quebra na inserção.

**Impacto:** As tabelas de negócio que referenciam `users.id` (como `company_members.user_id`) também precisam usar `text`, não `uuid`.

```typescript
// CORRETO
userId: text("user_id").notNull().references(() => usersTable.id)

// ERRADO — vai quebrar na FK
userId: uuid("user_id").notNull().references(() => usersTable.id)
```

---

### Por que usamos `db.transaction()` na criação de empresa?

**Cenário sem transação:**
1. Criamos a empresa ✅
2. Tentamos criar o `company_member` — falha por constraint ❌
3. Empresa existe no banco sem dono. Dado corrompido.

**Com transação:**
1. Abrimos transação
2. Criamos empresa
3. Criamos company_member
4. Se qualquer passo falhar → tudo é revertido (rollback automático)
5. Banco sempre consistente

```typescript
await db.transaction(async (tx) => {
  const [company] = await tx.insert(companiesTable).values({ name, slug, ownerId }).returning();
  await tx.insert(companyMembersTable).values({ companyId: company.id, userId: ownerId, role: "owner" });
  return company;
});
```

---

### Por que o repositório recebe `db` no construtor?

**Alternativa descartada:** importar `db` globalmente dentro do repositório.
```typescript
// ERRADO
import { db } from "@/infrastructure/db"; // acoplamento direto
export class DrizzleCompanyRepository {
  async create(data) { return db.insert(...) } // db hardcoded
}
```

**Por que é ruim:** não dá para trocar o `db` em testes unitários. O repositório está acoplado à implementação concreta do banco.

**Nossa abordagem:**
```typescript
// CORRETO
export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DrizzleDB) {} // recebe de fora

  async create(data) { return this.db.insert(...) }
}

// Na action, quem escolhe qual `db` usar:
const repo = new DrizzleCompanyRepository(db);
```

Em testes, você passa um `db` mockado. Em produção, passa o `db` real. O repositório não sabe a diferença.

---

## Passo a passo para replicar manualmente

### Passo 1 — Criar o projeto Next.js

```bash
npx create-next-app@latest prospflow \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd prospflow
```

**Flags explicadas:**
- `--typescript` → TypeScript habilitado (obrigatório para o projeto)
- `--tailwind` → Tailwind CSS v4 configurado automaticamente
- `--eslint` → linting configurado
- `--app` → usa App Router (não Pages Router — o ProspFlow usa App Router)
- `--src-dir` → coloca tudo dentro de `src/` (organização mais limpa)
- `--import-alias "@/*"` → permite `import { db } from "@/infrastructure/db"` em vez de `"../../../infrastructure/db"`

---

### Passo 2 — Instalar dependências

```bash
# Dependências de produção
npm install drizzle-orm pg better-auth bcryptjs zod

# Dependências de desenvolvimento
npm install -D drizzle-kit @types/pg @types/bcryptjs
```

**O que cada pacote faz:**
- `drizzle-orm` — o ORM em si (queries, schema, tipos)
- `pg` — driver PostgreSQL para Node.js (Drizzle precisa do driver, não inclui)
- `better-auth` — biblioteca de autenticação completa
- `bcryptjs` — hash de senhas (puro JavaScript, sem binários nativos — mais compatível com Vercel)
- `zod` — validação de schemas TypeScript em runtime
- `drizzle-kit` — CLI para migrations e push de schema (só em dev)
- `@types/pg` e `@types/bcryptjs` — tipos TypeScript das libs

---

### Passo 3 — Instalar shadcn/ui

```bash
npx shadcn@latest init
```

Quando perguntar, escolha:
- Style: base-nova
- Base color: Neutral
- CSS variables: Yes

```bash
npx shadcn@latest add button input label card
```

Isso cria `src/components/ui/` com os componentes base que a Fase 1 usa. `badge` só entra na Fase 2 (Task 1), quando passa a ser usado de fato — instalar antes disso deixaria um componente sem uso.

---

### Passo 4 — Criar variáveis de ambiente

Crie `.env.local` na raiz:

```env
DATABASE_URL=postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=cole_aqui_o_secret
```

Gere o `BETTER_AUTH_SECRET`:
```bash
npx better-auth secret
# Cole o valor gerado no .env.local
```

> **Se o comando acima falhar** (`npm error could not determine executable to run`), use a alternativa com Node.js nativo:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Isso gera 32 bytes aleatórios em hex — exatamente o que o Better Auth espera.

Crie também `.env.example` (sem valores reais — vai para o git):
```env
DATABASE_URL=
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=
```

**Onde pegar a `DATABASE_URL`:** acesse [neon.tech](https://neon.tech), crie um projeto, vá em "Connection string" e copie a string com `?sslmode=require`.

---

### Passo 5 — Configurar o Drizzle Kit

Crie `drizzle.config.ts` na raiz do projeto:

```typescript
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/infrastructure/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**O que este arquivo faz:**
- Diz ao `drizzle-kit` onde está o schema (`schema.ts`)
- Diz onde gerar os arquivos de migration (`./drizzle/`)
- Diz qual banco usar (`postgresql`) e como conectar (`DATABASE_URL`)
- O `config({ path: ".env.local" })` carrega as variáveis de ambiente antes do `defineConfig` usar `process.env`

---

### Passo 6 — Pool de conexão e instância Drizzle

Crie `src/infrastructure/db/index.ts`:

```typescript
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

declare global {
  var __drizzlePool: Pool | undefined;
}

let connectionString = process.env.DATABASE_URL!;

// Neon requer este parâmetro de compatibilidade SSL com node-postgres
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

**Pontos não óbvios:**
- `declare global { var __drizzlePool }` → declara a variável no escopo global do Node.js para TypeScript aceitar `global.__drizzlePool`
- `global.__drizzlePool ?? new Pool(...)` → se já existe um pool (hot-reload), reutiliza. Senão, cria.
- `uselibpqcompat=true` → o Neon usa um proxy SSL específico. Sem esse parâmetro, o `node-postgres` pode apresentar erros de SSL.
- `max: 5` → máximo de 5 conexões simultâneas. O Neon free tier suporta até 10.
- Não exportamos um tipo `DrizzleDB` compartilhado aqui — cada repositório declara localmente `type DB = NodePgDatabase<typeof schema>` (ver Passo 9). Evita acoplar a assinatura de todos os repositórios a um único ponto de export.

---

### Passo 7 — Schema do banco (Fase 1)

Crie `src/infrastructure/db/schema.ts`:

```typescript
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ── Better Auth — 4 tabelas obrigatórias ──────────────────────────────────

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

// ── Multi-tenant ───────────────────────────────────────────────────────────

export const companiesTable = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
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
    role: companyRoleEnum("role").default("owner").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    companyUserUnique: uniqueIndex("company_members_company_user_unique").on(
      t.companyId,
      t.userId
    ),
    companyIdIdx: index("company_members_company_id_idx").on(t.companyId),
  })
);
```

**Pontos importantes:**
- `usersTable.id` é `text` — obrigatório para o Better Auth funcionar
- `companiesTable.id` é `uuid` — tabelas de negócio usam UUID padrão do PostgreSQL
- `companiesTable.ownerId` é `text` porque referencia `usersTable.id` (que é `text`)
- `companyMembersTable.userId` é `text` pelo mesmo motivo
- `$onUpdate(() => new Date())` → atualiza `updated_at` automaticamente em qualquer UPDATE
- O segundo parâmetro de `pgTable()` recebe uma função para definir indexes e unique constraints

---

### Passo 8 — Interfaces de domínio

Crie as pastas:
```bash
mkdir -p src/domain/repositories
mkdir -p src/infrastructure/repositories
mkdir -p src/use-cases/auth
mkdir -p src/app/actions/auth
mkdir -p src/app/api/auth/'[...all]'
mkdir -p src/app/\(auth\)/login
mkdir -p src/app/\(auth\)/register
mkdir -p src/app/\(protected\)/prospeccao
mkdir -p src/lib
```

Crie `src/domain/repositories/IUserRepository.ts`:

```typescript
export interface IUserRepository {
  findById(id: string): Promise<{ id: string; name: string; email: string } | null>;
}
```

Crie `src/domain/repositories/ICompanyRepository.ts`:

```typescript
export interface ICompanyRepository {
  create(data: {
    name: string;
    slug: string;
    ownerId: string;
  }): Promise<{ id: string; name: string; slug: string }>;

  findByUserId(userId: string): Promise<{ id: string; name: string; slug: string } | null>;
}
```

**Por que interfaces simples aqui?** Na Fase 1 só precisamos criar e buscar empresa. Não vale a pena criar uma interface com 10 métodos que ainda não existem. YAGNI — You Ain't Gonna Need It. A interface cresce conforme os use cases precisam.

---

### Passo 9 — Implementação dos repositórios (empresa e usuário)

Crie `src/infrastructure/repositories/DrizzleCompanyRepository.ts`:

```typescript
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { companiesTable, companyMembersTable } from "@/infrastructure/db/schema";
import type { ICompanyRepository } from "@/domain/repositories/ICompanyRepository";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DB) {}

  async create(data: { name: string; slug: string; ownerId: string }) {
    return await this.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companiesTable)
        .values({ name: data.name, slug: data.slug, ownerId: data.ownerId })
        .returning({ id: companiesTable.id, name: companiesTable.name, slug: companiesTable.slug });

      await tx.insert(companyMembersTable).values({
        companyId: company.id,
        userId: data.ownerId,
        role: "owner",
      });

      return company;
    });
  }

  async findByUserId(userId: string) {
    const result = await this.db
      .select({
        id: companiesTable.id,
        name: companiesTable.name,
        slug: companiesTable.slug,
      })
      .from(companyMembersTable)
      .innerJoin(companiesTable, eq(companyMembersTable.companyId, companiesTable.id))
      .where(eq(companyMembersTable.userId, userId))
      .limit(1);

    return result[0] ?? null;
  }
}
```

**Pontos importantes:**
- `implements ICompanyRepository` → TypeScript garante que todos os métodos da interface estão implementados
- `private db: DB` → injeção de dependência. O `db` vem de fora, não é importado aqui. `DB` é declarado localmente como `NodePgDatabase<typeof schema>` em vez de vir de um tipo compartilhado — cada repositório define seu próprio alias (mesmo padrão repetido nos repositórios da Fase 2).
- `.returning({ id, name, slug })` → o Drizzle retorna só os campos que pedimos, já tipados
- `result[0] ?? null` → `findFirst` no Drizzle com `.select()` retorna um array; pegamos o primeiro ou null

Crie também `src/infrastructure/repositories/DrizzleUserRepository.ts` — a implementação de `IUserRepository` (Passo 8). Ela ainda não é chamada por nenhum use case desta fase, mas faz parte dos entregáveis obrigatórios da estrutura de pastas (ver AGENTS.md) porque a Fase 4 vai precisar de `findById` para o convite de membros por email:

```typescript
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { usersTable } from "@/infrastructure/db/schema";
import type { IUserRepository } from "@/domain/repositories/IUserRepository";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleUserRepository implements IUserRepository {
  constructor(private db: DB) {}

  async findById(id: string) {
    const result = await this.db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);

    return result[0] ?? null;
  }
}
```

**Por que criar um repositório que ninguém usa ainda?** É a mesma exceção ao YAGNI que abrimos para `IUserRepository` no Passo 8: a interface e a implementação concreta já nascem junto com o resto da camada de infraestrutura porque o contrato (`findById`) é trivial e estável — não vai mudar quando o use case de convite de membros (Fase 4) precisar dele. Diferente de deixar métodos especulativos numa interface grande, aqui é uma implementação completa de um contrato já fechado.

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
    .replace(/[\u0300-\u036f]/g, "")
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

**Por que `asResponse: true`?** Chamar `auth.api.signUpEmail` de dentro de uma Server Action com esse parâmetro é o que permite ao plugin `nextCookies()` (configurado no Passo 11) interceptar o `Set-Cookie` da resposta e aplicá-lo via `next/headers` — a sessão já fica ativa assim que o cadastro termina, sem precisar de uma chamada extra do client SDK. Esse mesmo mecanismo é reaproveitado no Server Action de login (ver "Login e registro" mais abaixo).

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

Este arquivo é importado apenas em componentes `"use client"`. Login e cadastro **não** o usam — ambos são Server Actions (ver "Login e registro" mais abaixo). Ele só entra em cena mais adiante, no botão de logout da Sidebar (`authClient.signOut()`), a única operação de auth que ainda faz sentido disparar direto do client.

---

### Passo 12 — Helpers de tenant

Crie `src/lib/tenant.ts`:

```typescript
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/infrastructure/db";
import { companiesTable, companyMembersTable } from "@/infrastructure/db/schema";
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
  const result = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      slug: companiesTable.slug,
    })
    .from(companyMembersTable)
    .innerJoin(companiesTable, eq(companyMembersTable.companyId, companiesTable.id))
    .where(eq(companyMembersTable.userId, userId))
    .limit(1);

  if (!result[0]) {
    redirect("/login");
  }

  return { companyId: result[0].id, company: result[0] };
}
```

**Por que `requireUser` chama `redirect()` e não retorna null?**
O `redirect()` do Next.js lança uma exceção especial que aborta a execução do Server Component e envia o cabeçalho HTTP 307. Isso garante que o código depois de `requireUser()` nunca executa se o usuário não estiver autenticado — sem precisar de `if (!user) return` em todo lugar. `requireCompany()` segue a mesma lógica: se não achar empresa vinculada, redireciona em vez de devolver `company: null` — assim nenhuma página protegida precisa tratar o caso "usuário sem empresa".

**Por que `requireCompany` faz a query direto em vez de passar por `DrizzleCompanyRepository`?**
`tenant.ts` é um helper de infraestrutura cross-cutting, chamado em praticamente toda página protegida — não é lógica de negócio, é resolução de sessão/tenant. Passar por um repositório aqui não traria nenhum ganho de Clean Architecture (não existe uma regra de negócio pra isolar, nem um "use case" fazendo essa chamada) — só adicionaria uma camada de indireção sem propósito. `ICompanyRepository`/`DrizzleCompanyRepository` continuam existindo e são usados de verdade no use case de cadastro (`CreateUserWithCompany`, Passo 10), que é onde a regra de negócio (criar empresa + membro em transação) de fato mora.

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

export async function signup(formData: {
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

---

### Passo 16 — Layouts e páginas

Crie `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ProspFlow",
  description: "Prospecção ativa e gestão comercial para agências",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
```

O `<Toaster>` do `sonner` **não** entra nesta fase — o pacote só é instalado na Fase 2 (junto com `react-hook-form`, `date-fns`, `lucide-react`). Ele será adicionado a este mesmo arquivo lá, quando as primeiras ações de nichos/campanhas passarem a disparar toasts de sucesso/erro.

Crie `src/app/(auth)/layout.tsx`:

> Layout de duas colunas: painel esquerdo com marca/tagline/features (só desktop), painel direito com o formulário — `{children}` recebe `LoginForm`/`RegisterForm` dentro de um card.

```tsx
import { BarChart2, Crosshair, MapPin, Shield, Sparkles } from "lucide-react";

const features = [
  {
    icon: MapPin,
    title: "Busca geolocalizada de leads",
    description: "Encontre empresas por nicho e localização em segundos via mapa interativo.",
  },
  {
    icon: Sparkles,
    title: "Diagnóstico e mensagem com IA",
    description: "Gere análises do negócio e mensagens personalizadas automaticamente.",
  },
  {
    icon: BarChart2,
    title: "Funil comercial completo",
    description: "Acompanhe cada lead do primeiro contato até o fechamento.",
  },
  {
    icon: Shield,
    title: "Multi-agências com isolamento",
    description: "Gerencie múltiplos clientes com dados 100% separados e seguros.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen lg:h-screen">
      {/* ── Painel esquerdo — brand (50%) ──────────────────────────── */}
      <div className="relative hidden overflow-hidden bg-primary lg:flex lg:w-1/2">
        {/* Decorative blobs */}
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/[0.05]" />
        <div className="absolute -bottom-40 -left-20 h-[480px] w-[480px] rounded-full bg-white/[0.05]" />
        <div className="absolute bottom-32 right-10 h-52 w-52 rounded-full bg-white/[0.05]" />

        <div className="relative flex flex-1 flex-col p-12 xl:p-16">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/20">
              <Crosshair className="h-[15px] w-[15px] text-white" strokeWidth={2.5} />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white">ProspFlow</span>
          </div>

          {/* Tagline */}
          <div className="mt-12">
            <h2 className="text-[2.2rem] font-bold leading-[1.15] tracking-tight text-white xl:text-[2.6rem]">
              Prospecte mais,
              <br />
              feche mais.
            </h2>
            <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-white/65 xl:text-[15px]">
              O sistema de prospecção ativa para agências de marketing digital que querem crescer
              sem depender de indicações.
            </p>

            {/* Features */}
            <ul className="mt-10 space-y-5">
              {features.map(({ icon: Icon, title, description }) => (
                <li key={title} className="flex items-start gap-3.5">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15">
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-white">{title}</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-white/55">
                      {description}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* Footer */}
          <p className="mt-12 text-[11px] text-white/35">
            © 2025 ProspFlow · Todos os direitos reservados
          </p>
        </div>
      </div>

      {/* ── Painel direito — form (50%) ─────────────────────────────── */}
      <div className="flex flex-1 flex-col lg:w-1/2 lg:flex-none">
        {/* Dot-grid background */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden lg:block lg:w-1/2"
          style={{
            backgroundImage:
              "radial-gradient(circle, oklch(0.511 0.243 264 / 0.06) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Mobile header */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-6 lg:hidden">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Crosshair className="h-[13px] w-[13px] text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-foreground">
            ProspFlow
          </span>
        </div>

        {/* Form area */}
        <div className="relative flex flex-1 items-center justify-center p-8">
          {/* Card container */}
          <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-8 shadow-sm">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Login e registro — Server Components + Server Actions, sem client SDK

`signup.ts` já é uma Server Action que chama `auth.api.signUpEmail(...)` direto (nada de rota `/api/auth` sendo usada pelo client). O login segue o mesmo caminho, usando o plugin `nextCookies()` já configurado em `src/lib/auth.ts` — ele aplica o cookie de sessão automaticamente quando `auth.api.*` é chamado de dentro de uma Server Action (`asResponse: true` é o que permite ao plugin ler o `Set-Cookie` da resposta).

- [ ] **Criar `src/app/actions/auth/login.ts`**

```typescript
"use server";

import { z } from "zod";

import { auth } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export async function login(formData: {
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

- [ ] **Adicionar `redirectIfAuthenticated()` em `src/lib/tenant.ts`**

Ao lado de `requireUser()`/`requireCompany()`. Quem já tem sessão ativa não deveria conseguir abrir `/login` ou `/register` de novo:

```typescript
export async function redirectIfAuthenticated(destination = "/prospeccao") {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session?.user) {
    redirect(destination);
  }
}
```

- [ ] **Criar `src/app/(auth)/login/page.tsx`** — Server Component fino: só checa a sessão e renderiza o form. Sem `Suspense`/skeleton aqui — diferente das páginas de listagem da Fase 2, não há nenhum dado pra buscar antes de renderizar.

```tsx
import type { Metadata } from "next";

import { redirectIfAuthenticated } from "@/lib/tenant";

import { LoginForm } from "./_components/LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Entrar" };
}

export default async function LoginPage() {
  await redirectIfAuthenticated();

  return <LoginForm />;
}
```

- [ ] **Criar `src/app/(auth)/login/_components/LoginForm.tsx`** — toda a interatividade (estado, `handleSubmit`, toggle de mostrar/ocultar senha) fica aqui, chamando `login(...)` no lugar do client SDK:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { login } from "@/app/actions/auth/login";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await login({
      email: form.get("email") as string,
      password: form.get("password") as string,
    });

    setLoading(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    router.push("/prospeccao");
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Bem-vindo de volta
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">Entre na sua conta para continuar</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="voce@empresa.com" className="h-10" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              placeholder="••••••••"
              className="h-10 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Não tem conta?{" "}
        <Link href="/register" className="font-medium text-primary transition-colors hover:text-primary/75">
          Criar conta
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Criar `src/app/(auth)/register/page.tsx`** — mesmo formato:

```tsx
import type { Metadata } from "next";

import { redirectIfAuthenticated } from "@/lib/tenant";

import { RegisterForm } from "./_components/RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Criar conta" };
}

export default async function RegisterPage() {
  await redirectIfAuthenticated();

  return <RegisterForm />;
}
```

- [ ] **Criar `src/app/(auth)/register/_components/RegisterForm.tsx`** — chama `signup(...)` (cria usuário + empresa) e, em caso de sucesso, `login(...)` (estabelece a sessão) — as duas etapas de hoje, só que ambas Server Actions:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { login } from "@/app/actions/auth/login";
import { signup } from "@/app/actions/auth/signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const companyName = form.get("companyName") as string;

    const result = await signup({ name, email, password, companyName });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const loginResult = await login({ email, password });

    setLoading(false);

    if (!loginResult.ok) {
      setError("Conta criada. Tente fazer login.");
      return;
    }

    router.push("/prospeccao");
  }

  return (
    <div className="w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Criar conta</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Comece a prospectar clientes hoje mesmo
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="name">Seu nome</Label>
          <Input id="name" name="name" required placeholder="João Silva" className="h-10" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="companyName">Nome da agência</Label>
          <Input id="companyName" name="companyName" required placeholder="Acme Marketing" className="h-10" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required placeholder="voce@empresa.com" className="h-10" />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              className="h-10 pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? "Criando conta..." : "Criar conta grátis"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-primary transition-colors hover:text-primary/75">
          Entrar
        </Link>
      </p>
    </div>
  );
}
```

Crie `src/app/(protected)/layout.tsx` (placeholder simples — a versão final, com `AppSidebar`, vem no "Passo extra — Sistema de Design e Sidebar" mais abaixo, ainda nesta fase):

```tsx
import { requireUser } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser(); // redireciona para /login se não autenticado
  return <div className="min-h-screen">{children}</div>;
}
```

Crie `src/app/page.tsx` (raiz — redireciona para /prospeccao):

```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/prospeccao");
}
```

**Por que isso existe?** Sem esse arquivo, acessar `/` retorna 404. Redirecionar direto pra `/prospeccao` (em vez de `/login`) é intencional: se o usuário não tiver sessão, o `requireUser()` do layout protegido já lança o redirect pra `/login` — não precisa duplicar essa decisão aqui na raiz.

---

Crie `src/app/(protected)/prospeccao/page.tsx`:

```tsx
import { Target } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";

export default async function ProspeccaoPage() {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Prospecção</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá, {firstName}. Bem-vindo de volta à{" "}
          <span className="font-medium text-foreground">{company.name}</span>.
        </p>
      </div>

      {/* Empty state */}
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">Nenhuma campanha ainda</h2>
        <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
          Na Fase 2 vamos criar campanhas de prospecção com busca geolocalizada e geração de leads
          automática via Cloudflare AI.
        </p>
      </div>
    </div>
  );
}
```

Esta já é a versão final do placeholder — usa os tokens de tema (`text-foreground`, `bg-primary/10`) e o bloco `Sidebar`/`(protected)/layout.tsx` construído mais adiante neste mesmo documento, então o ícone `Target` e o card de empty-state já conversam visualmente com o resto do app desde a Fase 1.

---

### Passo 17 — Aplicar schema no banco

```bash
npx drizzle-kit push
```

Este comando lê o `schema.ts`, compara com o banco atual e cria as tabelas que não existem. Durante desenvolvimento é o mais rápido. Para produção, use `drizzle-kit generate` + `drizzle-kit migrate` para ter controle sobre as migrations.

---

### Passo 18 — Testar

```bash
npm run dev
```

Acesse `http://localhost:3000/register` e crie uma conta. Depois verifique no painel do Neon que as tabelas foram criadas e o usuário foi inserido.

---

## Verificação — como saber que funcionou

- [ ] `/register` carrega o formulário sem erros no console
- [ ] Submeter o formulário cria um registro em `users`, `companies` e `company_members` no Neon
- [ ] Após cadastro, redireciona para `/prospeccao` mostrando nome do usuário e empresa
- [ ] `/login` com as credenciais criadas funciona e redireciona para `/prospeccao`
- [ ] `/login` com senha errada mostra erro inline
- [ ] Acessar `/prospeccao` em uma aba anônima (sem cookie) redireciona para `/login`
- [ ] O banco no Neon tem as 6 tabelas: `users`, `sessions`, `accounts`, `verifications`, `companies`, `company_members`

---

## Armadilhas e problemas comuns

### Armadilha 0 — Rotas não estão sendo protegidas (proxy ignorado silenciosamente)

**Sintoma:** Ao iniciar o servidor, aparece o erro: `The file "./src\proxy.ts" must export a function, either as a default export or as a named "proxy" export.`
**Causa:** O Next.js 16 renomeou `middleware.ts` → `proxy.ts`, e a função exportada deve se chamar `proxy` (não `middleware`). Se você exportar `export function middleware(...)`, o servidor sobe mas lança esse erro em cada request.
**Solução:** No arquivo `src/proxy.ts`, use `export function proxy(request: NextRequest)`. O `export const config` com o `matcher` continua igual.

### Armadilha 1 — Erro de SSL ao conectar no Neon

**Sintoma:** `Error: self signed certificate` ou `SSL SYSCALL error`
**Causa:** O Neon exige SSL e o `node-postgres` precisa do parâmetro `uselibpqcompat=true` para compatibilidade.
**Solução:** O `src/infrastructure/db/index.ts` já adiciona esse parâmetro automaticamente se não estiver na URL. Verifique se a `DATABASE_URL` termina com `?sslmode=require`.

### Armadilha 2 — `global.__drizzlePool` com erro de TypeScript

**Sintoma:** `Property '__drizzlePool' does not exist on type 'typeof globalThis'`
**Solução:** O `declare global { var __drizzlePool: Pool | undefined; }` no `db/index.ts` precisa existir. Não esqueça.

### Armadilha 3 — Better Auth retorna erro 400 no signup

**Sintoma:** `authClient.signUp.email()` retorna erro sem mensagem clara.
**Causa mais comum:** `BETTER_AUTH_URL` não está configurado ou está diferente do que o browser acessa.
**Solução:** Garanta que `.env.local` tem `BETTER_AUTH_URL=http://localhost:3000` (sem barra no final).

### Armadilha 4 — `redirect()` causa erro "NEXT_REDIRECT"

**Sintoma:** `Error: NEXT_REDIRECT` aparece nos logs do servidor.
**Causa:** Não é um erro real. O Next.js usa exceções para implementar o redirect. Se aparecer em try/catch, o catch está engolindo o redirect.
**Solução:** Nunca coloque `requireUser()` dentro de um try/catch no Server Component.

### Armadilha 5 — Signup funciona mas usuário fica deslogado após cadastro

**Sintoma:** O formulário de cadastro envia, o usuário é redirecionado para `/prospeccao`, mas é imediatamente redirecionado de volta para `/login` (a sessão não foi criada).
**Causa:** O plugin `nextCookies()` não está no `auth.ts`. Server Actions no Next.js não conseguem setar cookies sem ele.
**Solução:** Adicionar `import { nextCookies } from "better-auth/next-js"` e `plugins: [nextCookies()]` **como último item do array** em `auth.ts`.

### Armadilha 6 — Empresa criada mas membro não (dados inconsistentes)

**Sintoma:** Usuário consegue criar conta mas `/prospeccao` mostra "sem empresa".
**Causa:** Transação não está sendo usada. A inserção em `companyMembersTable` falhou silenciosamente.
**Solução:** Verificar se o `DrizzleCompanyRepository.create()` usa `db.transaction()` e se o `company_members_company_user_unique` index não está causando conflito.

---

## Passo extra — Prettier com plugin do Tailwind

### Por que Prettier + plugin?

O Prettier formata o código automaticamente no save. O plugin `prettier-plugin-tailwindcss` vai além: ele **ordena as classes Tailwind** na sequência oficial do framework (layout → spacing → typography → etc.), evitando divergência entre desenvolvedores e tornando os diffs mais limpos.

### Instalação

```bash
npm install -D prettier prettier-plugin-tailwindcss
```

### Configuração — `.prettierrc` (raiz do projeto)

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

| Opção | Valor | Por quê |
|---|---|---|
| `semi` | `true` | Ponto e vírgula obrigatório — sem ambiguidade |
| `singleQuote` | `false` | Aspas duplas — padrão JSX |
| `tabWidth` | `2` | Indentação padrão JS/TS |
| `trailingComma` | `"es5"` | Trailing comma em arrays e objetos — diffs menores |
| `printWidth` | `100` | Mais espaço que o padrão de 80; adequado para TypeScript verboso |
| `plugins` | `tailwindcss` | Ordena classes Tailwind automaticamente |

### Integração com VS Code (opcional, mas recomendado)

Instale a extensão **Prettier - Code formatter** e adicione ao `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

### Rodar manualmente

```bash
# Formatar todos os arquivos do projeto
npx prettier --write .

# Verificar sem aplicar (útil em CI)
npx prettier --check .
```

---

## Passo extra — Sistema de Design e Sidebar

### Design tokens no `globals.css`

O ProspFlow usa **indigo como cor primária de marca** (`oklch(0.511 0.243 264)` ≈ `#4F46E5`). Todos os neutrals têm um leve viés violeta — cinzas "escolhidos", não herdados do padrão.

O sistema de tokens sobrescreve os defaults cinzas do shadcn/ui e garante consistência em todos os componentes:

```
--primary        → indigo brand (botões, links, foco, ring)
--sidebar        → surface levemente tintada de indigo
--sidebar-primary → indigo (item ativo na nav)
--muted-foreground → slate com leve violeta (labels, metadados)
```

Cada token tem equivalente para `.dark`, com background `oklch(0.118 0.016 264)` (preto com azul-violeta — mais sofisticado que preto puro).

### Sidebar — construída sobre o `Sidebar` do shadcn/ui

A sidebar **não** é um `<aside>`/`<div>` escrito à mão — é construída sobre o bloco `sidebar` do shadcn/ui, que já resolve responsividade (vira um `Sheet` deslizante no mobile, fixa no desktop), estado ativo/colapsado e acessibilidade. Isso evita reescrever esse comportamento manualmente mais tarde, quando o menu ganhar mais itens nas próximas fases.

- [ ] **Adicionar o componente**

```bash
npx shadcn@latest add sidebar
```

Isso instala `src/components/ui/sidebar.tsx` e as dependências que ele usa internamente: `separator`, `sheet`, `skeleton`, `tooltip` e o hook `src/hooks/use-mobile.ts`.

- [ ] **Criar `src/components/layout/Sidebar.tsx`** (exporta `AppSidebar`)

Três zonas, montadas com as peças do shadcn (`SidebarHeader`, `SidebarContent`/`SidebarGroup`/`SidebarMenu`, `SidebarFooter`):

1. **Header**: ícone `Crosshair` em caixa indigo + wordmark
2. **Menu**: um item por rota, usando `SidebarMenuButton` com o padrão `render` (base-ui) em vez de `asChild` — o `<Link>` é passado como elemento a renderizar, e `isActive` controla o estilo do item ativo automaticamente (sem precisar de `cn()` manual)
3. **Footer**: avatar com iniciais (máx. 2 letras), nome + empresa, botão de logout (`Button` do shadcn, não um `<button>` cru)

```tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Crosshair, LogOut, Target } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

interface AppSidebarProps {
  user: { name: string; email: string };
  company: { name: string };
}

// Só a rota da Fase 1. Cada fase seguinte adiciona seus próprios itens aqui
// (ver Fase 2, Task 12) — a estrutura do componente não muda.
const navItems = [{ href: "/prospeccao", label: "Prospecção", icon: Target, exact: true }];

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function AppSidebar({ user, company }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
  }

  const initials = getInitials(user.name);

  return (
    <Sidebar>
      <SidebarHeader className="h-14 flex-row items-center gap-2.5 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Crosshair className="h-[15px] w-[15px] text-primary-foreground" strokeWidth={2.5} />
        </div>
        <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
          ProspFlow
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map(({ href, label, icon: Icon, exact }) => {
                const active = exact
                  ? pathname === href
                  : pathname === href || pathname.startsWith(href + "/");
                return (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton isActive={active} render={<Link href={href} />}>
                      <Icon />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-1 py-1">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight text-sidebar-foreground">
              {user.name}
            </p>
            <p className="truncate text-[11px] leading-tight text-muted-foreground">
              {company.name}
            </p>
          </div>
          <Button
            onClick={handleLogout}
            title="Sair"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <LogOut className="h-[15px] w-[15px]" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
```

```
getInitials("João Silva") → "JS"
getInitials("Maria")      → "M"
```

O logout chama `authClient.signOut()` e depois `router.push("/login")`.

### Layout protegido — `src/app/(protected)/layout.tsx`

O layout vira Server Component async: busca `user` e `company` via `requireUser()` → `requireCompany()`, e monta a estrutura oficial do bloco `sidebar` — `SidebarProvider` (contexto de aberto/fechado, inclusive no mobile) envolvendo `AppSidebar` + `SidebarInset` (a área de conteúdo). Um `<header>` com `SidebarTrigger` só aparece no mobile (`md:hidden`) — no desktop a sidebar já fica sempre visível, sem precisar de gatilho.

```tsx
import { Crosshair } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { AppSidebar } from "@/components/layout/Sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  return (
    <SidebarProvider className="h-screen overflow-hidden bg-background">
      <AppSidebar user={{ name: user.name, email: user.email }} company={company} />
      <SidebarInset className="overflow-y-auto">
        <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border bg-sidebar px-4 md:hidden">
          <SidebarTrigger />
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary">
            <Crosshair className="h-[15px] w-[15px] text-primary-foreground" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">
            ProspFlow
          </span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
```

A separação Server / Client é intencional: o layout busca os dados (Server), a sidebar reage ao pathname e dispara logout (Client). Dados fluem de cima para baixo — nunca o contrário.

**Por que não escrever a sidebar à mão:** dava pra fazer um `<aside>` fixo com Tailwind puro (mais rápido de digitar na hora), mas aí o comportamento mobile (menu escondido, abrindo como overlay) teria que ser implementado manualmente — e não teria estado compartilhado (`useSidebar()`) caso outra parte da UI precise saber se o menu está aberto. Usar o bloco oficial do shadcn resolve isso de graça e é o mesmo padrão usado no resto do projeto para outros componentes (`Dialog`, `Sheet`, `Table`, etc.) — sidebar não deveria ser exceção.

**Convenção do projeto:** toda vez que precisar de um botão clicável — mesmo pequeno, tipo o ícone de logout ou o toggle de mostrar senha nos formulários de login/registro — use o `Button` de `@/components/ui/button` (com `variant="ghost"` e `size="icon-sm"`/`icon-xs"` para botões só de ícone) em vez de um `<button>` cru. Mantém foco/estados de hover/disabled consistentes em todo o app sem precisar reimplementar isso a cada componente novo.

---

## Próximos passos — Fase 2

Na próxima fase vamos construir o módulo de prospecção completo:

- Dashboard com métricas (cards de nichos, campanhas, leads)
- CRUD de nichos com TagInput e geração por Cloudflare AI
- Lista de campanhas com execução real via Overpass API
- Detalhe de campanha com mapa Leaflet (carregamento lazy)
- Lista de leads com filtros, paginação, mapa e sheet de detalhes
- Diagnóstico e mensagem WhatsApp gerados por Cloudflare AI

Antes de começar a Fase 2, adicione as variáveis Cloudflare no `.env.local`:

```env
CLOUDFLARE_ACCOUNT_ID=seu_account_id
CLOUDFLARE_AI_TOKEN=seu_api_token
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-70b-instruct
```

**Onde pegar:**
- `CLOUDFLARE_ACCOUNT_ID` — [dash.cloudflare.com](https://dash.cloudflare.com) → barra lateral → Account ID
- `CLOUDFLARE_AI_TOKEN` — **My Profile → API Tokens → Create Token → template "Workers AI"**
- `CLOUDFLARE_AI_MODEL` — modelo fixado no env para facilitar troca sem mexer no código. `llama-3.1-70b-instruct` é o mais capaz do Workers AI sem custo adicional e tem bom suporte a português.
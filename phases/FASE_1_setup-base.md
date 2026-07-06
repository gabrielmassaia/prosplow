# Fase 1 — Setup Base

> **Para a live:** Este documento é seu roteiro completo da Fase 1. Leia do início ao fim antes de abrir o editor.
> Tempo estimado: 2–3 horas ao vivo.
> Ao final desta fase: login, cadastro e proteção de rotas funcionando com banco real.

---

## O que foi construído nesta fase

| Arquivo | Propósito |
|---|---|
| `drizzle.config.ts` | Configura o Drizzle Kit (onde está o schema, qual banco, onde gerar migrations) |
| `.env.local.example` | Template das variáveis de ambiente necessárias |
| `src/infrastructure/db/index.ts` | Pool de conexão PostgreSQL singleton + instância Drizzle tipada |
| `src/infrastructure/db/schema.ts` | Todas as tabelas da Fase 1 (4 do Better Auth + companies + company_members) |
| `src/domain/repositories/IUserRepository.ts` | Contrato de repositório de usuário |
| `src/domain/repositories/ICompanyRepository.ts` | Contrato de repositório de empresa |
| `src/infrastructure/repositories/DrizzleCompanyRepository.ts` | Implementação concreta com Drizzle |
| `src/use-cases/auth/CreateUserWithCompany.ts` | Lógica de negócio: criar usuário + empresa em transação |
| `src/lib/auth.ts` | Instância central do Better Auth (servidor) |
| `src/lib/auth-client.ts` | Cliente React do Better Auth (browser) |
| `src/lib/tenant.ts` | `requireUser()` e `requireCompany()` para proteger Server Components e actions |
| `src/app/api/auth/[...all]/route.ts` | Handler universal de autenticação |
| `src/app/actions/auth/signup.ts` | Server Action de cadastro (controller) |
| `src/app/(auth)/layout.tsx` | Layout público centralizado |
| `src/app/(auth)/login/page.tsx` | Página de login |
| `src/app/(auth)/register/page.tsx` | Página de cadastro |
| `src/app/(app)/layout.tsx` | Layout protegido (placeholder, sem sidebar ainda) |
| `src/app/(app)/prospeccao/page.tsx` | Página inicial protegida (placeholder) |
| `src/app/layout.tsx` | Root layout do Next.js |
| `proxy.ts` | Proteção de rotas — redireciona não-autenticados para `/login` |

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

### 4. Grupos de rotas no Next.js App Router: `(auth)` e `(app)`

Parênteses no nome de uma pasta criam um **grupo de rotas** — a pasta existe na estrutura de arquivos mas não aparece na URL.

```
app/
├── (auth)/
│   ├── login/page.tsx     → URL: /login
│   └── register/page.tsx  → URL: /register
└── (app)/
    └── prospeccao/page.tsx → URL: /prospeccao
```

Por que usamos isso? Para ter **layouts diferentes** sem afetar as URLs:
- `(auth)/layout.tsx` → tela centralizada, sem sidebar, sem autenticação
- `(app)/layout.tsx` → com sidebar, verifica sessão

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
- Style: Default
- Base color: Slate
- CSS variables: Yes

```bash
npx shadcn@latest add button input label card badge
```

Isso cria `src/components/ui/` com os componentes base que a Fase 1 usa.

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

Crie também `.env.local.example` (sem valores reais — vai para o git):
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
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  var __drizzlePool: Pool | undefined;
}

let connectionString = process.env.DATABASE_URL!;

// Neon requer esse parâmetro para compatibilidade SSL com node-postgres
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
export type DrizzleDB = typeof db;
```

**Pontos não óbvios:**
- `declare global { var __drizzlePool }` → declara a variável no escopo global do Node.js para TypeScript aceitar `global.__drizzlePool`
- `global.__drizzlePool ?? new Pool(...)` → se já existe um pool (hot-reload), reutiliza. Senão, cria.
- `uselibpqcompat=true` → o Neon usa um proxy SSL específico. Sem esse parâmetro, o `node-postgres` pode apresentar erros de SSL.
- `max: 5` → máximo de 5 conexões simultâneas. O Neon free tier suporta até 10.
- `export type DrizzleDB = typeof db` → exporta o tipo da instância para injeção de dependência nos repositórios.

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
mkdir -p src/app/\(app\)/prospeccao
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

### Passo 9 — Implementação do repositório de empresa

Crie `src/infrastructure/repositories/DrizzleCompanyRepository.ts`:

```typescript
import { eq } from "drizzle-orm";
import { type DrizzleDB } from "@/infrastructure/db";
import { companiesTable, companyMembersTable } from "@/infrastructure/db/schema";
import type { ICompanyRepository } from "@/domain/repositories/ICompanyRepository";

export class DrizzleCompanyRepository implements ICompanyRepository {
  constructor(private db: DrizzleDB) {}

  async create(data: { name: string; slug: string; ownerId: string }) {
    return await this.db.transaction(async (tx) => {
      const [company] = await tx
        .insert(companiesTable)
        .values({
          name: data.name,
          slug: data.slug,
          ownerId: data.ownerId,
        })
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
- `private db: DrizzleDB` → injeção de dependência. O `db` vem de fora, não é importado aqui.
- `.returning({ id, name, slug })` → o Drizzle retorna só os campos que pedimos, já tipados
- `result[0] ?? null` → `findFirst` no Drizzle com `.select()` retorna um array; pegamos o primeiro ou null

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

type Output = { ok: true } | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export class CreateUserWithCompany {
  constructor(private companyRepo: ICompanyRepository) {}

  async execute(input: Input): Promise<Output> {
    try {
      // 1. Criar usuário via Better Auth
      const authResult = await auth.api.signUpEmail({
        body: {
          name: input.name,
          email: input.email,
          password: input.password,
        },
      });

      if (!authResult?.user?.id) {
        return { ok: false, error: "Falha ao criar usuário." };
      }

      const userId = authResult.user.id;

      // 2. Gerar slug único
      const slug = slugify(input.companyName);

      // 3. Criar empresa + membro em transação (via repositório)
      await this.companyRepo.create({
        name: input.companyName,
        slug,
        ownerId: userId,
      });

      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido.";

      // Email duplicado é o erro mais comum — trata de forma amigável
      if (message.toLowerCase().includes("unique") || message.toLowerCase().includes("duplicate")) {
        return { ok: false, error: "Este e-mail já está cadastrado." };
      }

      return { ok: false, error: message };
    }
  }
}
```

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
    schema: {
      user: schema.usersTable,
      session: schema.sessionsTable,
      account: schema.accountsTable,
      verification: schema.verificationsTable,
    },
  }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    password: {
      hash: async (password: string) => {
        const bcrypt = await import("bcryptjs");
        return bcrypt.hash(password, 10);
      },
      verify: async ({ password, hash }: { password: string; hash: string }) => {
        const bcrypt = await import("bcryptjs");
        return bcrypt.compare(password, hash);
      },
    },
  },
  plugins: [nextCookies()], // ← OBRIGATÓRIO para Server Actions setarem cookies
});
```

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

Este arquivo é importado apenas em componentes `"use client"`. Nunca importe em Server Components ou actions.

---

### Passo 12 — Helpers de tenant

Crie `src/lib/tenant.ts`:

```typescript
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";

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

  return {
    companyId: company?.id ?? null,
    company,
  };
}
```

**Por que `requireUser` chama `redirect()` e não retorna null?**
O `redirect()` do Next.js lança uma exceção especial que aborta a execução do Server Component e envia o cabeçalho HTTP 307. Isso garante que o código depois de `requireUser()` nunca executa se o usuário não estiver autenticado — sem precisar de `if (!user) return` em todo lugar.

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

import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";
import { CreateUserWithCompany } from "@/use-cases/auth/CreateUserWithCompany";

interface SignupInput {
  name: string;
  email: string;
  password: string;
  companyName: string;
}

export async function signupAction(input: SignupInput) {
  const companyRepo = new DrizzleCompanyRepository(db);
  const useCase = new CreateUserWithCompany(companyRepo);
  return useCase.execute(input);
}
```

Repare como a action é fina: instancia as dependências concretas, passa para o use case, retorna o resultado. Nenhuma lógica de negócio aqui.

---

### Passo 15 — Proxy de proteção de rotas (Next.js 16)

> **⚠️ Mudança importante do Next.js 16:** o arquivo `middleware.ts` foi renomeado para `proxy.ts` e a função exportada de `middleware` para `proxy`. Se você usar o nome antigo, o Next.js 16 ignora silenciosamente o arquivo — suas rotas ficam desprotegidas sem nenhum erro.

Crie `proxy.ts` na **raiz do projeto** (ao lado de `src/`, não dentro):

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Libera rotas públicas e API do Better Auth
  const PUBLIC_PATHS = ["/login", "/register", "/api/auth"];
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Verifica presença do cookie (check rápido, sem banco)
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Por que `getSessionCookie` e não `auth.api.getSession`?**

O Next.js 16 suporta Node.js runtime no proxy, então *daria* para chamar `auth.api.getSession()` aqui e validar a sessão de verdade. Mas não fazemos isso por uma razão importante: o proxy roda em **toda requisição**, incluindo arquivos estáticos, fontes e imagens. Validar a sessão no banco a cada request de imagem é desperdício.

A estratégia correta é em duas camadas:
- **`proxy.ts`** → check rápido de cookie (UX: evita renderizar página antes de redirecionar)
- **`requireUser()` no layout/página** → validação real da sessão no banco (segurança)

**Security warning da doc oficial do Better Auth:** `getSessionCookie` não valida o cookie, apenas verifica se existe. Por isso o `requireUser()` nas páginas é obrigatório — ele é a camada de segurança real.

---

### Passo 16 — Layouts e páginas

Crie `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ProspFlow",
  description: "Prospecção ativa para agências digitais",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={geist.className}>{children}</body>
    </html>
  );
}
```

Crie `src/app/(auth)/layout.tsx`:

```tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      {children}
    </div>
  );
}
```

Crie `src/app/(auth)/login/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const { error: err } = await authClient.signIn.email({
      email: form.get("email") as string,
      password: form.get("password") as string,
    });

    if (err) {
      setError(err.message || "Credenciais inválidas.");
      setLoading(false);
      return;
    }

    router.push("/prospeccao");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Entrar no ProspFlow</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" required />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
          <p className="text-sm text-center text-gray-500">
            Não tem conta?{" "}
            <Link href="/register" className="underline">
              Criar conta
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

Crie `src/app/(auth)/register/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signupAction } from "@/app/actions/auth/signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const result = await signupAction({
      name: form.get("name") as string,
      email: form.get("email") as string,
      password: form.get("password") as string,
      companyName: form.get("companyName") as string,
    });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    router.push("/prospeccao");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Criar conta no ProspFlow</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="companyName">Nome da empresa</Label>
            <Input id="companyName" name="companyName" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Seu nome</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" minLength={8} required />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Criando conta..." : "Criar conta"}
          </Button>
          <p className="text-sm text-center text-gray-500">
            Já tem conta?{" "}
            <Link href="/login" className="underline">
              Entrar
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
```

Crie `src/app/(app)/layout.tsx` (placeholder — sidebar vem na Fase 2):

```tsx
import { requireUser } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser(); // redireciona para /login se não autenticado
  return <div className="min-h-screen">{children}</div>;
}
```

Crie `src/app/page.tsx` (raiz — redireciona para /login):

```tsx
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/login");
}
```

**Por que isso existe?** Sem esse arquivo, acessar `/` retorna 404. Com ele, qualquer acesso à raiz vai para `/login`, que o proxy já trata de redirecionar para `/prospeccao` se o usuário estiver logado.

---

Crie `src/app/(app)/prospeccao/page.tsx`:

```tsx
import { requireUser, requireCompany } from "@/lib/tenant";

export default async function ProspeccaoPage() {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold">Prospecção Ativa</h1>
      <p className="mt-2 text-gray-600">
        Olá, {user.name} — {company?.name ?? "sem empresa"}
      </p>
    </div>
  );
}
```

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

### Sidebar — `src/components/layout/Sidebar.tsx`

Client Component com três zonas:

1. **Logo**: ícone `Crosshair` em caixa indigo + wordmark
2. **Nav**: links com estado ativo via `usePathname()`, classes condicionadas com `cn()`
3. **User**: avatar com iniciais (max 2 letras), nome + empresa, botão de logout

```
getInitials("João Silva") → "JS"
getInitials("Maria")      → "M"
```

O logout chama `authClient.signOut()` e depois `router.push("/login")`.

### Layout protegido — `src/app/(protected)/layout.tsx`

O layout vira Server Component async: busca `user` e `company` via `requireUser()` → `requireCompany()`, e passa para o `<Sidebar>` como props.

```tsx
export default async function AppLayout({ children }) {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={...} company={...} />
      <main className="flex flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
```

A separação Server / Client é intencional: o layout busca os dados (Server), a sidebar reage ao pathname e dispara logout (Client). Dados fluem de cima para baixo — nunca o contrário.

---

## Próximos passos — Fase 2

Na próxima fase vamos construir o módulo de prospecção completo:

- Dashboard com métricas (cards de nichos, campanhas, leads)
- CRUD de nichos com TagInput e geração por Cloudflare AI
- Lista de campanhas com execução real via Overpass API
- Detalhe de campanha com mapa Leaflet (carregamento lazy)
- Lista de leads com filtros, paginação, mapa e sheet de detalhes
- Diagnóstico e mensagem WhatsApp gerados por Cloudflare AI

Antes de começar a Fase 2: instale as variáveis `CLOUDFLARE_ACCOUNT_ID` e `CLOUDFLARE_AI_TOKEN` no `.env.local`.
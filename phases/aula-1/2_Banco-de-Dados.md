# Aula 1 — 2. Banco de Dados

> Parte de `aula-1`. Pré-requisito: `1_Setup-Projeto-e-Dependencias.md`. Próximo arquivo: `3_Dominio-e-Repositorios.md`.

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
- Não exportamos um tipo `DrizzleDB` compartilhado aqui — cada repositório declara localmente `type DB = NodePgDatabase<typeof schema>` (ver `3_Dominio-e-Repositorios.md`). Evita acoplar a assinatura de todos os repositórios a um único ponto de export.

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

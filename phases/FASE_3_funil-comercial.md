# Fase 3 — Funil Comercial (Kanban CRM)

> **Para agentes:** Use superpowers:subagent-driven-development ou superpowers:executing-plans para executar tarefa a tarefa. Steps usam checkbox (`- [ ]`) para rastreamento.
>
> **Regra:** NUNCA fazer `git commit` automaticamente. O desenvolvedor commita manualmente.

**Objetivo:** Pipeline comercial visual estilo Kanban. Leads do CRM (criados manualmente ou convertidos da prospecção da Fase 2) são organizados em etapas configuráveis por empresa, arrastados entre colunas com `@dnd-kit`, inspecionados em um sheet lateral com histórico de atividades, e avançados manualmente pelo funil.

**Arquitetura:** Mesma Clean Architecture das Fases 1 e 2. Schema → Domain (interfaces) → Infrastructure (Drizzle) → Use Cases (lógica de negócio) → Actions (controllers finos) → UI (Server + Client Components).

**Tech Stack adicionado:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`. Nenhum componente shadcn novo foi necessário — `sheet`, `tabs`, `dialog`, `select`, `textarea`, `badge` já estavam instalados desde a Fase 2.

## Constraints globais

- Toda action começa com `requireUser()` → `requireCompany(user.id)`
- Toda query filtra por `companyId` — sem exceção
- Retorno de actions: `{ ok: true, data? } | { ok: false, error: string }`
- Repositórios recebem `db` no construtor, nunca importam globalmente
- `domain/` não importa nada externo (sem Drizzle, sem Next.js)
- NUNCA commitar — o desenvolvedor faz os commits manualmente
- Rota protegida usa `src/app/(protected)/` (não `(app)/` como no SPEC)

---

## Conceitos que você precisa entender antes de codar

### Drag-and-drop com `@dnd-kit`

`@dnd-kit/core` expõe três peças que compõem o Kanban:

- `DndContext` — envolve toda a área arrastável, recebe `sensors` e os callbacks `onDragStart`/`onDragEnd`.
- `useDraggable({ id })` — em cada card de lead, devolve `attributes`, `listeners`, `setNodeRef` e `isDragging` para spread no elemento.
- `useDroppable({ id })` — em cada coluna (etapa), devolve `setNodeRef` e `isOver` para feedback visual de "vou soltar aqui".

O `id` do draggable é o `leadId`; o `id` do droppable é o `stageId`. No `onDragEnd`, `event.active.id` é o lead arrastado e `event.over?.id` é a etapa onde foi solto — é só comparar com o `stageId` atual do lead para decidir se houve movimento real.

Usamos `PointerSensor` com `activationConstraint: { distance: 5 }`: sem isso, qualquer clique no card (inclusive o clique que abre o drawer de detalhes) seria interpretado como o início de um arrasto. Exigir 5px de movimento antes de "armar" o drag distingue clique de arrasto.

### Por que o seed das 8 etapas é "lazy" (e não no cadastro da empresa)

O SPEC (Fase 4) prevê "seed automático no primeiro login de uma empresa nova" — mas isso implica um hook de login que ainda não existe. Em vez de antecipar essa peça de infraestrutura (fora de escopo da Fase 3) ou mexer em `CreateUserWithCompany` (que já está estável desde a Fase 1), o seed roda dentro da própria Server Action de bootstrap do funil: `getFunilBootstrapAction` verifica `stageRepo.countByCompany(companyId)` e, se for zero, dispara `SeedFunnelStages` antes de buscar os leads. Isso é idempotente (a checagem de contagem evita duplicar) e funciona tanto para empresas novas quanto para as já existentes das Fases 1/2 que nunca tiveram etapas. A Fase 4 pode mover esse gatilho para um hook de login sem quebrar nada — a chamada lazy continua sendo uma segunda camada de proteção.

### `numeric` do Postgres via Drizzle

A coluna `crm_leads.value` é `numeric(10,2)`. O driver `node-postgres` retorna colunas `numeric` como **string**, não `number`, para não perder precisão decimal silenciosamente. O domínio (`ICrmLeadRepository`) expõe `value: number | null` para não vazar esse detalhe para use cases e UI — a conversão string↔number acontece só na borda, dentro de `DrizzleCrmLeadRepository` (`toDomain`/`normalizeValue`).

### Por que `MoveLead` recebe os nomes das etapas em vez de buscá-los

`MoveLead` (o use case que registra a movimentação) precisa dos nomes de origem/destino só para compor a descrição da atividade (`"Lead movido de X para Y"`). Em vez de injetar `IFunnelStageRepository` como uma terceira dependência só para esse texto, a Server Action (que já tem a lista de `stages` disponível no client) resolve os nomes e os passa como input. Mantém o use case com só duas dependências (`ICrmLeadRepository`, `ILeadActivityRepository`).

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/infrastructure/db/schema.ts` | Modificar | Adicionar 2 enums + 3 tabelas de funil |
| `src/domain/repositories/IFunnelStageRepository.ts` | Criar | Interface pura de etapas do funil |
| `src/domain/repositories/ICrmLeadRepository.ts` | Criar | Interface pura de leads do CRM |
| `src/domain/repositories/ILeadActivityRepository.ts` | Criar | Interface pura de atividades/histórico |
| `src/infrastructure/repositories/DrizzleFunnelStageRepository.ts` | Criar | Implementação Drizzle de `IFunnelStageRepository` |
| `src/infrastructure/repositories/DrizzleCrmLeadRepository.ts` | Criar | Implementação Drizzle de `ICrmLeadRepository` (com conversão `numeric`↔`number`) |
| `src/infrastructure/repositories/DrizzleLeadActivityRepository.ts` | Criar | Implementação Drizzle de `ILeadActivityRepository` |
| `src/lib/format.ts` | Modificar | Adicionar `formatBRL()` e `STAGE_KIND_BORDER_CLASSES` |
| `src/use-cases/funil/SeedFunnelStages.ts` | Criar | Cria as 8 etapas padrão (idempotente) |
| `src/use-cases/funil/CreateCrmLead.ts` | Criar | Cria lead manual + registra atividade de criação |
| `src/use-cases/funil/MoveLead.ts` | Criar | Move lead entre etapas + registra atividade |
| `src/use-cases/funil/UpdateCrmLead.ts` | Criar | Edita dados do lead (nunca `stageId`) |
| `src/use-cases/funil/ConvertProspectingLead.ts` | Criar | Converte `ProspectingLead` em `CrmLead` |
| `src/app/actions/funil/get-funil-bootstrap.ts` | Criar | Server Action: bootstrap de leitura + seed lazy |
| `src/app/actions/funil/create-crm-lead.ts` | Criar | Server Action: criar lead manual |
| `src/app/actions/funil/move-lead.ts` | Criar | Server Action: mover lead de etapa |
| `src/app/actions/funil/update-crm-lead.ts` | Criar | Server Action: atualizar dados do lead |
| `src/app/actions/funil/get-lead-activities.ts` | Criar | Server Action: histórico sob demanda |
| `src/app/actions/leads/convert-prospecting-lead.ts` | Criar | Server Action: converter lead de prospecção em CRM |
| `src/app/actions/leads/get-leads-bootstrap.ts` | Modificar | Retornar também `convertedProspectingLeadIds` |
| `src/app/(protected)/funil/page.tsx` | Criar | Server Component thin: `generateMetadata` + `BasePageLayout` + `Suspense` + Data Loader |
| `src/app/(protected)/funil/_components/FunilContent.tsx` | Criar | Client Component: Kanban, drag-and-drop, drawer, criação de lead |
| `src/app/(protected)/prospeccao/leads/_components/LeadsContent.tsx` | Modificar | Botão "Converter para CRM" no sheet de detalhe |
| `src/app/(protected)/prospeccao/leads/page.tsx` | Modificar | Repassar `convertedProspectingLeadIds` |
| `src/components/layout/Sidebar.tsx` | Modificar | Novo item de navegação "Funil" |

---

## Task 1: Dependências

- [x] **Instalar `@dnd-kit`**

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Nenhum componente shadcn adicional é necessário: `sheet`, `tabs`, `dialog`, `select`, `textarea`, `badge`, `input`, `label`, `button` já vieram da Fase 2. O `<Toaster />` do sonner já está montado em `src/app/layout.tsx` desde a Fase 1.

---

## Task 2: Schema — 2 enums + 3 tabelas

- [x] **Adicionar ao final de `src/infrastructure/db/schema.ts`** (após `prospectingLeadsTable`), incluindo `numeric` no import de `drizzle-orm/pg-core`:

```typescript
import {
  boolean,
  doublePrecision,
  index,
  integer,
  numeric, // novo
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

// ── Funil Comercial — Fase 3 ─────────────────────────────────────────────────

export const stageKindEnum = pgEnum("stage_kind", ["normal", "won", "lost", "triage"]);

export const funnelStagesTable = pgTable(
  "funnel_stages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    colorHex: varchar("color_hex", { length: 7 }).notNull().default("#6366f1"),
    kind: stageKindEnum("kind").notNull().default("normal"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    companyPositionUnique: uniqueIndex("funnel_stages_company_position_unique").on(
      t.companyId,
      t.position
    ),
  })
);

export const crmLeadOriginEnum = pgEnum("crm_lead_origin", ["manual", "prospecting"]);

export const crmLeadsTable = pgTable(
  "crm_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    prospectingLeadId: uuid("prospecting_lead_id").references(
      () => prospectingLeadsTable.id,
      { onDelete: "set null" }
    ),
    stageId: uuid("stage_id")
      .notNull()
      .references(() => funnelStagesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    niche: text("niche"),
    subniche: text("subniche"),
    origin: crmLeadOriginEnum("origin").notNull().default("manual"),
    value: numeric("value", { precision: 10, scale: 2 }),
    notes: text("notes"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    companyIdIdx: index("crm_leads_company_id_idx").on(t.companyId),
    stageIdIdx: index("crm_leads_stage_id_idx").on(t.stageId),
  })
);

export const leadActivitiesTable = pgTable(
  "lead_activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => crmLeadsTable.id, { onDelete: "cascade" }),
    fromStageId: uuid("from_stage_id").references(() => funnelStagesTable.id, {
      onDelete: "set null",
    }),
    toStageId: uuid("to_stage_id").references(() => funnelStagesTable.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    leadIdIdx: index("lead_activities_lead_id_idx").on(t.leadId),
    createdAtIdx: index("lead_activities_created_at_idx").on(t.createdAt),
  })
);
```

- [x] **Aplicar no Neon**

```bash
npx drizzle-kit push
```

Note o índice único `(companyId, position)` em `funnel_stages`: o seed precisa inserir as 8 etapas de uma vez (`bulkCreate`), com posições únicas de 0 a 7 — nunca uma a uma com a mesma posição repetida.

---

## Task 3: Domain — interfaces puras

- [x] **Criar `src/domain/repositories/IFunnelStageRepository.ts`**

```typescript
export type StageKind = "normal" | "won" | "lost" | "triage";

export interface FunnelStage {
  id: string;
  companyId: string;
  name: string;
  position: number;
  colorHex: string;
  kind: StageKind;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export type CreateFunnelStageData = Omit<FunnelStage, "id" | "createdAt" | "updatedAt">;

export interface IFunnelStageRepository {
  findAllByCompany(companyId: string): Promise<FunnelStage[]>;
  findById(id: string, companyId: string): Promise<FunnelStage | null>;
  countByCompany(companyId: string): Promise<number>;
  bulkCreate(stages: CreateFunnelStageData[]): Promise<FunnelStage[]>;
  update(id: string, companyId: string, data: Partial<CreateFunnelStageData>): Promise<FunnelStage>;
}
```

- [x] **Criar `src/domain/repositories/ICrmLeadRepository.ts`**

```typescript
export type CrmLeadOrigin = "manual" | "prospecting";

export interface CrmLead {
  id: string;
  companyId: string;
  prospectingLeadId: string | null;
  stageId: string;
  name: string;
  phone: string | null;
  email: string | null;
  niche: string | null;
  subniche: string | null;
  origin: CrmLeadOrigin;
  value: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export type CreateCrmLeadData = Omit<CrmLead, "id" | "createdAt" | "updatedAt">;

export interface ICrmLeadRepository {
  findAllByCompany(companyId: string): Promise<CrmLead[]>;
  findById(id: string, companyId: string): Promise<CrmLead | null>;
  findByProspectingLeadId(prospectingLeadId: string, companyId: string): Promise<CrmLead | null>;
  findConvertedProspectingLeadIds(companyId: string): Promise<string[]>;
  create(data: CreateCrmLeadData): Promise<CrmLead>;
  update(id: string, companyId: string, data: Partial<Omit<CreateCrmLeadData, "stageId">>): Promise<CrmLead>;
  updateStage(id: string, companyId: string, stageId: string): Promise<CrmLead>;
}
```

Note que `value` é `number | null` aqui no domínio — o Postgres guarda como `numeric`, mas essa conversão é escondida na infraestrutura (ver Task 4).

- [x] **Criar `src/domain/repositories/ILeadActivityRepository.ts`**

```typescript
export interface LeadActivity {
  id: string;
  companyId: string;
  leadId: string;
  fromStageId: string | null;
  toStageId: string | null;
  description: string;
  createdBy: string;
  createdAt: Date;
}

export type CreateLeadActivityData = Omit<LeadActivity, "id" | "createdAt">;

export interface ILeadActivityRepository {
  findByLead(leadId: string, companyId: string): Promise<LeadActivity[]>;
  create(data: CreateLeadActivityData): Promise<LeadActivity>;
}
```

A separação `update()` / `updateStage()` em `ICrmLeadRepository` é intencional: impede, no nível de tipo, que `UpdateCrmLead` (edição de dados) altere `stageId` por engano — só `MoveLead` tem acesso a esse método.

---

## Task 4: Infrastructure — Repositórios Drizzle

Mesmo padrão de `DrizzleNicheRepository.ts` (Fase 2): `constructor(private db: DB)`, toda query com `and(eq(id...), eq(companyId...))`.

- [x] **Criar `src/infrastructure/repositories/DrizzleFunnelStageRepository.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  CreateFunnelStageData,
  FunnelStage,
  IFunnelStageRepository,
} from "@/domain/repositories/IFunnelStageRepository";
import { funnelStagesTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleFunnelStageRepository implements IFunnelStageRepository {
  constructor(private db: DB) {}

  async findAllByCompany(companyId: string): Promise<FunnelStage[]> {
    return this.db
      .select()
      .from(funnelStagesTable)
      .where(eq(funnelStagesTable.companyId, companyId))
      .orderBy(funnelStagesTable.position);
  }

  async findById(id: string, companyId: string): Promise<FunnelStage | null> {
    const [row] = await this.db
      .select()
      .from(funnelStagesTable)
      .where(and(eq(funnelStagesTable.id, id), eq(funnelStagesTable.companyId, companyId)))
      .limit(1);
    return row ?? null;
  }

  async countByCompany(companyId: string): Promise<number> {
    const rows = await this.db
      .select({ id: funnelStagesTable.id })
      .from(funnelStagesTable)
      .where(eq(funnelStagesTable.companyId, companyId));
    return rows.length;
  }

  async bulkCreate(stages: CreateFunnelStageData[]): Promise<FunnelStage[]> {
    return this.db.insert(funnelStagesTable).values(stages).returning();
  }

  async update(
    id: string,
    companyId: string,
    data: Partial<CreateFunnelStageData>
  ): Promise<FunnelStage> {
    const [row] = await this.db
      .update(funnelStagesTable)
      .set(data)
      .where(and(eq(funnelStagesTable.id, id), eq(funnelStagesTable.companyId, companyId)))
      .returning();
    return row;
  }
}
```

- [x] **Criar `src/infrastructure/repositories/DrizzleCrmLeadRepository.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  CreateCrmLeadData,
  CrmLead,
  ICrmLeadRepository,
} from "@/domain/repositories/ICrmLeadRepository";
import { crmLeadsTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;
type CrmLeadRow = typeof crmLeadsTable.$inferSelect;

function toDomain(row: CrmLeadRow): CrmLead {
  return { ...row, value: row.value == null ? null : Number(row.value) };
}

function normalizeValue(value: number | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value == null ? null : String(value);
}

export class DrizzleCrmLeadRepository implements ICrmLeadRepository {
  constructor(private db: DB) {}

  async findAllByCompany(companyId: string): Promise<CrmLead[]> {
    const rows = await this.db
      .select()
      .from(crmLeadsTable)
      .where(eq(crmLeadsTable.companyId, companyId))
      .orderBy(crmLeadsTable.createdAt);
    return rows.map(toDomain);
  }

  async findById(id: string, companyId: string): Promise<CrmLead | null> {
    const [row] = await this.db
      .select()
      .from(crmLeadsTable)
      .where(and(eq(crmLeadsTable.id, id), eq(crmLeadsTable.companyId, companyId)))
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findByProspectingLeadId(
    prospectingLeadId: string,
    companyId: string
  ): Promise<CrmLead | null> {
    const [row] = await this.db
      .select()
      .from(crmLeadsTable)
      .where(
        and(
          eq(crmLeadsTable.prospectingLeadId, prospectingLeadId),
          eq(crmLeadsTable.companyId, companyId)
        )
      )
      .limit(1);
    return row ? toDomain(row) : null;
  }

  async findConvertedProspectingLeadIds(companyId: string): Promise<string[]> {
    const rows = await this.db
      .select({ prospectingLeadId: crmLeadsTable.prospectingLeadId })
      .from(crmLeadsTable)
      .where(eq(crmLeadsTable.companyId, companyId));
    return rows
      .map((r) => r.prospectingLeadId)
      .filter((id): id is string => id !== null);
  }

  async create(data: CreateCrmLeadData): Promise<CrmLead> {
    const [row] = await this.db
      .insert(crmLeadsTable)
      .values({ ...data, value: normalizeValue(data.value) })
      .returning();
    return toDomain(row);
  }

  async update(
    id: string,
    companyId: string,
    data: Partial<Omit<CreateCrmLeadData, "stageId">>
  ): Promise<CrmLead> {
    const [row] = await this.db
      .update(crmLeadsTable)
      .set({ ...data, value: normalizeValue(data.value) })
      .where(and(eq(crmLeadsTable.id, id), eq(crmLeadsTable.companyId, companyId)))
      .returning();
    return toDomain(row);
  }

  async updateStage(id: string, companyId: string, stageId: string): Promise<CrmLead> {
    const [row] = await this.db
      .update(crmLeadsTable)
      .set({ stageId })
      .where(and(eq(crmLeadsTable.id, id), eq(crmLeadsTable.companyId, companyId)))
      .returning();
    return toDomain(row);
  }
}
```

`DrizzleCrmLeadRepository` é o único com uma peculiaridade: converte `value` de `string | null` (formato `numeric` do Postgres) para `number | null` (domínio) na leitura, e o inverso na escrita, via os helpers `toDomain` e `normalizeValue`.

- [x] **Criar `src/infrastructure/repositories/DrizzleLeadActivityRepository.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  CreateLeadActivityData,
  ILeadActivityRepository,
  LeadActivity,
} from "@/domain/repositories/ILeadActivityRepository";
import { leadActivitiesTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleLeadActivityRepository implements ILeadActivityRepository {
  constructor(private db: DB) {}

  async findByLead(leadId: string, companyId: string): Promise<LeadActivity[]> {
    return this.db
      .select()
      .from(leadActivitiesTable)
      .where(
        and(eq(leadActivitiesTable.leadId, leadId), eq(leadActivitiesTable.companyId, companyId))
      )
      .orderBy(leadActivitiesTable.createdAt);
  }

  async create(data: CreateLeadActivityData): Promise<LeadActivity> {
    const [row] = await this.db.insert(leadActivitiesTable).values(data).returning();
    return row;
  }
}
```

---

## Task 5: Utilitários — `src/lib/format.ts`

- [x] Adicionado ao final do arquivo:

```typescript
// ── CRM / Funil ──────────────────────────────────────────────────────────────

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export const STAGE_KIND_BORDER_CLASSES: Record<StageKind, string> = {
  normal: "border-slate-200",
  won: "border-emerald-300",
  lost: "border-red-300",
  triage: "border-slate-200",
};
```

---

## Task 6: Use Cases — Funil

- [x] **Criar `src/use-cases/funil/SeedFunnelStages.ts`** — guarda de idempotência via `countByCompany`; array literal das 8 etapas padrão (nomes/cores/kind abaixo).

```typescript
import type {
  CreateFunnelStageData,
  FunnelStage,
  IFunnelStageRepository,
} from "@/domain/repositories/IFunnelStageRepository";

type Input = { companyId: string };
type Result = { ok: true; data: FunnelStage[] } | { ok: false; error: string };

const DEFAULT_STAGES: Omit<CreateFunnelStageData, "companyId">[] = [
  { name: "Triagem", position: 0, colorHex: "#94a3b8", kind: "triage", isActive: true },
  { name: "Novo", position: 1, colorHex: "#6366f1", kind: "normal", isActive: true },
  { name: "Contato Iniciado", position: 2, colorHex: "#8b5cf6", kind: "normal", isActive: true },
  { name: "Respondeu", position: 3, colorHex: "#f59e0b", kind: "normal", isActive: true },
  { name: "Reunião Marcada", position: 4, colorHex: "#f97316", kind: "normal", isActive: true },
  { name: "Proposta Enviada", position: 5, colorHex: "#06b6d4", kind: "normal", isActive: true },
  { name: "Fechado", position: 6, colorHex: "#22c55e", kind: "won", isActive: true },
  { name: "Perdido", position: 7, colorHex: "#ef4444", kind: "lost", isActive: true },
];

export class SeedFunnelStages {
  constructor(private stageRepo: IFunnelStageRepository) {}

  async execute(input: Input): Promise<Result> {
    try {
      const existing = await this.stageRepo.countByCompany(input.companyId);
      if (existing > 0) {
        const stages = await this.stageRepo.findAllByCompany(input.companyId);
        return { ok: true, data: stages };
      }

      const stages = await this.stageRepo.bulkCreate(
        DEFAULT_STAGES.map((stage) => ({ ...stage, companyId: input.companyId }))
      );
      return { ok: true, data: stages };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar etapas padrão" };
    }
  }
}
```

- [x] **Criar `src/use-cases/funil/CreateCrmLead.ts`** — valida nome, cria o lead, registra `LeadActivity` com `fromStageId: null` e descrição `"Lead criado manualmente"`.

```typescript
import type { CreateCrmLeadData, CrmLead, ICrmLeadRepository } from "@/domain/repositories/ICrmLeadRepository";
import type { ILeadActivityRepository } from "@/domain/repositories/ILeadActivityRepository";

type Input = CreateCrmLeadData & { createdBy: string };
type Result = { ok: true; data: CrmLead } | { ok: false; error: string };

export class CreateCrmLead {
  constructor(
    private crmLeadRepo: ICrmLeadRepository,
    private leadActivityRepo: ILeadActivityRepository
  ) {}

  async execute(input: Input): Promise<Result> {
    try {
      if (!input.name.trim()) return { ok: false, error: "Nome do lead é obrigatório" };

      const { createdBy, ...data } = input;
      const lead = await this.crmLeadRepo.create(data);

      await this.leadActivityRepo.create({
        companyId: lead.companyId,
        leadId: lead.id,
        fromStageId: null,
        toStageId: lead.stageId,
        description: "Lead criado manualmente",
        createdBy,
      });

      return { ok: true, data: lead };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar lead" };
    }
  }
}
```

- [x] **Criar `src/use-cases/funil/MoveLead.ts`** — no-op se `stageId` de destino é igual ao atual (evita atividade espúria ao soltar na mesma coluna); senão atualiza via `updateStage` e registra atividade com a descrição `"Lead movido de X para Y"`.

```typescript
import type { CrmLead, ICrmLeadRepository } from "@/domain/repositories/ICrmLeadRepository";
import type { ILeadActivityRepository } from "@/domain/repositories/ILeadActivityRepository";

type Input = {
  leadId: string;
  companyId: string;
  toStageId: string;
  toStageName: string;
  fromStageName: string;
  userId: string;
};
type Result = { ok: true; data: CrmLead } | { ok: false; error: string };

export class MoveLead {
  constructor(
    private crmLeadRepo: ICrmLeadRepository,
    private leadActivityRepo: ILeadActivityRepository
  ) {}

  async execute(input: Input): Promise<Result> {
    try {
      const lead = await this.crmLeadRepo.findById(input.leadId, input.companyId);
      if (!lead) return { ok: false, error: "Lead não encontrado" };

      if (lead.stageId === input.toStageId) return { ok: true, data: lead };

      const updated = await this.crmLeadRepo.updateStage(
        input.leadId,
        input.companyId,
        input.toStageId
      );

      await this.leadActivityRepo.create({
        companyId: input.companyId,
        leadId: input.leadId,
        fromStageId: lead.stageId,
        toStageId: input.toStageId,
        description: `Lead movido de ${input.fromStageName} para ${input.toStageName}`,
        createdBy: input.userId,
      });

      return { ok: true, data: updated };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao mover lead" };
    }
  }
}
```

- [x] **Criar `src/use-cases/funil/UpdateCrmLead.ts`** — edita dados (telefone, e-mail, nicho, subnicho, valor, notas, nome); nunca toca em `stageId`.

```typescript
import type {
  CreateCrmLeadData,
  CrmLead,
  ICrmLeadRepository,
} from "@/domain/repositories/ICrmLeadRepository";

type Input = {
  id: string;
  companyId: string;
  data: Partial<Omit<CreateCrmLeadData, "stageId" | "companyId" | "origin" | "prospectingLeadId">>;
};
type Result = { ok: true; data: CrmLead } | { ok: false; error: string };

export class UpdateCrmLead {
  constructor(private crmLeadRepo: ICrmLeadRepository) {}

  async execute(input: Input): Promise<Result> {
    try {
      const lead = await this.crmLeadRepo.update(input.id, input.companyId, input.data);
      return { ok: true, data: lead };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao atualizar lead" };
    }
  }
}
```

- [x] **Criar `src/use-cases/funil/ConvertProspectingLead.ts`** — checa duplicidade via `findByProspectingLeadId` (idempotência), carrega o `ProspectingLead`, cria o `CrmLead` (`origin: "prospecting"`) na etapa alvo resolvida pela action, registra atividade `"Lead convertido da prospecção"`.

```typescript
import type { CrmLead, ICrmLeadRepository } from "@/domain/repositories/ICrmLeadRepository";
import type { ILeadActivityRepository } from "@/domain/repositories/ILeadActivityRepository";
import type { ILeadRepository } from "@/domain/repositories/ILeadRepository";

type Input = {
  prospectingLeadId: string;
  companyId: string;
  nicheName: string | null;
  targetStageId: string;
  userId: string;
};
type Result = { ok: true; data: CrmLead } | { ok: false; error: string };

export class ConvertProspectingLead {
  constructor(
    private crmLeadRepo: ICrmLeadRepository,
    private leadRepo: ILeadRepository,
    private leadActivityRepo: ILeadActivityRepository
  ) {}

  async execute(input: Input): Promise<Result> {
    try {
      const already = await this.crmLeadRepo.findByProspectingLeadId(
        input.prospectingLeadId,
        input.companyId
      );
      if (already) return { ok: false, error: "Lead já convertido" };

      const prospectingLead = await this.leadRepo.findById(input.prospectingLeadId, input.companyId);
      if (!prospectingLead) return { ok: false, error: "Lead de prospecção não encontrado" };

      const crmLead = await this.crmLeadRepo.create({
        companyId: input.companyId,
        prospectingLeadId: prospectingLead.id,
        stageId: input.targetStageId,
        name: prospectingLead.name,
        phone: prospectingLead.phone,
        email: prospectingLead.email,
        niche: input.nicheName,
        subniche: null,
        origin: "prospecting",
        value: null,
        notes: null,
      });

      await this.leadActivityRepo.create({
        companyId: input.companyId,
        leadId: crmLead.id,
        fromStageId: null,
        toStageId: input.targetStageId,
        description: "Lead convertido da prospecção",
        createdBy: input.userId,
      });

      return { ok: true, data: crmLead };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao converter lead" };
    }
  }
}
```

### As 8 etapas padrão

| # | Nome | Posição | Cor | Kind |
|---|------|---------|-----|------|
| 1 | Triagem | 0 | `#94a3b8` | triage |
| 2 | Novo | 1 | `#6366f1` | normal |
| 3 | Contato Iniciado | 2 | `#8b5cf6` | normal |
| 4 | Respondeu | 3 | `#f59e0b` | normal |
| 5 | Reunião Marcada | 4 | `#f97316` | normal |
| 6 | Proposta Enviada | 5 | `#06b6d4` | normal |
| 7 | Fechado | 6 | `#22c55e` | won |
| 8 | Perdido | 7 | `#ef4444` | lost |

Leads criados **manualmente** entram em "Triagem" (posição 0) — precisam de vetting antes de entrar no fluxo comercial. Leads **convertidos da prospecção** entram direto em "Novo" (posição 1, primeira etapa `kind: "normal"`) — já passaram por captação e score na Fase 2, não precisam de triagem novamente.

---

## Task 7: Server Actions

- [x] **Criar `src/app/actions/funil/get-funil-bootstrap.ts`** — roda o seed lazy (se `stages.length === 0`) e retorna `{ stages, leads }`.

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleFunnelStageRepository } from "@/infrastructure/repositories/DrizzleFunnelStageRepository";
import { SeedFunnelStages } from "@/use-cases/funil/SeedFunnelStages";

export async function getFunilBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const stageRepo = new DrizzleFunnelStageRepository(db);
  const crmLeadRepo = new DrizzleCrmLeadRepository(db);

  const seedUseCase = new SeedFunnelStages(stageRepo);
  const seedResult = await seedUseCase.execute({ companyId });
  const stages = seedResult.ok ? seedResult.data : await stageRepo.findAllByCompany(companyId);

  const leads = await crmLeadRepo.findAllByCompany(companyId);

  return { stages, leads };
}
```

- [x] **Criar `src/app/actions/funil/create-crm-lead.ts`**

```typescript
"use server";

import { z } from "zod";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleLeadActivityRepository } from "@/infrastructure/repositories/DrizzleLeadActivityRepository";
import { CreateCrmLead } from "@/use-cases/funil/CreateCrmLead";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  niche: z.string().optional().nullable(),
  subniche: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  stageId: z.string().uuid(),
});

export async function createCrmLeadAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const crmLeadRepo = new DrizzleCrmLeadRepository(db);
  const leadActivityRepo = new DrizzleLeadActivityRepository(db);
  const useCase = new CreateCrmLead(crmLeadRepo, leadActivityRepo);

  return useCase.execute({
    companyId,
    prospectingLeadId: null,
    stageId: parsed.data.stageId,
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    niche: parsed.data.niche || null,
    subniche: parsed.data.subniche || null,
    origin: "manual",
    value: parsed.data.value ?? null,
    notes: parsed.data.notes || null,
    createdBy: user.id,
  });
}
```

- [x] **Criar `src/app/actions/funil/move-lead.ts`**

```typescript
"use server";

import { z } from "zod";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleLeadActivityRepository } from "@/infrastructure/repositories/DrizzleLeadActivityRepository";
import { MoveLead } from "@/use-cases/funil/MoveLead";

const schema = z.object({
  leadId: z.string().uuid(),
  toStageId: z.string().uuid(),
  toStageName: z.string().min(1),
  fromStageName: z.string().min(1),
});

export async function moveLeadAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const crmLeadRepo = new DrizzleCrmLeadRepository(db);
  const leadActivityRepo = new DrizzleLeadActivityRepository(db);
  const useCase = new MoveLead(crmLeadRepo, leadActivityRepo);

  return useCase.execute({ ...parsed.data, companyId, userId: user.id });
}
```

- [x] **Criar `src/app/actions/funil/update-crm-lead.ts`**

```typescript
"use server";

import { z } from "zod";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { UpdateCrmLead } from "@/use-cases/funil/UpdateCrmLead";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  niche: z.string().optional().nullable(),
  subniche: z.string().optional().nullable(),
  value: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function updateCrmLeadAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const { id, ...data } = parsed.data;
  const crmLeadRepo = new DrizzleCrmLeadRepository(db);
  const useCase = new UpdateCrmLead(crmLeadRepo);

  return useCase.execute({ id, companyId, data });
}
```

- [x] **Criar `src/app/actions/funil/get-lead-activities.ts`** — leitura sob demanda, chamada só quando o usuário abre a aba "Histórico" no drawer (evita payload grande no bootstrap inicial).

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleLeadActivityRepository } from "@/infrastructure/repositories/DrizzleLeadActivityRepository";

export async function getLeadActivitiesAction(leadId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const repo = new DrizzleLeadActivityRepository(db);
  const activities = await repo.findByLead(leadId, companyId);
  return { ok: true as const, data: activities };
}
```

- [x] **Criar `src/app/actions/leads/convert-prospecting-lead.ts`** — resolve o nome do nicho (via `DrizzleNicheRepository`) e a etapa alvo ("Novo", ou a primeira `kind: "normal"` por posição) antes de chamar `ConvertProspectingLead`. Também dispara o seed lazy — um lead de prospecção pode ser convertido antes mesmo de o usuário ter aberto `/funil` uma vez.

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleFunnelStageRepository } from "@/infrastructure/repositories/DrizzleFunnelStageRepository";
import { DrizzleLeadActivityRepository } from "@/infrastructure/repositories/DrizzleLeadActivityRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { SeedFunnelStages } from "@/use-cases/funil/SeedFunnelStages";
import { ConvertProspectingLead } from "@/use-cases/funil/ConvertProspectingLead";

export async function convertProspectingLeadAction(prospectingLeadId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const crmLeadRepo = new DrizzleCrmLeadRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);
  const stageRepo = new DrizzleFunnelStageRepository(db);
  const leadActivityRepo = new DrizzleLeadActivityRepository(db);

  const seedResult = await new SeedFunnelStages(stageRepo).execute({ companyId });
  const stages = seedResult.ok ? seedResult.data : await stageRepo.findAllByCompany(companyId);

  const targetStage =
    stages.filter((s) => s.kind === "normal").sort((a, b) => a.position - b.position)[0] ??
    stages.sort((a, b) => a.position - b.position)[0];

  if (!targetStage) return { ok: false as const, error: "Nenhuma etapa de funil disponível" };

  const prospectingLead = await leadRepo.findById(prospectingLeadId, companyId);
  const niche = prospectingLead ? await nicheRepo.findById(prospectingLead.nicheId, companyId) : null;

  const useCase = new ConvertProspectingLead(crmLeadRepo, leadRepo, leadActivityRepo);
  return useCase.execute({
    prospectingLeadId,
    companyId,
    nicheName: niche?.name ?? null,
    targetStageId: targetStage.id,
    userId: user.id,
  });
}
```

- [x] **Modificar `src/app/actions/leads/get-leads-bootstrap.ts`** — agora também retorna `convertedProspectingLeadIds: string[]`, usado pela UI de Leads para esconder/desabilitar o botão de conversão em leads já convertidos.

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";

export async function getLeadsBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const leadRepo = new DrizzleLeadRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);
  const crmLeadRepo = new DrizzleCrmLeadRepository(db);

  const [leads, campaigns, convertedProspectingLeadIds] = await Promise.all([
    leadRepo.findAllByCompany(companyId),
    campaignRepo.findAllByCompany(companyId),
    crmLeadRepo.findConvertedProspectingLeadIds(companyId),
  ]);

  return { leads, campaigns, convertedProspectingLeadIds };
}
```

---

## Task 8: Página do Funil — `src/app/(protected)/funil/page.tsx`

Mesmo formato de Server Component thin das páginas da Fase 2 (`generateMetadata` + `BasePageLayout` + `Suspense` + Data Loader assíncrono chamando a bootstrap action). A diferença em relação às páginas da Fase 2: `FunilContent` usa `@dnd-kit`, que toca `document`/`window` durante a inicialização dos sensores — precisa entrar via `next/dynamic` com `ssr: false`, exatamente pela mesma razão que `CampaignMap`/`LeadsMap` (Leaflet) precisam disso na Fase 2. A regra do projeto é literal: **Leaflet / DnD → sempre `dynamic(() => import(...), { ssr: false })`.**

```tsx
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

import { getFunilBootstrapAction } from "@/app/actions/funil/get-funil-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

const FunilContent = dynamic(
  () => import("./_components/FunilContent").then((mod) => mod.FunilContent),
  { ssr: false }
);

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Funil" };
}

export default function FunilPage() {
  return (
    <BasePageLayout>
      <Suspense
        fallback={<LoadingContent title="Carregando funil..." withHeader={false} rows={6} />}
      >
        <FunilDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function FunilDataLoader() {
  const { stages, leads } = await getFunilBootstrapAction();
  return <FunilContent initialStages={stages} initialLeads={leads} />;
}
```

**Armadilha corrigida:** a primeira versão desta página importava `FunilContent` estaticamente (`import { FunilContent } from "./_components/FunilContent"`). Funcionava em desenvolvimento, mas violava a regra de dynamic import client-only — o `@dnd-kit` acessa `document` na montagem dos sensores de drag, o que pode causar mismatch de hidratação em produção. O fix é o `dynamic(..., { ssr: false })` acima, junto de `.then((mod) => mod.FunilContent)` porque `FunilContent` é um named export, não default.

---

## Task 9: `FunilContent` — Kanban, drawer, dnd-kit

- [ ] **Criar `src/app/(protected)/funil/_components/FunilContent.tsx`**

`src/app/(protected)/funil/_components/FunilContent.tsx` concentra toda a interatividade em um único Client Component, seguindo o padrão de `LeadsContent`/`NichosContent` da Fase 2:

- **`KanbanColumn`** — droppable (`useDroppable`), mostra nome/cor/contagem/soma de valores da etapa, borda condicional por `kind` (`STAGE_KIND_BORDER_CLASSES`), destaque visual quando recebendo um drag (`isOver`).
- **`DraggableLeadCard`** / **`LeadCard`** — draggable (`useDraggable`), mostra nome, ícone de origem (`Target` para prospecção, `User` para manual), badge de nicho, telefone, valor formatado (`formatBRL`) e atalho de WhatsApp.
- O drawer de detalhes (via `Sheet` + `Tabs`, inline no JSX) — aba "Dados" (contato, valor, observações editáveis, botão "Avançar etapa", botão WhatsApp) e aba "Histórico" (carregada sob demanda via `getLeadActivitiesAction`, timeline com `date-fns` + `ptBR`).
- O modal de novo lead (via `Dialog`, inline no JSX) — formulário de criação manual, sempre destinado à etapa "Triagem".
- **`Section`/`Row`** — helpers de layout para o drawer.
- **Topo**: busca client-side (nome/telefone), `DndContext` com `PointerSensor` (`activationConstraint: { distance: 5 }`), `DragOverlay` mostrando o card sendo arrastado.

O `onDragEnd` faz atualização otimista do estado local e chama `moveLeadAction`; se a action falhar, reverte o estado e mostra `toast.error`. O mesmo padrão otimista se repete em `handleAdvance` (botão "Avançar etapa" no drawer).

```tsx
"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, MessageCircle, Phone, Plus, Search, Target, User } from "lucide-react";
import { toast } from "sonner";

import type { CrmLead } from "@/domain/repositories/ICrmLeadRepository";
import type { FunnelStage } from "@/domain/repositories/IFunnelStageRepository";
import type { LeadActivity } from "@/domain/repositories/ILeadActivityRepository";
import { createCrmLeadAction } from "@/app/actions/funil/create-crm-lead";
import { getLeadActivitiesAction } from "@/app/actions/funil/get-lead-activities";
import { moveLeadAction } from "@/app/actions/funil/move-lead";
import { updateCrmLeadAction } from "@/app/actions/funil/update-crm-lead";
import { formatBRL, STAGE_KIND_BORDER_CLASSES } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";

type LeadForm = {
  name: string;
  phone: string;
  email: string;
  niche: string;
  subniche: string;
  value: string;
  notes: string;
};

const emptyForm: LeadForm = {
  name: "",
  phone: "",
  email: "",
  niche: "",
  subniche: "",
  value: "",
  notes: "",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{children}</span>
    </div>
  );
}

function LeadCard({ lead }: { lead: CrmLead }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5">
        {lead.origin === "prospecting" ? (
          <Target className="h-3.5 w-3.5 text-blue-500" />
        ) : (
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <p className="truncate text-sm font-medium text-foreground">{lead.name}</p>
      </div>
      {lead.niche && (
        <Badge variant="secondary" className="mb-1.5 text-[11px]">
          {lead.niche}
        </Badge>
      )}
      {lead.phone && (
        <p className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" /> {lead.phone}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        {lead.value != null ? (
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {formatBRL(lead.value)}
          </span>
        ) : (
          <span />
        )}
        {lead.phone && (
          <a
            href={`https://wa.me/${lead.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-600 hover:bg-emerald-50"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function DraggableLeadCard({ lead, onClick }: { lead: CrmLead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={`cursor-pointer ${isDragging ? "opacity-30" : ""}`}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

function KanbanColumn({
  stage,
  leads,
  onSelect,
}: {
  stage: FunnelStage;
  leads: CrmLead[];
  onSelect: (lead: CrmLead) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((sum, l) => sum + (l.value ?? 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border bg-muted/20 ${STAGE_KIND_BORDER_CLASSES[stage.kind]} ${
        isOver ? "ring-2 ring-indigo-300 bg-indigo-50" : ""
      }`}
    >
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: stage.colorHex }}
          />
          <p className="text-sm font-semibold text-foreground">{stage.name}</p>
          <Badge variant="secondary" className="text-[11px]">
            {leads.length}
          </Badge>
        </div>
      </div>
      {total > 0 && (
        <p className="border-b border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
          {formatBRL(total)}
        </p>
      )}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
        {leads.map((lead) => (
          <DraggableLeadCard key={lead.id} lead={lead} onClick={() => onSelect(lead)} />
        ))}
      </div>
    </div>
  );
}

interface FunilContentProps {
  initialStages: FunnelStage[];
  initialLeads: CrmLead[];
}

export function FunilContent({ initialStages, initialLeads }: FunilContentProps) {
  const [stages] = useState<FunnelStage[]>(
    [...initialStages].sort((a, b) => a.position - b.position)
  );
  const [leads, setLeads] = useState<CrmLead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState<LeadForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [activities, setActivities] = useState<Record<string, LeadActivity[]>>({});
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [value, setValue] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.phone ?? "").includes(q)
    );
  }, [leads, search]);

  const leadsByStage = useMemo(() => {
    const map: Record<string, CrmLead[]> = {};
    stages.forEach((s) => (map[s.id] = []));
    filteredLeads.forEach((l) => {
      if (map[l.stageId]) map[l.stageId].push(l);
    });
    return map;
  }, [stages, filteredLeads]);

  const selected = leads.find((l) => l.id === selectedId) ?? null;
  const draggingLead = leads.find((l) => l.id === activeId) ?? null;

  function updateLeadLocal(id: string, patch: Partial<CrmLead>) {
    setLeads((arr) => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function openDrawer(lead: CrmLead) {
    setSelectedId(lead.id);
    setNotes(lead.notes ?? "");
    setValue(lead.value != null ? String(lead.value) : "");
  }

  async function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = String(active.id);
    const toStageId = String(over.id);
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === toStageId) return;

    const fromStage = stages.find((s) => s.id === lead.stageId);
    const toStage = stages.find((s) => s.id === toStageId);
    if (!toStage) return;

    const previousStageId = lead.stageId;
    updateLeadLocal(leadId, { stageId: toStageId });

    const result = await moveLeadAction({
      leadId,
      toStageId,
      toStageName: toStage.name,
      fromStageName: fromStage?.name ?? "",
    });

    if (!result.ok) {
      updateLeadLocal(leadId, { stageId: previousStageId });
      toast.error(result.error);
      return;
    }

    toast.success(`Lead movido para ${toStage.name}`);
  }

  async function handleAdvance() {
    if (!selected) return;
    const ordered = [...stages].sort((a, b) => a.position - b.position);
    const idx = ordered.findIndex((s) => s.id === selected.stageId);
    const next = ordered[idx + 1];
    if (!next) return;

    const fromStage = ordered[idx];
    const previousStageId = selected.stageId;
    updateLeadLocal(selected.id, { stageId: next.id });

    const result = await moveLeadAction({
      leadId: selected.id,
      toStageId: next.id,
      toStageName: next.name,
      fromStageName: fromStage?.name ?? "",
    });

    if (!result.ok) {
      updateLeadLocal(selected.id, { stageId: previousStageId });
      toast.error(result.error);
      return;
    }

    toast.success(`Lead avançou para ${next.name}`);
  }

  async function handleSaveDrawer() {
    if (!selected) return;
    const result = await updateCrmLeadAction({
      id: selected.id,
      notes: notes || null,
      value: value.trim() ? Number(value) : null,
    });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    updateLeadLocal(selected.id, result.data);
    toast.success("Lead atualizado");
  }

  async function handleLoadActivities(leadId: string) {
    if (activities[leadId]) return;
    setActivitiesLoading(true);
    const result = await getLeadActivitiesAction(leadId);
    setActivitiesLoading(false);
    if (result.ok) setActivities((prev) => ({ ...prev, [leadId]: result.data }));
  }

  async function handleCreateLead() {
    if (!form.name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    const triageStage =
      stages.find((s) => s.kind === "triage") ??
      [...stages].sort((a, b) => a.position - b.position)[0];
    if (!triageStage) return;

    setSaving(true);
    const result = await createCrmLeadAction({
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      niche: form.niche || null,
      subniche: form.subniche || null,
      value: form.value.trim() ? Number(form.value) : null,
      notes: form.notes || null,
      stageId: triageStage.id,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLeads((prev) => [result.data, ...prev]);
    setForm(emptyForm);
    setNewOpen(false);
    toast.success("Lead criado");
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Funil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""} no pipeline
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou telefone..."
              className="w-64 pl-8"
            />
          </div>
          <Button size="sm" onClick={() => setNewOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Novo Lead
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              leads={leadsByStage[stage.id] ?? []}
              onSelect={openDrawer}
            />
          ))}
        </div>
        <DragOverlay>{draggingLead ? <LeadCard lead={draggingLead} /> : null}</DragOverlay>
      </DndContext>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full max-w-md overflow-y-auto px-6">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>{selected.name}</SheetTitle>
              </SheetHeader>

              <Tabs
                defaultValue="dados"
                onValueChange={(v) => {
                  if (v === "historico") handleLoadActivities(selected.id);
                }}
              >
                <TabsList className="mb-4">
                  <TabsTrigger value="dados">Dados</TabsTrigger>
                  <TabsTrigger value="historico">Histórico</TabsTrigger>
                </TabsList>

                <TabsContent value="dados" className="space-y-5">
                  <Section title="Classificação">
                    <div className="space-y-1.5">
                      <Row label="Origem">
                        {selected.origin === "prospecting" ? "Prospecção" : "Manual"}
                      </Row>
                      {selected.niche && <Row label="Nicho">{selected.niche}</Row>}
                    </div>
                  </Section>

                  <Section title="Contato">
                    <div className="space-y-1.5">
                      {selected.phone && (
                        <p className="flex items-center gap-1.5 text-sm">
                          <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {selected.phone}
                        </p>
                      )}
                      {selected.email && (
                        <p className="text-sm text-muted-foreground">{selected.email}</p>
                      )}
                    </div>
                  </Section>

                  <Section title="Valor">
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      placeholder="0,00"
                    />
                  </Section>

                  <Section title="Observações">
                    <Textarea
                      rows={4}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anotações sobre o lead..."
                    />
                  </Section>

                  <Button className="w-full" onClick={handleSaveDrawer}>
                    Salvar
                  </Button>

                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleAdvance}>
                      Avançar etapa
                    </Button>
                    {selected.phone && (
                      <Button
                        className="flex-1"
                        onClick={() =>
                          window.open(
                            `https://wa.me/${selected.phone!.replace(/\D/g, "")}`,
                            "_blank"
                          )
                        }
                      >
                        <MessageCircle className="mr-1.5 h-4 w-4" /> WhatsApp
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="historico">
                  {activitiesLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (activities[selected.id]?.length ?? 0) === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma atividade registrada
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {[...(activities[selected.id] ?? [])].reverse().map((activity) => (
                        <div
                          key={activity.id}
                          className="rounded-lg border border-border bg-muted/30 p-3"
                        >
                          <p className="text-sm text-foreground">{activity.description}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {format(activity.createdAt, "dd/MM/yyyy HH:mm", { locale: ptBR })} ·{" "}
                            {formatDistanceToNow(activity.createdAt, {
                              addSuffix: true,
                              locale: ptBR,
                            })}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lead-name">Nome *</Label>
              <Input
                id="lead-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="lead-phone">Telefone</Label>
                <Input
                  id="lead-phone"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input
                  id="lead-email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="lead-niche">Nicho</Label>
                <Input
                  id="lead-niche"
                  value={form.niche}
                  onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="lead-subniche">Subnicho</Label>
                <Input
                  id="lead-subniche"
                  value={form.subniche}
                  onChange={(e) => setForm((f) => ({ ...f, subniche: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-value">Valor estimado</Label>
              <Input
                id="lead-value"
                type="number"
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lead-notes">Observações</Label>
              <Textarea
                id="lead-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateLead} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

---

## Task 10: Integração — botão "Converter para CRM" em `LeadsContent`

No sheet de detalhe já existente na página de Leads (Fase 2), foi adicionado um botão "Converter para CRM" (ícone `Kanban`), desabilitado quando o lead já foi convertido (checagem via `convertedProspectingLeadIds`, vindo do bootstrap). Ao converter com sucesso, um toast com ação "Ver no funil" navega para `/funil`.

- [x] **Modificar `src/app/(protected)/prospeccao/leads/_components/LeadsContent.tsx`**

```diff
 import {
   Camera,
   Globe,
+  Kanban,
   List,
   Loader2,
   Map,
@@
 import type { Campaign } from "@/domain/repositories/ICampaignRepository";
 import type { Lead, LeadStatus } from "@/domain/repositories/ILeadRepository";
+import { convertProspectingLeadAction } from "@/app/actions/leads/convert-prospecting-lead";
 import { generateDiagnosisAction } from "@/app/actions/leads/generate-diagnosis";
 import { generateMessageAction } from "@/app/actions/leads/generate-message";
 import { updateLeadStatusAction } from "@/app/actions/leads/update-lead-status";
@@
 interface LeadsContentProps {
   initialLeads: Lead[];
   initialCampaigns: Campaign[];
+  initialConvertedProspectingLeadIds?: string[];
 }

-export function LeadsContent({ initialLeads, initialCampaigns }: LeadsContentProps) {
+export function LeadsContent({
+  initialLeads,
+  initialCampaigns,
+  initialConvertedProspectingLeadIds = [],
+}: LeadsContentProps) {
   const [leads, setLeads] = useState<Lead[]>(initialLeads);
   const [campaigns] = useState<Campaign[]>(initialCampaigns);
+  const [convertedIds, setConvertedIds] = useState<Set<string>>(
+    new Set(initialConvertedProspectingLeadIds)
+  );
   const [view, setView] = useState<"list" | "map">("list");
   const [campaignId, setCampaignId] = useState("all");
   const [status, setStatus] = useState("all");
@@
   const [generatedMessage, setGeneratedMessage] = useState("");
+  const [converting, setConverting] = useState(false);
@@
+  async function handleConvert() {
+    if (!selected) return;
+    setConverting(true);
+    const result = await convertProspectingLeadAction(selected.id);
+    setConverting(false);
+    if (!result.ok) {
+      toast.error(result.error);
+      return;
+    }
+    setConvertedIds((prev) => new Set(prev).add(selected.id));
+    toast.success("Lead convertido para o CRM", {
+      action: { label: "Ver no funil", onClick: () => window.location.assign("/funil") },
+    });
+  }
+
   function openWhatsApp() {
     ...
   }
```

E, dentro do sheet de detalhe (JSX), logo antes do bloco "Mudar status":

```tsx
{/* Converter para CRM */}
<div>
  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Funil comercial
  </p>
  <Button
    variant="outline"
    className="w-full"
    disabled={converting || convertedIds.has(selected.id)}
    onClick={handleConvert}
  >
    {converting ? (
      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
    ) : (
      <Kanban className="mr-1.5 h-4 w-4" />
    )}
    {convertedIds.has(selected.id) ? "Já convertido" : "Converter para CRM"}
  </Button>
</div>
```

- [x] **Modificar `src/app/(protected)/prospeccao/leads/page.tsx`** — repassar `convertedProspectingLeadIds`:

```diff
 async function LeadsDataLoader() {
-  const { leads, campaigns } = await getLeadsBootstrapAction();
-  return <LeadsContent initialLeads={leads} initialCampaigns={campaigns} />;
+  const { leads, campaigns, convertedProspectingLeadIds } = await getLeadsBootstrapAction();
+  return (
+    <LeadsContent
+      initialLeads={leads}
+      initialCampaigns={campaigns}
+      initialConvertedProspectingLeadIds={convertedProspectingLeadIds}
+    />
+  );
 }
```

---

## Task 11: Sidebar — novo item de navegação

Em `src/components/layout/Sidebar.tsx`, adicionado `{ href: "/funil", label: "Funil", icon: Kanban, exact: false }` logo após "Leads" em `navItems` — reflete o fluxo conceitual prospecção → funil.

```diff
-import { BarChart2, Crosshair, LogOut, Map, Tag, Users } from "lucide-react";
+import { BarChart2, Crosshair, Kanban, LogOut, Map, Tag, Users } from "lucide-react";
@@
   { href: "/prospeccao/nichos", label: "Nichos", icon: Tag, exact: false },
   { href: "/prospeccao/campanhas", label: "Campanhas", icon: Map, exact: false },
   { href: "/prospeccao/leads", label: "Leads", icon: Users, exact: false },
+  { href: "/funil", label: "Funil", icon: Kanban, exact: false },
 ];
```

---

## Task 12: Verificação final

- [x] `npx drizzle-kit push` — tabelas e enums criados sem prompt destrutivo.
- [x] `npm run build` — compila sem erros de TypeScript, sem `any`.
- [x] `npx eslint` nos arquivos novos/modificados da Fase 3 — zero erros/warnings.
- [x] Smoke test: `/funil` sem sessão redireciona para `/login` (guard de tenant funcionando).
- [x] **Verificado com uso manual real** (empresa "Teste321"): seed rodou uma única vez (8 linhas, posições 0–7, sem duplicar); conversão de um lead de prospecção ("Marriagge") criou o `CrmLead` corretamente na etapa "Novo" com `origin: "prospecting"` e registrou a atividade "Lead convertido da prospecção"; arrastar o card entre colunas (Novo → Contato Iniciado → Respondeu) atualizou o `stageId` e registrou `LeadActivity` com a descrição correta a cada movimento, confirmado via query direta no Neon.

---

## Armadilhas desta fase

### Índice único `(companyId, position)` exige inserção em lote
Como `funnel_stages` tem `UNIQUE(company_id, position)`, o seed **precisa** inserir as 8 etapas de uma vez via `bulkCreate` (um único `INSERT ... VALUES (...), (...), ...`). Inserir uma a uma correria o risco de erros de índice caso a ordem de posição não seja controlada com cuidado — `bulkCreate` com o array já ordenado evita esse problema.

### `numeric` do Postgres chega como `string`
`node-postgres` não converte automaticamente `numeric` para `number` (evita perda de precisão silenciosa). Isso é resolvido inteiramente dentro de `DrizzleCrmLeadRepository` — o domínio nunca vê uma string onde espera um número.

### Manual → Triagem, Prospecção → Novo
As duas origens de `CrmLead` entram em etapas diferentes por design: leads manuais precisam de vetting (Triagem), leads de prospecção já foram qualificados por score na Fase 2 (Novo). Não uniformizar isso apagaria essa distinção de processo comercial.

### `MoveLead` é no-op quando solto na mesma coluna
`@dnd-kit` dispara `onDragEnd` mesmo quando o card é solto de volta na coluna de origem. Sem a checagem `lead.stageId === toStageId`, cada "arrasto indeciso" geraria uma `LeadActivity` falsa de movimentação.

### `PointerSensor` sem `activationConstraint` quebra o clique
Sem `activationConstraint: { distance: 5 }`, todo clique num card (inclusive o que abre o drawer de detalhes) é interpretado como início de drag, e o `onClick` do card nunca dispara.

### Seed lazy é uma escolha deliberada, não um atalho
A Fase 4 do SPEC menciona seed automático no primeiro login — isso pressupõe um hook de autenticação que ainda não existe. O seed lazy dentro do bootstrap do funil resolve o problema imediato (empresas sem etapas) sem acoplar a Fase 3 a uma peça de infraestrutura da Fase 4.

---

## Próximos passos — Fase 4

Conforme o SPEC: seletor de empresa multi-tenant, `SeedFunnelStages` disparado automaticamente no primeiro login (substituindo/complementando o seed lazy desta fase), `generateMetadata()` em todas as páginas, `error.tsx`/`not-found.tsx` globais, validação real de sessão no middleware, rate limiting nas Server Actions que chamam Cloudflare AI, e convite de membros por e-mail.

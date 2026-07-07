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

- [x] `src/domain/repositories/IFunnelStageRepository.ts` — `StageKind`, `FunnelStage`, `CreateFunnelStageData`; `findAllByCompany`, `findById`, `countByCompany`, `bulkCreate`, `update`.
- [x] `src/domain/repositories/ICrmLeadRepository.ts` — `CrmLeadOrigin`, `CrmLead` (`value: number | null` no domínio), `CreateCrmLeadData`; `findAllByCompany`, `findById`, `findByProspectingLeadId`, `findConvertedProspectingLeadIds`, `create`, `update` (não aceita `stageId`), `updateStage` (método dedicado, só para `MoveLead`).
- [x] `src/domain/repositories/ILeadActivityRepository.ts` — `LeadActivity`, `CreateLeadActivityData`; `findByLead`, `create`.

A separação `update()` / `updateStage()` em `ICrmLeadRepository` é intencional: impede, no nível de tipo, que `UpdateCrmLead` (edição de dados) altere `stageId` por engano — só `MoveLead` tem acesso a esse método.

---

## Task 4: Infrastructure — Repositórios Drizzle

- [x] `DrizzleFunnelStageRepository.ts`, `DrizzleCrmLeadRepository.ts`, `DrizzleLeadActivityRepository.ts` — mesmo padrão de `DrizzleNicheRepository.ts`: `constructor(private db: DB)`, toda query com `and(eq(id...), eq(companyId...))`.

`DrizzleCrmLeadRepository` é o único com uma peculiaridade: converte `value` de `string | null` (formato `numeric` do Postgres) para `number | null` (domínio) na leitura, e o inverso na escrita, via os helpers `toDomain` e `normalizeValue`.

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

- [x] `SeedFunnelStages.ts` — guarda de idempotência via `countByCompany`; array literal das 8 etapas padrão (nomes/cores/kind abaixo).
- [x] `CreateCrmLead.ts` — valida nome, cria o lead, registra `LeadActivity` com `fromStageId: null` e descrição `"Lead criado manualmente"`.
- [x] `MoveLead.ts` — no-op se `stageId` de destino é igual ao atual (evita atividade espúria ao soltar na mesma coluna); senão atualiza via `updateStage` e registra atividade com a descrição `"Lead movido de X para Y"`.
- [x] `UpdateCrmLead.ts` — edita dados (telefone, e-mail, nicho, subnicho, valor, notas, nome); nunca toca em `stageId`.
- [x] `ConvertProspectingLead.ts` — checa duplicidade via `findByProspectingLeadId` (idempotência), carrega o `ProspectingLead`, cria o `CrmLead` (`origin: "prospecting"`) na etapa alvo resolvida pela action, registra atividade `"Lead convertido da prospecção"`.

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

- [x] `funil/get-funil-bootstrap.ts` — roda o seed lazy (se `stages.length === 0`) e retorna `{ stages, leads }`.
- [x] `funil/create-crm-lead.ts`, `funil/move-lead.ts`, `funil/update-crm-lead.ts` — zod + `requireUser`/`requireCompany` + instanciar repos + chamar use case.
- [x] `funil/get-lead-activities.ts` — leitura sob demanda, chamada só quando o usuário abre a aba "Histórico" no drawer (evita payload grande no bootstrap inicial).
- [x] `leads/convert-prospecting-lead.ts` — resolve o nome do nicho (via `DrizzleNicheRepository`) e a etapa alvo ("Novo", ou a primeira `kind: "normal"` por posição) antes de chamar `ConvertProspectingLead`.
- [x] `leads/get-leads-bootstrap.ts` (modificado) — agora também retorna `convertedProspectingLeadIds: string[]`, usado pela UI de Leads para esconder/desabilitar o botão de conversão em leads já convertidos.

---

## Task 8: Página do Funil — `src/app/(protected)/funil/page.tsx`

Mesmo formato de Server Component thin das páginas da Fase 2 (`generateMetadata` + `BasePageLayout` + `Suspense` + Data Loader assíncrono chamando a bootstrap action).

---

## Task 9: `FunilContent` — Kanban, drawer, dnd-kit

`src/app/(protected)/funil/_components/FunilContent.tsx` concentra toda a interatividade em um único Client Component, seguindo o padrão de `LeadsContent`/`NichosContent`:

- **`KanbanColumn`** — droppable (`useDroppable`), mostra nome/cor/contagem/soma de valores da etapa, borda condicional por `kind` (`STAGE_KIND_BORDER_CLASSES`), destaque visual quando recebendo um drag (`isOver`).
- **`DraggableLeadCard`** / **`LeadCard`** — draggable (`useDraggable`), mostra nome, ícone de origem (`Target` para prospecção, `User` para manual), badge de nicho, telefone, valor formatado (`formatBRL`) e atalho de WhatsApp.
- **`LeadDrawer`** (inline, via `Sheet` + `Tabs`) — aba "Dados" (contato, valor, observações editáveis, botão "Avançar etapa", botão WhatsApp) e aba "Histórico" (carregada sob demanda via `getLeadActivitiesAction`, timeline com `date-fns` + `ptBR`).
- **`NewLeadButton`** (inline, via `Dialog`) — formulário de criação manual, sempre destinado à etapa "Triagem".
- **`Section`/`Row`** — helpers de layout para o drawer.
- **Topo**: busca client-side (nome/telefone), `DndContext` com `PointerSensor` (`activationConstraint: { distance: 5 }`), `DragOverlay` mostrando o card sendo arrastado.

O `onDragEnd` faz atualização otimista do estado local e chama `moveLeadAction`; se a action falhar, reverte o estado e mostra `toast.error`.

---

## Task 10: Integração — botão "Converter para CRM" em `LeadsContent`

No sheet de detalhe já existente na página de Leads (Fase 2), foi adicionado um botão "Converter para CRM" (ícone `Kanban`), desabilitado quando o lead já foi convertido (checagem via `convertedProspectingLeadIds`, vindo do bootstrap). Ao converter com sucesso, um toast com ação "Ver no funil" navega para `/funil`.

---

## Task 11: Sidebar — novo item de navegação

Em `src/components/layout/Sidebar.tsx`, adicionado `{ href: "/funil", label: "Funil", icon: Kanban, exact: false }` logo após "Leads" em `navItems` — reflete o fluxo conceitual prospecção → funil.

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

# Fase 2 — Módulo de Prospecção: Nichos, Campanhas, Leads e IA

> **Para agentes:** Use superpowers:subagent-driven-development ou superpowers:executing-plans para executar tarefa a tarefa. Steps usam checkbox (`- [ ]`) para rastreamento.
>
> **Regra:** NUNCA fazer `git commit` automaticamente. O desenvolvedor commita manualmente.

**Objetivo:** CRUD de nichos, campanhas de busca georreferenciada via Overpass API, visualização de leads com mapa Leaflet e sheet de detalhes com diagnóstico e mensagem gerados por Cloudflare AI.

**Arquitetura:** Clean Architecture pragmático. Schema → Domain (interfaces) → Infrastructure (Drizzle + services externos) → Use Cases (lógica de negócio) → Actions (controllers finos) → UI (Server e Client Components).

**Tech Stack adicionado:** `leaflet`, `react-leaflet`, `sonner`, `date-fns`, `react-hook-form`, `@hookform/resolvers`. shadcn/ui: `dialog`, `alert-dialog`, `sheet`, `table`, `select`, `slider`, `switch`, `checkbox`, `textarea`, `tabs`, `badge`, `avatar`.

## Constraints globais

- Toda action começa com `requireUser()` → `requireCompany(user.id)`
- Toda query filtra por `companyId` — sem exceção
- Retorno de actions: `{ ok: true, data? } | { ok: false, error: string }`
- Repositórios recebem `db` no construtor, nunca importam globalmente
- `domain/` não importa nada externo (sem Drizzle, sem Next.js)
- Leaflet/DnD: sempre `dynamic(() => import(...), { ssr: false })`
- NUNCA commitar — o desenvolvedor faz os commits manualmente
- Rota protegida usa `src/app/(protected)/` (não `(app)/` como no SPEC)
- Modelo Cloudflare AI vem de `process.env.CLOUDFLARE_AI_MODEL`

---

## Conceitos que você precisa entender antes de codar

### Server Component como Data Loader vs Client Component buscando via API

Toda página de listagem desta fase (nichos, campanhas, detalhe da campanha, leads) segue o mesmo formato:

```tsx
export async function generateMetadata(): Promise<Metadata> {
  return { title: "Leads" };
}

export default function LeadsPage() {
  return (
    <BasePageLayout>
      <Suspense fallback={<LoadingContent title="Carregando leads..." withHeader={false} rows={6} />}>
        <LeadsDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function LeadsDataLoader() {
  const { leads, campaigns } = await getLeadsBootstrapAction();
  return <LeadsContent initialLeads={leads} initialCampaigns={campaigns} />;
}
```

`page.tsx` é sempre um **Server Component enxuto**: `generateMetadata` + `BasePageLayout` (layout compartilhado) + `Suspense` com skeleton (`LoadingContent`) + uma função `async` interna (o "Data Loader") que chama uma **Server Action de bootstrap** (`get{Recurso}BootstrapAction`) e passa o resultado como prop para um **Client Component** colocado em `_components/` dentro da própria rota (ex: `nichos/_components/NichosContent.tsx`), que concentra toda a interatividade (formulários, dialogs, filtros, chamadas de mutação).

**Por que não simplesmente um Client Component com `useEffect(() => fetch("/api/nichos"))`?** Essa é a alternativa mais óbvia para quem vem de React puro (SPA), e tecnicamente funciona — mas custa três coisas neste projeto:

| | Server Component + bootstrap action | Client Component + rota GET |
|---|---|---|
| Onde roda a query no banco | No servidor, antes do HTML ser enviado | No servidor também, mas atrás de uma rota HTTP extra |
| Tela em branco / spinner inicial | Não precisa — `Suspense` mostra o skeleton só enquanto o Data Loader resolve, e o conteúdo real já chega pronto | Sempre existe um primeiro render vazio até o `useEffect` responder |
| Onde fica o guard de tenant (`requireUser`/`requireCompany`) | Uma vez, dentro da Server Action, reaproveitada tanto pelo Data Loader quanto por qualquer mutação | Duplicado: uma vez na rota GET, outra nas Server Actions de mutação |
| Superfície exposta | Nenhuma rota HTTP nova — Server Actions não são endpoints públicos versionados | Uma rota `route.ts` por recurso, mesmo sem nenhum consumidor externo |

A rota GET só faria sentido se algo **fora** do Next.js (um app mobile, um webhook, outro serviço) precisasse consumir os mesmos dados como API pública. Não é o caso aqui — é a própria página React consumindo, e nesse cenário o Server Component + Server Action elimina a camada HTTP redundante.

**Onde fica leitura vs escrita:** tanto o bootstrap de leitura (`get-{recurso}-bootstrap.ts`) quanto as mutações (`create-`, `update-`, `delete-`, `run-`) ficam centralizadas em `src/app/actions/{feature}/*.ts` — não existe um `actions.ts` colocado por rota. O bootstrap é uma Server Action normal, só que é chamada de dentro do Data Loader (Server Component) em vez de por um formulário ou botão.

**Polling sem rota REST:** o `handleRun`/`useEffect` de campanhas e do detalhe da campanha precisa reconsultar o status enquanto a busca roda em background (via `after()`). Em vez de `fetch()` numa rota GET, o Client Component chama a mesma Server Action de bootstrap diretamente — Server Actions podem ser invocadas do client livremente, sem precisar existir como endpoint HTTP.

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `src/infrastructure/db/schema.ts` | Modificar | Adicionar 3 enums + 3 tabelas de prospecção |
| `src/domain/repositories/INicheRepository.ts` | Criar | Interface pura de nichos |
| `src/domain/repositories/ICampaignRepository.ts` | Criar | Interface pura de campanhas |
| `src/domain/repositories/ILeadRepository.ts` | Criar | Interface pura de leads |
| `src/domain/services/IGeoService.ts` | Criar | Contrato de busca georreferenciada |
| `src/domain/services/IAIService.ts` | Criar | Contrato de IA |
| `src/infrastructure/repositories/DrizzleNicheRepository.ts` | Criar | Implementação Drizzle de INicheRepository |
| `src/infrastructure/repositories/DrizzleCampaignRepository.ts` | Criar | Implementação Drizzle de ICampaignRepository |
| `src/infrastructure/repositories/DrizzleLeadRepository.ts` | Criar | Implementação Drizzle de ILeadRepository |
| `src/infrastructure/services/OverpassGeoService.ts` | Criar | Busca via Overpass API (sem chave) |
| `src/infrastructure/services/CloudflareAIService.ts` | Criar | Cloudflare Workers AI |
| `src/lib/format.ts` | Criar | Labels, cores e formatadores de status |
| `src/use-cases/nichos/CreateNiche.ts` | Criar | Cria nicho com validação de companyId |
| `src/use-cases/nichos/UpdateNiche.ts` | Criar | Atualiza nicho garantindo pertencer à empresa |
| `src/use-cases/nichos/DeleteNiche.ts` | Criar | Deleta nicho (só se inativo) |
| `src/use-cases/campanhas/CreateCampaign.ts` | Criar | Cria campanha com status draft |
| `src/use-cases/campanhas/RunCampaign.ts` | Criar | Orquestra Overpass + score + persist leads |
| `src/use-cases/leads/UpdateLeadStatus.ts` | Criar | Muda status do lead com guard de tenant |
| `src/use-cases/leads/GenerateDiagnosis.ts` | Criar | Gera aiOverview + suggestedOffer via IA |
| `src/use-cases/leads/GenerateMessage.ts` | Criar | Gera mensagem WhatsApp via IA |
| `src/app/actions/nichos/create-niche.ts` | Criar | Server Action: criar nicho |
| `src/app/actions/nichos/update-niche.ts` | Criar | Server Action: atualizar nicho |
| `src/app/actions/nichos/delete-niche.ts` | Criar | Server Action: deletar nicho |
| `src/app/actions/campanhas/create-campaign.ts` | Criar | Server Action: criar campanha |
| `src/app/actions/campanhas/run-campaign.ts` | Criar | Server Action: executar campanha |
| `src/app/actions/leads/update-lead-status.ts` | Criar | Server Action: atualizar status do lead |
| `src/app/actions/leads/generate-diagnosis.ts` | Criar | Server Action: diagnóstico IA |
| `src/app/actions/leads/generate-message.ts` | Criar | Server Action: mensagem IA |
| `src/app/actions/nichos/get-nichos-bootstrap.ts` | Criar | Server Action: bootstrap de leitura para o Data Loader de nichos |
| `src/app/actions/campanhas/get-campanhas-bootstrap.ts` | Criar | Server Action: bootstrap de leitura (e polling) para campanhas |
| `src/app/actions/campanhas/get-campanha-detail-bootstrap.ts` | Criar | Server Action: bootstrap de leitura (e polling) para detalhe da campanha |
| `src/app/actions/leads/get-leads-bootstrap.ts` | Criar | Server Action: bootstrap de leitura para o Data Loader de leads |
| `src/components/TagInput.tsx` | Criar | Input de tags reutilizável |
| `src/components/LeadsMap.tsx` | Criar | Mapa Leaflet de leads (client-only) |
| `src/components/CampaignMap.tsx` | Criar | Mapa Leaflet de campanha (client-only) |
| `src/components/BasePageLayout/BasePageLayout.tsx` | Criar | Wrapper de página: título/descrição opcionais + padding consistente |
| `src/components/shared/loading-content.tsx` | Criar | Skeleton exibido pelo `Suspense` enquanto o Data Loader busca dados |
| `src/components/ui/skeleton.tsx` | Criar (shadcn) | Primitivo de skeleton usado pelo `LoadingContent` |
| `src/app/(protected)/layout.tsx` | Modificar | Adicionar links de nichos, campanhas, leads na sidebar |
| `src/app/(protected)/prospeccao/page.tsx` | Modificar | Dashboard com métricas reais |
| `src/app/(protected)/prospeccao/nichos/page.tsx` | Criar | Server Component thin: `generateMetadata` + `BasePageLayout` + `Suspense` + Data Loader |
| `src/app/(protected)/prospeccao/nichos/_components/NichosContent.tsx` | Criar | Client Component: CRUD de nichos (dialogs, TagInput, IA) |
| `src/app/(protected)/prospeccao/campanhas/page.tsx` | Criar | Server Component thin: idem, para campanhas |
| `src/app/(protected)/prospeccao/campanhas/_components/CampanhasContent.tsx` | Criar | Client Component: lista, criação e execução de campanhas + polling |
| `src/app/(protected)/prospeccao/campanhas/[id]/page.tsx` | Criar | Server Component thin: idem, para detalhe da campanha |
| `src/app/(protected)/prospeccao/campanhas/[id]/_components/CampanhaDetailContent.tsx` | Criar | Client Component: métricas, mapa e execução da campanha + polling |
| `src/app/(protected)/prospeccao/leads/page.tsx` | Criar | Server Component thin: idem, para leads |
| `src/app/(protected)/prospeccao/leads/_components/LeadsContent.tsx` | Criar | Client Component: filtros, mapa, sheet de detalhe e IA |

---

## Task 1: Dependências e componentes shadcn

- [ ] **Step 1: Instalar pacotes npm**

```bash
npm install leaflet react-leaflet date-fns sonner react-hook-form @hookform/resolvers
npm install -D @types/leaflet
```

- [ ] **Step 2: Adicionar componentes shadcn**

```bash
npx shadcn@latest add dialog alert-dialog sheet table select slider switch checkbox textarea tabs badge avatar
```

Responder "Yes" para qualquer prompt de sobrescrita.

- [ ] **Step 3: Confirmar que o `<Toaster />` já está no root layout**

`src/app/layout.tsx` já vem com o `Toaster` do sonner wireado desde a Fase 1 (Passo 16) — nada a fazer aqui além de confirmar que está lá antes de usar `toast()` nas próximas telas:

```tsx
import { Toaster } from "sonner";

// dentro do <body>:
<body className="min-h-full">
  {children}
  <Toaster position="top-right" richColors />
</body>
```

---

## Task 2: Schema — 3 tabelas + 3 enums

**Arquivo:** `src/infrastructure/db/schema.ts`

- [ ] **Step 1: Adicionar novos imports ao topo do schema**

```typescript
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  sql,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
```

- [ ] **Step 2: Adicionar tabelas de prospecção no final do schema**

Colar após `companyMembersTable`:

```typescript
// ── Prospecção — Fase 2 ─────────────────────────────────────────────────────

export const prospectingNichesTable = pgTable(
  "prospecting_niches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    keywords: text("keywords").array().notNull().default(sql`'{}'`),
    targetServices: text("target_services").array().notNull().default(sql`'{}'`),
    commonPains: text("common_pains").array().notNull().default(sql`'{}'`),
    baseMessageTemplate: text("base_message_template").notNull().default(""),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    companyIdIdx: index("prospecting_niches_company_id_idx").on(t.companyId),
  })
);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "running",
  "completed",
  "failed",
]);

export const prospectingCampaignsTable = pgTable(
  "prospecting_campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    nicheId: uuid("niche_id")
      .notNull()
      .references(() => prospectingNichesTable.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    cep: varchar("cep", { length: 8 }),           // nullable — salvo via ViaCEP no form
    city: text("city").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    country: text("country").notNull().default("Brazil"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    radiusKm: integer("radius_km").notNull().default(5),
    maxResults: integer("max_results").notNull().default(50),
    additionalKeywords: text("additional_keywords")
      .array()
      .notNull()
      .default(sql`'{}'`),
    status: campaignStatusEnum("status").notNull().default("draft"),
    totalFound: integer("total_found").notNull().default(0),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    companyIdIdx: index("campaigns_company_id_idx").on(t.companyId),
    nicheIdIdx: index("campaigns_niche_id_idx").on(t.nicheId),
  })
);

export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "qualified",
  "not_qualified",
  "whatsapp_opened",
  "message_sent",
  "responded",
  "lost",
  "do_not_contact",
]);

export const whatsappStatusEnum = pgEnum("whatsapp_status", [
  "unknown",
  "probable",
  "confirmed",
  "invalid",
]);

export const prospectingLeadsTable = pgTable(
  "prospecting_leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => prospectingCampaignsTable.id, { onDelete: "cascade" }),
    nicheId: uuid("niche_id")
      .notNull()
      .references(() => prospectingNichesTable.id, { onDelete: "restrict" }),
    source: text("source").notNull().default("overpass"),
    name: text("name").notNull(),
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    email: text("email"),
    websiteUrl: text("website_url"),
    address: text("address").notNull(),
    city: text("city").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    score: integer("score").notNull().default(0),
    status: leadStatusEnum("status").notNull().default("new"),
    whatsappStatus: whatsappStatusEnum("whatsapp_status").notNull().default("unknown"),
    hasWebsite: boolean("has_website").notNull().default(false),
    hasInstagram: boolean("has_instagram").notNull().default(false),
    hasWhatsapp: boolean("has_whatsapp").notNull().default(false),
    rating: real("rating"),
    reviewCount: integer("review_count"),
    aiOverview: text("ai_overview"),
    suggestedOffer: text("suggested_offer"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    companyIdIdx: index("leads_company_id_idx").on(t.companyId),
    campaignIdIdx: index("leads_campaign_id_idx").on(t.campaignId),
    statusIdx: index("leads_status_idx").on(t.status),
    scoreIdx: index("leads_score_idx").on(t.score),
  })
);
```

- [ ] **Step 3: Push schema para o Neon**

```bash
npx drizzle-kit push
```

Resultado esperado: criação de 3 tabelas + 3 enums no banco sem erros.

---

## Task 3: Domain — interfaces puras

Nenhum arquivo de domain importa libs externas.

- [ ] **Step 1: Criar `src/domain/repositories/INicheRepository.ts`**

```typescript
export interface Niche {
  id: string;
  companyId: string;
  name: string;
  description: string;
  keywords: string[];
  targetServices: string[];
  commonPains: string[];
  baseMessageTemplate: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date | null;
}

export type CreateNicheData = Omit<Niche, "id" | "createdAt" | "updatedAt">;

export interface INicheRepository {
  findAllByCompany(companyId: string): Promise<Niche[]>;
  findById(id: string, companyId: string): Promise<Niche | null>;
  create(data: CreateNicheData): Promise<Niche>;
  update(id: string, companyId: string, data: Partial<CreateNicheData>): Promise<Niche>;
  delete(id: string, companyId: string): Promise<void>;
}
```

- [ ] **Step 2: Criar `src/domain/repositories/ICampaignRepository.ts`**

```typescript
export type CampaignStatus = "draft" | "running" | "completed" | "failed";

export interface Campaign {
  id: string;
  companyId: string;
  nicheId: string;
  name: string;
  cep: string | null;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  maxResults: number;
  additionalKeywords: string[];
  status: CampaignStatus;
  totalFound: number;
  lastRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export type CreateCampaignData = Omit<Campaign, "id" | "status" | "totalFound" | "lastRunAt" | "createdAt" | "updatedAt">;

export interface ICampaignRepository {
  findAllByCompany(companyId: string): Promise<Campaign[]>;
  findById(id: string, companyId: string): Promise<Campaign | null>;
  create(data: CreateCampaignData): Promise<Campaign>;
  updateStatus(
    id: string,
    companyId: string,
    status: CampaignStatus,
    totalFound?: number
  ): Promise<void>;
}
```

- [ ] **Step 3: Criar `src/domain/repositories/ILeadRepository.ts`**

```typescript
export type LeadStatus =
  | "new"
  | "qualified"
  | "not_qualified"
  | "whatsapp_opened"
  | "message_sent"
  | "responded"
  | "lost"
  | "do_not_contact";

export type WhatsappStatus = "unknown" | "probable" | "confirmed" | "invalid";

export interface Lead {
  id: string;
  companyId: string;
  campaignId: string;
  nicheId: string;
  source: string;
  name: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  websiteUrl: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  score: number;
  status: LeadStatus;
  whatsappStatus: WhatsappStatus;
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasWhatsapp: boolean;
  rating: number | null;
  reviewCount: number | null;
  aiOverview: string | null;
  suggestedOffer: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

export type CreateLeadData = Omit<Lead, "id" | "createdAt" | "updatedAt">;

export interface LeadFilters {
  campaignId?: string;
  status?: LeadStatus;
  minScore?: number;
  onlyWhatsapp?: boolean;
}

export interface ILeadRepository {
  findByCampaign(campaignId: string, companyId: string): Promise<Lead[]>;
  findAllByCompany(companyId: string, filters?: LeadFilters): Promise<Lead[]>;
  findById(id: string, companyId: string): Promise<Lead | null>;
  bulkCreate(leads: CreateLeadData[]): Promise<Lead[]>;
  update(id: string, companyId: string, data: Partial<Lead>): Promise<Lead>;
  countByCompany(companyId: string): Promise<{ total: number; qualified: number }>;
}
```

- [ ] **Step 4: Criar `src/domain/services/IGeoService.ts`**

```typescript
export interface OsmTags {
  amenity?: string[];
  shop?: string[];
  craft?: string[];
  tourism?: string[];
  office?: string[];
  leisure?: string[];
}

export interface GeoSearchParams {
  latitude: number;
  longitude: number;
  radiusKm: number;
  keywords: string[];   // keywords do nicho — fallback de busca por nome
  osmTags?: OsmTags;    // tags OSM geradas pela IA — query primária
  maxResults: number;
}

export interface GeoResult {
  name: string;
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  state: string;
  phone?: string;
  website?: string;
  tags: Record<string, string>;
}

export interface IGeoService {
  search(params: GeoSearchParams): Promise<GeoResult[]>;
}
```

- [ ] **Step 5: Criar `src/domain/services/IAIService.ts`**

```typescript
export interface IAIService {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}
```

---

## Task 4: Infrastructure — Repositórios Drizzle

- [ ] **Step 1: Criar `src/infrastructure/repositories/DrizzleNicheRepository.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type { CreateNicheData, INicheRepository, Niche } from "@/domain/repositories/INicheRepository";
import { prospectingNichesTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleNicheRepository implements INicheRepository {
  constructor(private db: DB) {}

  async findAllByCompany(companyId: string): Promise<Niche[]> {
    return this.db
      .select()
      .from(prospectingNichesTable)
      .where(eq(prospectingNichesTable.companyId, companyId))
      .orderBy(prospectingNichesTable.createdAt);
  }

  async findById(id: string, companyId: string): Promise<Niche | null> {
    const [row] = await this.db
      .select()
      .from(prospectingNichesTable)
      .where(
        and(
          eq(prospectingNichesTable.id, id),
          eq(prospectingNichesTable.companyId, companyId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async create(data: CreateNicheData): Promise<Niche> {
    const [row] = await this.db
      .insert(prospectingNichesTable)
      .values(data)
      .returning();
    return row;
  }

  async update(id: string, companyId: string, data: Partial<CreateNicheData>): Promise<Niche> {
    const [row] = await this.db
      .update(prospectingNichesTable)
      .set(data)
      .where(
        and(
          eq(prospectingNichesTable.id, id),
          eq(prospectingNichesTable.companyId, companyId)
        )
      )
      .returning();
    return row;
  }

  async delete(id: string, companyId: string): Promise<void> {
    await this.db
      .delete(prospectingNichesTable)
      .where(
        and(
          eq(prospectingNichesTable.id, id),
          eq(prospectingNichesTable.companyId, companyId)
        )
      );
  }
}
```

- [ ] **Step 2: Criar `src/infrastructure/repositories/DrizzleCampaignRepository.ts`**

```typescript
import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  Campaign,
  CampaignStatus,
  CreateCampaignData,
  ICampaignRepository,
} from "@/domain/repositories/ICampaignRepository";
import { prospectingCampaignsTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleCampaignRepository implements ICampaignRepository {
  constructor(private db: DB) {}

  async findAllByCompany(companyId: string): Promise<Campaign[]> {
    return this.db
      .select()
      .from(prospectingCampaignsTable)
      .where(eq(prospectingCampaignsTable.companyId, companyId))
      .orderBy(prospectingCampaignsTable.createdAt);
  }

  async findById(id: string, companyId: string): Promise<Campaign | null> {
    const [row] = await this.db
      .select()
      .from(prospectingCampaignsTable)
      .where(
        and(
          eq(prospectingCampaignsTable.id, id),
          eq(prospectingCampaignsTable.companyId, companyId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async create(data: CreateCampaignData): Promise<Campaign> {
    const [row] = await this.db
      .insert(prospectingCampaignsTable)
      .values(data)
      .returning();
    return row;
  }

  async updateStatus(
    id: string,
    companyId: string,
    status: CampaignStatus,
    totalFound?: number
  ): Promise<void> {
    await this.db
      .update(prospectingCampaignsTable)
      .set({
        status,
        ...(totalFound !== undefined ? { totalFound, lastRunAt: new Date() } : {}),
      })
      .where(
        and(
          eq(prospectingCampaignsTable.id, id),
          eq(prospectingCampaignsTable.companyId, companyId)
        )
      );
  }
}
```

- [ ] **Step 3: Criar `src/infrastructure/repositories/DrizzleLeadRepository.ts`**

```typescript
import { and, eq, gte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import type {
  CreateLeadData,
  ILeadRepository,
  Lead,
  LeadFilters,
} from "@/domain/repositories/ILeadRepository";
import { prospectingLeadsTable } from "@/infrastructure/db/schema";
import type * as schema from "@/infrastructure/db/schema";

type DB = NodePgDatabase<typeof schema>;

export class DrizzleLeadRepository implements ILeadRepository {
  constructor(private db: DB) {}

  async findByCampaign(campaignId: string, companyId: string): Promise<Lead[]> {
    return this.db
      .select()
      .from(prospectingLeadsTable)
      .where(
        and(
          eq(prospectingLeadsTable.campaignId, campaignId),
          eq(prospectingLeadsTable.companyId, companyId)
        )
      )
      .orderBy(prospectingLeadsTable.score);
  }

  async findAllByCompany(companyId: string, filters?: LeadFilters): Promise<Lead[]> {
    const conditions = [eq(prospectingLeadsTable.companyId, companyId)];
    if (filters?.campaignId) conditions.push(eq(prospectingLeadsTable.campaignId, filters.campaignId));
    if (filters?.status) conditions.push(eq(prospectingLeadsTable.status, filters.status));
    if (filters?.minScore) conditions.push(gte(prospectingLeadsTable.score, filters.minScore));
    if (filters?.onlyWhatsapp) conditions.push(eq(prospectingLeadsTable.hasWhatsapp, true));

    return this.db
      .select()
      .from(prospectingLeadsTable)
      .where(and(...conditions))
      .orderBy(prospectingLeadsTable.score);
  }

  async findById(id: string, companyId: string): Promise<Lead | null> {
    const [row] = await this.db
      .select()
      .from(prospectingLeadsTable)
      .where(
        and(
          eq(prospectingLeadsTable.id, id),
          eq(prospectingLeadsTable.companyId, companyId)
        )
      )
      .limit(1);
    return row ?? null;
  }

  async bulkCreate(leads: CreateLeadData[]): Promise<Lead[]> {
    if (leads.length === 0) return [];
    return this.db.insert(prospectingLeadsTable).values(leads).returning();
  }

  async update(id: string, companyId: string, data: Partial<Lead>): Promise<Lead> {
    const [row] = await this.db
      .update(prospectingLeadsTable)
      .set(data)
      .where(
        and(
          eq(prospectingLeadsTable.id, id),
          eq(prospectingLeadsTable.companyId, companyId)
        )
      )
      .returning();
    return row;
  }

  async countByCompany(companyId: string): Promise<{ total: number; qualified: number }> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        qualified: sql<number>`count(*) filter (where score >= 70)::int`,
      })
      .from(prospectingLeadsTable)
      .where(eq(prospectingLeadsTable.companyId, companyId));
    return row ?? { total: 0, qualified: 0 };
  }
}
```

---

## Task 5: Infrastructure — Serviços externos

- [ ] **Step 1: Criar `src/infrastructure/services/OverpassGeoService.ts`**

> **Arquitetura adotada:** a geração de tags OSM é feita pela IA (RunCampaign use case) antes de chamar o GeoService. O OverpassGeoService recebe as tags prontas e as usa como query primária. Fallback por nome só ativa quando a IA não gerou tags. Isso elimina o dicionário estático `KEYWORD_TO_AMENITY` e torna a busca dinâmica para qualquer nicho.

```typescript
import type { GeoResult, GeoSearchParams, IGeoService, OsmTags } from "@/domain/services/IGeoService";

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
}

export class OverpassGeoService implements IGeoService {
  async search(params: GeoSearchParams): Promise<GeoResult[]> {
    const { latitude: lat, longitude: lon, radiusKm, keywords, osmTags } = params;
    const radiusMeters = radiusKm * 1000;
    const around = `around:${radiusMeters},${lat},${lon}`;

    const lines = ["[out:json][timeout:30][maxsize:2000000];", "("];

    const hasOsmTags = osmTags &&
      Object.values(osmTags).some((v) => Array.isArray(v) && v.length > 0);

    if (hasOsmTags) {
      // Query primária: tags OSM geradas pela IA (node + way — relation é raro e muito lento)
      const tagKeys: (keyof OsmTags)[] = ["amenity", "shop", "craft", "tourism", "office", "leisure"];
      for (const key of tagKeys) {
        const values = osmTags![key];
        if (!values || values.length === 0) continue;
        const regex = values.join("|");
        lines.push(`  node["${key}"~"${regex}"](${around});`);
        lines.push(`  way["${key}"~"${regex}"](${around});`);
      }
    } else if (keywords.length > 0) {
      // Fallback por nome: só ativo quando a IA não gerou tags
      // (evita scan de todos os nomes da área quando desnecessário)
      const nameRegex = keywords.join("|");
      lines.push(`  node["name"~"${nameRegex}",i](${around});`);
      lines.push(`  way["name"~"${nameRegex}",i](${around});`);
    }

    // `out tags center qt 200`:
    //   tags  = apenas tags + coords (sem coordenadas dos nós-membro de ways) — muito mais leve
    //   center = calcula centro geométrico para ways
    //   qt    = sem ordenação de resultado (mais rápido)
    //   200   = limite Overpass; slice(0, maxResults) aplicado depois do filtro por nome
    lines.push(");", "out tags center qt 200;");
    const query = lines.join("\n");

    console.log("[OverpassGeoService] query:", query);

    const ENDPOINTS = [
      "https://overpass-api.de/api/interpreter",
      "https://overpass.kumi.systems/api/interpreter",
    ];

    const messages: Record<number, string> = {
      400: "A query de busca está inválida. Verifique as keywords do nicho.",
      429: "Muitas buscas em pouco tempo. Aguarde alguns segundos e tente novamente.",
      502: "Servidor de busca indisponível. Tentando novamente...",
      503: "Servidor de busca sobrecarregado. Tentando novamente...",
      504: "A busca demorou muito. Tentando servidor alternativo...",
    };

    let lastError = "";
    for (const endpoint of ENDPOINTS) {
      let res: Response;
      try {
        console.log(`[OverpassGeoService] trying ${endpoint}`);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 35_000);
        res = await fetch(endpoint, {
          method: "POST",
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json, text/plain, */*",
            "User-Agent": "ProspFlow/1.0 (prospflow@aivonlabs.com)",
          },
          signal: controller.signal,
        });
        clearTimeout(timer);
      } catch (e) {
        console.error(`[OverpassGeoService] network error on ${endpoint}`, e);
        lastError = "Não foi possível conectar ao servidor de busca.";
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(`[OverpassGeoService] HTTP ${res.status} on ${endpoint}`, { body });
        lastError = messages[res.status] ?? `Erro ${res.status} no servidor de busca.`;
        if (res.status === 429) break;
        continue;
      }

      let data: OverpassResponse;
      try {
        data = await res.json();
      } catch (e) {
        console.error(`[OverpassGeoService] invalid JSON from ${endpoint}`, e);
        lastError = "O servidor de busca retornou uma resposta inválida.";
        continue;
      }

      const withName = data.elements.filter((el) => el.tags?.name);
      console.log(
        `[OverpassGeoService] total=${data.elements.length} withName=${withName.length}`,
        withName.slice(0, 3).map((el) => ({ name: el.tags?.name, amenity: el.tags?.amenity, shop: el.tags?.shop }))
      );

      // Limite aplicado depois do filtro por nome — nunca antes
      return withName.slice(0, params.maxResults).map((el) => {
        const elLat = el.lat ?? el.center?.lat ?? 0;
        const elLon = el.lon ?? el.center?.lon ?? 0;
        const tags = el.tags ?? {};
        return {
          name: tags.name ?? "",
          latitude: elLat,
          longitude: elLon,
          address: [tags["addr:street"], tags["addr:housenumber"]]
            .filter(Boolean)
            .join(", "),
          city: tags["addr:city"] ?? "",
          state: tags["addr:state"] ?? "",
          phone: tags.phone ?? tags["contact:phone"],
          website: tags.website ?? tags["contact:website"],
          tags,
        };
      });
    }

    throw new Error(lastError || "Todos os servidores de busca falharam. Tente novamente em alguns minutos.");
  }
}
```

- [ ] **Step 2: Criar `src/infrastructure/services/CloudflareAIService.ts`**

```typescript
import type { IAIService } from "@/domain/services/IAIService";

interface CloudflareResponse {
  result?: { response?: string };
  success: boolean;
  errors?: { message: string }[];
}

export class CloudflareAIService implements IAIService {
  private readonly endpoint: string;
  private readonly token: string;

  constructor() {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const model = process.env.CLOUDFLARE_AI_MODEL ?? "@cf/meta/llama-3.1-70b-instruct";
    const token = process.env.CLOUDFLARE_AI_TOKEN;

    if (!accountId || !token) throw new Error("CLOUDFLARE_ACCOUNT_ID e CLOUDFLARE_AI_TOKEN são obrigatórios");

    this.endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
    this.token = token;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`Cloudflare AI error: ${res.status}`);

    const data: CloudflareResponse = await res.json();

    if (!data.success) {
      throw new Error(data.errors?.[0]?.message ?? "Cloudflare AI retornou erro");
    }

    return data.result?.response ?? "";
  }
}
```

---

## Task 6: Utilitários — `src/lib/format.ts`

- [ ] **Step 1: Criar `src/lib/format.ts`**

```typescript
import type { CampaignStatus } from "@/domain/repositories/ICampaignRepository";
import type { LeadStatus } from "@/domain/repositories/ILeadRepository";

// ── Lead status ─────────────────────────────────────────────────────────────

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Novo",
  qualified: "Qualificado",
  not_qualified: "Não qualificado",
  whatsapp_opened: "WhatsApp aberto",
  message_sent: "Mensagem enviada",
  responded: "Respondeu",
  lost: "Perdido",
  do_not_contact: "Não contatar",
};

export const LEAD_STATUS_CLASSES: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700",
  qualified: "bg-emerald-100 text-emerald-700",
  not_qualified: "bg-red-100 text-red-700",
  whatsapp_opened: "bg-blue-100 text-blue-700",
  message_sent: "bg-violet-100 text-violet-700",
  responded: "bg-amber-100 text-amber-700",
  lost: "bg-slate-100 text-slate-500",
  do_not_contact: "bg-red-50 text-red-400",
};

// ── Campaign status ──────────────────────────────────────────────────────────

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Rascunho",
  running: "Executando",
  completed: "Concluída",
  failed: "Falha",
};

export const CAMPAIGN_STATUS_CLASSES: Record<CampaignStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
};

// ── Score ────────────────────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-600";
  if (score >= 40) return "text-amber-600";
  return "text-slate-500";
}

export function scoreBg(score: number): string {
  if (score >= 70) return "bg-emerald-50 text-emerald-700";
  if (score >= 40) return "bg-amber-50 text-amber-700";
  return "bg-slate-50 text-slate-600";
}
```

---

## Task 7: Use Cases — Nichos

- [ ] **Step 1: Criar `src/use-cases/nichos/CreateNiche.ts`**

```typescript
import type { CreateNicheData, INicheRepository, Niche } from "@/domain/repositories/INicheRepository";

type Input = Omit<CreateNicheData, "companyId"> & { companyId: string };
type Result = { ok: true; data: Niche } | { ok: false; error: string };

export class CreateNiche {
  constructor(private nicheRepo: INicheRepository) {}

  async execute(input: Input): Promise<Result> {
    try {
      if (!input.name.trim()) return { ok: false, error: "Nome do nicho é obrigatório" };
      const niche = await this.nicheRepo.create(input);
      return { ok: true, data: niche };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar nicho" };
    }
  }
}
```

- [ ] **Step 2: Criar `src/use-cases/nichos/UpdateNiche.ts`**

```typescript
import type { CreateNicheData, INicheRepository, Niche } from "@/domain/repositories/INicheRepository";

type Input = { id: string; companyId: string; data: Partial<CreateNicheData> };
type Result = { ok: true; data: Niche } | { ok: false; error: string };

export class UpdateNiche {
  constructor(private nicheRepo: INicheRepository) {}

  async execute({ id, companyId, data }: Input): Promise<Result> {
    try {
      const existing = await this.nicheRepo.findById(id, companyId);
      if (!existing) return { ok: false, error: "Nicho não encontrado" };
      const niche = await this.nicheRepo.update(id, companyId, data);
      return { ok: true, data: niche };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao atualizar nicho" };
    }
  }
}
```

- [ ] **Step 3: Criar `src/use-cases/nichos/DeleteNiche.ts`**

```typescript
import type { INicheRepository } from "@/domain/repositories/INicheRepository";

type Input = { id: string; companyId: string };
type Result = { ok: true } | { ok: false; error: string };

export class DeleteNiche {
  constructor(private nicheRepo: INicheRepository) {}

  async execute({ id, companyId }: Input): Promise<Result> {
    try {
      const existing = await this.nicheRepo.findById(id, companyId);
      if (!existing) return { ok: false, error: "Nicho não encontrado" };
      if (existing.isActive) return { ok: false, error: "Desative o nicho antes de excluir" };
      await this.nicheRepo.delete(id, companyId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao excluir nicho" };
    }
  }
}
```

---

## Task 8: Use Cases — Campanhas

- [ ] **Step 1: Criar `src/use-cases/campanhas/CreateCampaign.ts`**

```typescript
import type { Campaign, CreateCampaignData, ICampaignRepository } from "@/domain/repositories/ICampaignRepository";

type Input = CreateCampaignData;
type Result = { ok: true; data: Campaign } | { ok: false; error: string };

export class CreateCampaign {
  constructor(private campaignRepo: ICampaignRepository) {}

  async execute(input: Input): Promise<Result> {
    try {
      if (!input.name.trim()) return { ok: false, error: "Nome da campanha é obrigatório" };
      if (!input.nicheId) return { ok: false, error: "Nicho é obrigatório" };
      const campaign = await this.campaignRepo.create(input);
      return { ok: true, data: campaign };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao criar campanha" };
    }
  }
}
```

- [ ] **Step 2: Criar `src/use-cases/campanhas/RunCampaign.ts`**

> **Decisão de design:** `RunCampaign` recebe `IAIService` como 5ª dependência. A IA gera as tags OSM antes de chamar o `IGeoService` — isso centraliza a lógica de "traduzir nicho → query Overpass" no use case, não no serviço de geo. O `IGeoService` continua agnóstico ao domínio de negócio.

```typescript
import type { ICampaignRepository } from "@/domain/repositories/ICampaignRepository";
import type { ILeadRepository } from "@/domain/repositories/ILeadRepository";
import type { INicheRepository } from "@/domain/repositories/INicheRepository";
import type { IAIService } from "@/domain/services/IAIService";
import type { IGeoService, OsmTags } from "@/domain/services/IGeoService";

// O prompt instrui a IA a retornar APENAS JSON com as 6 chaves — sem texto extra.
// Os exemplos cobrem os casos mais comuns do Brasil (restaurante, mecânica, academia, advocacia, salão).
const OSM_TAG_SYSTEM_PROMPT = `You are an OpenStreetMap (OSM) expert. Given a business niche name and description in Portuguese, return ONLY a valid JSON object with OSM tag values that best represent that type of business. Keys must be exactly: "amenity", "shop", "craft", "tourism", "office", "leisure". Values are arrays of OSM tag values in English. Return ONLY the JSON object, no explanation, no markdown.

Example input: "Niche: Restaurantes e Lanchonetes"
Example output: {"amenity":["restaurant","fast_food","cafe","bar"],"shop":[],"craft":[],"tourism":[],"office":[],"leisure":[]}

Example input: "Niche: Mecânicas e Auto Centers"
Example output: {"amenity":[],"shop":["car_repair","car_parts","tyres"],"craft":["car_repair","panel_beater"],"tourism":[],"office":[],"leisure":[]}

Example input: "Niche: Academias e Crossfit"
Example output: {"amenity":[],"shop":[],"craft":[],"tourism":[],"office":[],"leisure":["fitness_centre","sports_centre","gym"]}

Example input: "Niche: Escritórios de Advocacia"
Example output: {"amenity":[],"shop":[],"craft":[],"tourism":[],"office":["lawyer","legal"],"leisure":[]}

Example input: "Niche: Salões de Beleza e Barbearias"
Example output: {"amenity":["hairdresser","beauty"],"shop":["hairdresser","beauty"],"craft":["hairdresser"],"tourism":[],"office":[],"leisure":[]}`;

type Input = { campaignId: string; companyId: string };
type Result = { ok: true; totalFound: number } | { ok: false; error: string };

function calculateScore(tags: Record<string, string>, phone?: string, website?: string): number {
  let score = 20; // base
  if (website) score += 20;
  if (phone) score += 15;

  const rating = parseFloat(tags["rating"] ?? "0");
  if (rating >= 4.0) score += 20;
  else if (rating >= 3.0) score += 10;

  const reviews = parseInt(tags["review_count"] ?? "0", 10);
  if (reviews >= 50) score += 15;
  else if (reviews >= 10) score += 5;

  if (tags["contact:instagram"] || tags["instagram"]) score += 10;

  return Math.min(100, score);
}

function normalizePhone(phone: string | undefined): string | undefined {
  if (!phone) return undefined;
  return phone.replace(/\D/g, "");
}

export class RunCampaign {
  constructor(
    private campaignRepo: ICampaignRepository,
    private nicheRepo: INicheRepository,
    private leadRepo: ILeadRepository,
    private geoService: IGeoService,
    private aiService: IAIService
  ) {}

  async execute({ campaignId, companyId }: Input): Promise<Result> {
    const campaign = await this.campaignRepo.findById(campaignId, companyId);
    if (!campaign) return { ok: false, error: "Campanha não encontrada" };

    const niche = await this.nicheRepo.findById(campaign.nicheId, companyId);
    if (!niche) return { ok: false, error: "Nicho não encontrado" };

    await this.campaignRepo.updateStatus(campaignId, companyId, "running");

    try {
      // Passo 1: IA gera as tags OSM a partir do nome/descrição do nicho.
      // Se a IA falhar (timeout, parsing inválido), cai no fallback por nome.
      let osmTags: OsmTags | undefined;
      try {
        const nicheContext = niche.description
          ? `Niche: ${niche.name}\nDescription: ${niche.description}`
          : `Niche: ${niche.name}`;
        const raw = await this.aiService.complete(OSM_TAG_SYSTEM_PROMPT, nicheContext);
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as OsmTags;
          const hasAnyTag = Object.values(parsed).some((v) => Array.isArray(v) && v.length > 0);
          if (hasAnyTag) osmTags = parsed;
        }
      } catch (e) {
        console.warn("[RunCampaign] AI tag generation failed, falling back to name-only search", e);
      }

      // Passo 2: Overpass usa as tags OSM como query primária.
      // keywords do nicho são passadas como fallback — só ativadas se osmTags for undefined.
      const nameKeywords = [...niche.keywords, ...campaign.additionalKeywords];
      const results = await this.geoService.search({
        latitude: campaign.latitude,
        longitude: campaign.longitude,
        radiusKm: campaign.radiusKm,
        keywords: nameKeywords,
        osmTags,
        maxResults: campaign.maxResults,
      });

      const leads = results.map((r) => {
        const score = calculateScore(r.tags, r.phone, r.website);
        const hasWebsite = !!r.website;
        const hasInstagram = !!(r.tags["contact:instagram"] || r.tags["instagram"]);
        const hasWhatsapp = !!(r.tags["contact:whatsapp"] || r.tags["phone:whatsapp"]);

        return {
          companyId,
          campaignId,
          nicheId: niche.id,
          source: "overpass" as const,
          name: r.name,
          phone: r.phone ?? null,
          phoneNormalized: normalizePhone(r.phone) ?? null,
          email: null,
          websiteUrl: r.website ?? null,
          address: r.address,
          city: r.city || campaign.city,
          state: r.state || campaign.state,
          latitude: r.latitude,
          longitude: r.longitude,
          score,
          status: "new" as const,
          whatsappStatus: (hasWhatsapp ? "probable" : "unknown") as "probable" | "unknown",
          hasWebsite,
          hasInstagram,
          hasWhatsapp,
          rating: r.tags["rating"] ? parseFloat(r.tags["rating"]) : null,
          reviewCount: r.tags["review_count"] ? parseInt(r.tags["review_count"], 10) : null,
          aiOverview: null,
          suggestedOffer: null,
        };
      });

      await this.leadRepo.bulkCreate(leads);
      await this.campaignRepo.updateStatus(campaignId, companyId, "completed", leads.length);

      return { ok: true, totalFound: leads.length };
    } catch (e) {
      await this.campaignRepo.updateStatus(campaignId, companyId, "failed");
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao executar campanha" };
    }
  }
}
```

---

## Task 9: Use Cases — Leads

- [ ] **Step 1: Criar `src/use-cases/leads/UpdateLeadStatus.ts`**

```typescript
import type { ILeadRepository, Lead, LeadStatus } from "@/domain/repositories/ILeadRepository";

type Input = { leadId: string; companyId: string; status: LeadStatus };
type Result = { ok: true; data: Lead } | { ok: false; error: string };

export class UpdateLeadStatus {
  constructor(private leadRepo: ILeadRepository) {}

  async execute({ leadId, companyId, status }: Input): Promise<Result> {
    try {
      const existing = await this.leadRepo.findById(leadId, companyId);
      if (!existing) return { ok: false, error: "Lead não encontrado" };
      const lead = await this.leadRepo.update(leadId, companyId, { status });
      return { ok: true, data: lead };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao atualizar lead" };
    }
  }
}
```

- [ ] **Step 2: Criar `src/use-cases/leads/GenerateDiagnosis.ts`**

```typescript
import type { IAIService } from "@/domain/services/IAIService";
import type { ILeadRepository, Lead } from "@/domain/repositories/ILeadRepository";
import type { INicheRepository } from "@/domain/repositories/INicheRepository";

type Input = { leadId: string; companyId: string };
type Result = { ok: true; data: Lead } | { ok: false; error: string };

const SYSTEM_PROMPT = `Você é um consultor de marketing digital especialista em prospecção ativa para agências.
Analise o lead e responda APENAS com JSON válido, sem texto extra:
{ "aiOverview": "parágrafo curto sobre o negócio e oportunidade", "suggestedOffer": "oferta em uma linha" }`;

export class GenerateDiagnosis {
  constructor(
    private leadRepo: ILeadRepository,
    private nicheRepo: INicheRepository,
    private aiService: IAIService
  ) {}

  async execute({ leadId, companyId }: Input): Promise<Result> {
    const lead = await this.leadRepo.findById(leadId, companyId);
    if (!lead) return { ok: false, error: "Lead não encontrado" };

    const niche = await this.nicheRepo.findById(lead.nicheId, companyId);

    const userPrompt = `Lead: ${lead.name} | Cidade: ${lead.city} | Nicho: ${niche?.name ?? ""}
Website: ${lead.hasWebsite} | Instagram: ${lead.hasInstagram} | Avaliação: ${lead.rating ?? "N/A"} (${lead.reviewCount ?? 0} avaliações)
Serviços da agência: ${niche?.targetServices.join(", ") ?? ""}
Dores do nicho: ${niche?.commonPains.join(", ") ?? ""}`;

    try {
      const raw = await this.aiService.complete(SYSTEM_PROMPT, userPrompt);
      const json = JSON.parse(raw.trim()) as { aiOverview: string; suggestedOffer: string };

      const updated = await this.leadRepo.update(leadId, companyId, {
        aiOverview: json.aiOverview,
        suggestedOffer: json.suggestedOffer,
      });

      return { ok: true, data: updated };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar diagnóstico" };
    }
  }
}
```

- [ ] **Step 3: Criar `src/use-cases/leads/GenerateMessage.ts`**

```typescript
import type { IAIService } from "@/domain/services/IAIService";
import type { ILeadRepository } from "@/domain/repositories/ILeadRepository";
import type { INicheRepository } from "@/domain/repositories/INicheRepository";

type Input = { leadId: string; companyId: string };
type Result = { ok: true; message: string } | { ok: false; error: string };

const SYSTEM_PROMPT = `Você é especialista em copy para prospecção via WhatsApp.
Gere uma mensagem de abordagem com no máximo 300 caracteres.
Use o template como base, personalize com os dados do lead.
Responda APENAS com o texto da mensagem, sem aspas ou formatação.`;

export class GenerateMessage {
  constructor(
    private leadRepo: ILeadRepository,
    private nicheRepo: INicheRepository,
    private aiService: IAIService
  ) {}

  async execute({ leadId, companyId }: Input): Promise<Result> {
    const lead = await this.leadRepo.findById(leadId, companyId);
    if (!lead) return { ok: false, error: "Lead não encontrado" };

    const niche = await this.nicheRepo.findById(lead.nicheId, companyId);

    const userPrompt = `Template do nicho: ${niche?.baseMessageTemplate ?? "Olá, {nome}! Vi que vocês estão em {cidade}."}
Lead: ${lead.name} | Cidade: ${lead.city}
Diagnóstico: ${lead.aiOverview ?? "Sem diagnóstico"}`;

    try {
      const message = await this.aiService.complete(SYSTEM_PROMPT, userPrompt);
      return { ok: true, message: message.trim().slice(0, 300) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Erro ao gerar mensagem" };
    }
  }
}
```

---

## Task 10: Server Actions

- [ ] **Step 1: Criar `src/app/actions/nichos/create-niche.ts`**

```typescript
"use server";

import { z } from "zod";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { CreateNiche } from "@/use-cases/nichos/CreateNiche";
import { requireCompany, requireUser } from "@/lib/tenant";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().default(""),
  keywords: z.array(z.string()).default([]),
  targetServices: z.array(z.string()).default([]),
  commonPains: z.array(z.string()).default([]),
  baseMessageTemplate: z.string().default(""),
  isActive: z.boolean().default(true),
});

export async function createNicheAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const repo = new DrizzleNicheRepository(db);
  const useCase = new CreateNiche(repo);
  return useCase.execute({ ...parsed.data, companyId });
}
```

- [ ] **Step 2: Criar `src/app/actions/nichos/update-niche.ts`**

```typescript
"use server";

import { z } from "zod";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { UpdateNiche } from "@/use-cases/nichos/UpdateNiche";
import { requireCompany, requireUser } from "@/lib/tenant";

const schema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).optional(),
  description: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  targetServices: z.array(z.string()).optional(),
  commonPains: z.array(z.string()).optional(),
  baseMessageTemplate: z.string().optional(),
  isActive: z.boolean().optional(),
});

export async function updateNicheAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const { id, ...data } = parsed.data;
  const repo = new DrizzleNicheRepository(db);
  const useCase = new UpdateNiche(repo);
  return useCase.execute({ id, companyId, data });
}
```

- [ ] **Step 3: Criar `src/app/actions/nichos/delete-niche.ts`**

```typescript
"use server";

import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { DeleteNiche } from "@/use-cases/nichos/DeleteNiche";
import { requireCompany, requireUser } from "@/lib/tenant";

export async function deleteNicheAction(id: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);
  const repo = new DrizzleNicheRepository(db);
  const useCase = new DeleteNiche(repo);
  return useCase.execute({ id, companyId });
}
```

- [ ] **Step 4: Criar `src/app/actions/campanhas/create-campaign.ts`**

```typescript
"use server";

import { z } from "zod";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { CreateCampaign } from "@/use-cases/campanhas/CreateCampaign";
import { requireCompany, requireUser } from "@/lib/tenant";

const schema = z.object({
  nicheId: z.string().uuid(),
  name: z.string().min(2),
  cep: z.string().length(8).optional().nullable(), // salvo via ViaCEP no form
  city: z.string().min(2),
  state: z.string().length(2),
  country: z.string().default("Brazil"),
  latitude: z.number(),
  longitude: z.number(),
  radiusKm: z.number().int().min(1).max(50).default(5),
  maxResults: z.number().int().min(10).max(200).default(50),
  additionalKeywords: z.array(z.string()).default([]),
});

export async function createCampaignAction(input: z.infer<typeof schema>) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0].message };

  const repo = new DrizzleCampaignRepository(db);
  const useCase = new CreateCampaign(repo);
  // cep ?? null para garantir que undefined não quebre a tipagem do use case
  return useCase.execute({ ...parsed.data, cep: parsed.data.cep ?? null, companyId });
}
```

- [ ] **Step 5: Criar `src/app/actions/campanhas/run-campaign.ts`**

> **Por que `after()`?** A busca Overpass + IA pode levar 5–30s. Se a action ficasse `await`, o Next.js encerraria a request aguardando o resultado — o cliente ficaria travado e o Vercel encerraria após 10s de timeout em Serverless. Com `after()`, a resposta `{ ok: true, queued: true }` é enviada imediatamente e o trabalho pesado continua em background. O cliente usa polling de 3s para detectar a conclusão.

```typescript
"use server";

import { after } from "next/server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { OverpassGeoService } from "@/infrastructure/services/OverpassGeoService";
import { CloudflareAIService } from "@/infrastructure/services/CloudflareAIService";
import { RunCampaign } from "@/use-cases/campanhas/RunCampaign";

export async function runCampaignAction(campaignId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  // Marca como "running" antes de retornar — o cliente vê o status mudar via polling
  const campaignRepo = new DrizzleCampaignRepository(db);
  await campaignRepo.updateStatus(campaignId, companyId, "running");

  // Recria as dependências dentro do after() — o escopo da request já fechou aqui
  after(async () => {
    const campaignRepo = new DrizzleCampaignRepository(db);
    const nicheRepo = new DrizzleNicheRepository(db);
    const leadRepo = new DrizzleLeadRepository(db);
    const geoService = new OverpassGeoService();
    const aiService = new CloudflareAIService();

    const useCase = new RunCampaign(campaignRepo, nicheRepo, leadRepo, geoService, aiService);
    await useCase.execute({ campaignId, companyId });
  });

  return { ok: true as const, queued: true };
}
```

**Polling no cliente (`CampanhasContent.tsx` e `CampanhaDetailContent.tsx`, ver Tasks 15 e 16):** enquanto uma campanha está `running`, o Client Component chama a Server Action de bootstrap diretamente a cada 3s — sem rota REST:

```typescript
// Ativa enquanto qualquer campanha estiver com status "running"
useEffect(() => {
  const hasRunning = campaigns.some((c) => c.status === "running");
  if (!hasRunning) return;

  const timer = setInterval(async () => {
    const { campaigns: fresh } = await getCampanhasBootstrapAction();
    setCampaigns((prev) => {
      for (const c of fresh) {
        const old = prev.find((p) => p.id === c.id);
        if (old?.status === "running" && c.status === "completed")
          setTimeout(() => toast.success(`${c.totalFound} leads encontrados`), 0);
        else if (old?.status === "running" && c.status === "failed")
          setTimeout(() => toast.error("Campanha falhou ao buscar leads"), 0);
      }
      return fresh;
    });
  }, 3000);

  return () => clearInterval(timer);
}, [campaigns]);
```

- [ ] **Step 6: Criar `src/app/actions/leads/update-lead-status.ts`**

```typescript
"use server";

import { z } from "zod";
import { db } from "@/infrastructure/db";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { UpdateLeadStatus } from "@/use-cases/leads/UpdateLeadStatus";
import { requireCompany, requireUser } from "@/lib/tenant";

const statusValues = ["new","qualified","not_qualified","whatsapp_opened","message_sent","responded","lost","do_not_contact"] as const;

export async function updateLeadStatusAction(leadId: string, status: typeof statusValues[number]) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);
  const repo = new DrizzleLeadRepository(db);
  const useCase = new UpdateLeadStatus(repo);
  return useCase.execute({ leadId, companyId, status });
}
```

- [ ] **Step 7: Criar `src/app/actions/leads/generate-diagnosis.ts`**

```typescript
"use server";

import { db } from "@/infrastructure/db";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { CloudflareAIService } from "@/infrastructure/services/CloudflareAIService";
import { GenerateDiagnosis } from "@/use-cases/leads/GenerateDiagnosis";
import { requireCompany, requireUser } from "@/lib/tenant";

export async function generateDiagnosisAction(leadId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const leadRepo = new DrizzleLeadRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);
  const aiService = new CloudflareAIService();

  const useCase = new GenerateDiagnosis(leadRepo, nicheRepo, aiService);
  return useCase.execute({ leadId, companyId });
}
```

- [ ] **Step 8: Criar `src/app/actions/leads/generate-message.ts`**

```typescript
"use server";

import { db } from "@/infrastructure/db";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { CloudflareAIService } from "@/infrastructure/services/CloudflareAIService";
import { GenerateMessage } from "@/use-cases/leads/GenerateMessage";
import { requireCompany, requireUser } from "@/lib/tenant";

export async function generateMessageAction(leadId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const leadRepo = new DrizzleLeadRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);
  const aiService = new CloudflareAIService();

  const useCase = new GenerateMessage(leadRepo, nicheRepo, aiService);
  return useCase.execute({ leadId, companyId });
}
```

- [ ] **Step 9: Criar `src/app/actions/nichos/get-nichos-bootstrap.ts`**

> Server Action de **leitura** (bootstrap), chamada pelo Data Loader do Server Component da página — não é uma rota GET. Ver "Server Component como Data Loader vs Client Component buscando via API" no início deste documento.

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function getNichosBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const repo = new DrizzleNicheRepository(db);
  const niches = await repo.findAllByCompany(companyId);
  return { niches };
}
```

- [ ] **Step 10: Criar `src/app/actions/campanhas/get-campanhas-bootstrap.ts`**

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function getCampanhasBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);

  const [campaigns, niches] = await Promise.all([
    campaignRepo.findAllByCompany(companyId),
    nicheRepo.findAllByCompany(companyId),
  ]);

  return { campaigns, niches };
}
```

Essa mesma action também é usada pelo Client Component para o **polling** de status enquanto uma campanha está `running` — chamada direta do client, sem precisar de rota REST.

- [ ] **Step 11: Criar `src/app/actions/campanhas/get-campanha-detail-bootstrap.ts`**

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function getCampanhaDetailBootstrapAction(campaignId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const campaign = await campaignRepo.findById(campaignId, companyId);
  if (!campaign) return { ok: false as const, error: "Campanha não encontrada" };

  const nicheRepo = new DrizzleNicheRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);

  const [niche, leads] = await Promise.all([
    nicheRepo.findById(campaign.nicheId, companyId),
    leadRepo.findByCampaign(campaignId, companyId),
  ]);

  return { ok: true as const, campaign, niche, leads };
}
```

- [ ] **Step 12: Criar `src/app/actions/leads/get-leads-bootstrap.ts`**

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";

export async function getLeadsBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const leadRepo = new DrizzleLeadRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);

  const [leads, campaigns] = await Promise.all([
    leadRepo.findAllByCompany(companyId),
    campaignRepo.findAllByCompany(companyId),
  ]);

  return { leads, campaigns };
}
```

---

## Task 11: Componentes compartilhados

- [ ] **Step 0a: Adicionar componente shadcn `skeleton`**

```bash
npx shadcn@latest add skeleton
```

- [ ] **Step 0b: Criar `src/components/BasePageLayout/BasePageLayout.tsx`**

> Wrapper usado por toda página protegida — título/descrição opcionais + padding consistente. Substitui o bloco `<div className="flex flex-1 flex-col p-8"><h1>...` que antes era duplicado em cada página.

```tsx
import type { ReactNode } from "react";

interface BasePageLayoutProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function BasePageLayout({ title, description, actions, children }: BasePageLayoutProps) {
  return (
    <div className="flex flex-1 flex-col p-8">
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            {description && (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}
```

`title` é opcional: páginas cujo Client Component já renderiza seu próprio cabeçalho rico (ex: detalhe da campanha, que mostra nome + badge + botão "Executar busca") passam `<BasePageLayout>` sem `title`, para não duplicar o `<h1>`.

- [ ] **Step 0c: Criar `src/components/shared/loading-content.tsx`**

> Skeleton exibido pelo `Suspense` enquanto o Data Loader (Server Component) busca os dados da página.

```tsx
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingContentProps {
  title?: string;
  withHeader?: boolean;
  rows?: number;
}

export function LoadingContent({ title, withHeader = true, rows = 4 }: LoadingContentProps) {
  return (
    <div className="flex flex-1 flex-col gap-4">
      {withHeader && (
        <div className="space-y-2">
          {title && <p className="text-sm text-muted-foreground">{title}</p>}
          <Skeleton className="h-8 w-64" />
        </div>
      )}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 1: Criar `src/components/TagInput.tsx`**

```tsx
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface TagInputProps {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}

export function TagInput({ label, values, onChange, placeholder }: TagInputProps) {
  const [input, setInput] = useState("");

  function addTag() {
    const tag = input.trim().replace(/,$/, "");
    if (tag && !values.includes(tag)) {
      onChange([...values, tag]);
    }
    setInput("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-input bg-transparent p-2">
        {values.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1 pr-1">
            {tag}
            <button
              type="button"
              onClick={() => onChange(values.filter((t) => t !== tag))}
              className="ml-0.5 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          onBlur={addTag}
          placeholder={values.length === 0 ? (placeholder ?? "Digite e pressione Enter") : ""}
          className="flex-1 min-w-24 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Criar `src/components/LeadsMap.tsx`**

> **Armadilha Turbopack:** `react-leaflet` não funciona bem com Turbopack (Next.js 16 dev mode).
> A solução é usar Leaflet diretamente com API imperativa dentro de `useEffect`.
> O CSS **deve** ser importado no topo do módulo como import estático — `require("leaflet/dist/leaflet.css")`
> dentro do `useEffect` falha com Turbopack porque CSS `require()` em runtime não é suportado.

```tsx
"use client";

/* eslint-disable @typescript-eslint/no-require-imports */
import "leaflet/dist/leaflet.css"; // import estático — Turbopack exige isso no topo
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

import type { Lead } from "@/domain/repositories/ILeadRepository";

function markerColor(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#94a3b8";
}

interface LeadsMapProps {
  leads: Lead[];
  center?: [number, number];
  zoom?: number;
  height?: number | string;
  onSelect?: (lead: Lead) => void;
}

export default function LeadsMap({
  leads,
  center,
  zoom = 13,
  height = 520,
  onSelect,
}: LeadsMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  const mapCenter: [number, number] =
    center ??
    (leads[0] ? [leads[0].latitude, leads[0].longitude] : [-27.5954, -48.548]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const L = require("leaflet");

    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const map = L.map(containerRef.current).setView(mapCenter, zoom);
    mapRef.current = map;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: '&copy; <a href="https://carto.com/">CartoDB</a>' }
    ).addTo(map);

    leads.forEach((lead) => {
      const color = markerColor(lead.score);
      const radius = Math.max(10, Math.min(22, lead.score / 5));
      const marker = L.circleMarker([lead.latitude, lead.longitude], {
        radius,
        fillColor: color,
        color,
        weight: 1.5,
        fillOpacity: 0.7,
      }).addTo(map);

      // XSS: usar DOM textContent em vez de innerHTML / template string HTML
      const popup = document.createElement("div");
      const nameEl = document.createElement("strong");
      nameEl.textContent = lead.name;
      const br1 = document.createElement("br");
      const scoreEl = document.createTextNode(`Score: ${lead.score}`);
      const br2 = document.createElement("br");
      const addrEl = document.createTextNode(lead.address ?? "");
      popup.append(nameEl, br1, scoreEl, br2, addrEl);
      marker.bindPopup(popup);

      if (onSelect) {
        marker.on("click", () => onSelect(lead));
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ height, width: "100%", borderRadius: "0.5rem" }}
    />
  );
}
```

- [ ] **Step 3: Criar `src/components/CampaignMap.tsx`**

> Mesma abordagem imperativa do LeadsMap — Leaflet via `require()` dentro de `useEffect`,
> CSS importado no topo do arquivo para compatibilidade com Turbopack.

```tsx
"use client";

/* eslint-disable @typescript-eslint/no-require-imports */
import "leaflet/dist/leaflet.css"; // import estático — Turbopack exige isso no topo
import { useEffect, useRef } from "react";
import type { Map as LeafletMap } from "leaflet";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Lead } from "@/domain/repositories/ILeadRepository";

function markerColor(score: number): string {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#94a3b8";
}

interface CampaignMapProps {
  campaign: Campaign;
  leads: Lead[];
}

export default function CampaignMap({ campaign, leads }: CampaignMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const L = require("leaflet");

    L.Icon.Default.mergeOptions({
      iconRetinaUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
      iconUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
      shadowUrl:
        "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
    });

    const center: [number, number] = [campaign.latitude, campaign.longitude];
    const map = L.map(containerRef.current).setView(center, 13);
    mapRef.current = map;

    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      { attribution: '&copy; <a href="https://carto.com/">CartoDB</a>' }
    ).addTo(map);

    L.marker(center)
      .addTo(map)
      .bindPopup(`Centro: ${campaign.city}, ${campaign.state}`);

    leads.forEach((lead) => {
      const color = markerColor(lead.score);
      const radius = Math.max(8, Math.min(18, lead.score / 5));
      // XSS: usar DOM textContent em vez de innerHTML / template string HTML
      const popup = document.createElement("div");
      const nameEl = document.createElement("strong");
      nameEl.textContent = lead.name;
      const br = document.createElement("br");
      const scoreEl = document.createTextNode(`Score: ${lead.score}`);
      popup.append(nameEl, br, scoreEl);
      L.circleMarker([lead.latitude, lead.longitude], {
        radius,
        fillColor: color,
        color,
        weight: 1.5,
        fillOpacity: 0.7,
      })
        .addTo(map)
        .bindPopup(popup);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ height: 420, width: "100%", borderRadius: "0.5rem" }}
    />
  );
}
```

---

## Task 12: Sidebar — adicionar links de navegação

**Arquivo:** `src/components/layout/Sidebar.tsx` (componente `AppSidebar`, construído sobre o `Sidebar` do shadcn/ui — ver `/docs/setup-next16-better-auth-neon.md` § Sidebar/Design System para a base já criada na Fase 1)

- [ ] **Step 1: Atualizar `navItems` com todas as rotas de Fase 2**

```typescript
import { BarChart2, Map, Tag, Users } from "lucide-react";

const navItems = [
  { href: "/prospeccao", label: "Dashboard", icon: BarChart2, exact: true },
  { href: "/prospeccao/nichos", label: "Nichos", icon: Tag, exact: false },
  { href: "/prospeccao/campanhas", label: "Campanhas", icon: Map, exact: false },
  { href: "/prospeccao/leads", label: "Leads", icon: Users, exact: false },
];
```

- [ ] **Step 2: Renderizar cada item com `SidebarMenuButton`**

O `Sidebar` do shadcn/ui usa o padrão `render` (base-ui) em vez de `asChild`: o `<Link>` é passado como elemento a renderizar, e o `isActive` controla o estado visual (`data-active`) sem precisar de classes condicionais manuais.

```tsx
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
```

Como a Fase 1 já entrega o `AppSidebar` construído sobre `Sidebar`/`SidebarMenu`/`SidebarMenuButton` do shadcn (não sobre `<div>`/`<a>` manuais), este Task só precisa acrescentar os 3 itens novos — nenhuma reestruturação do componente é necessária.

---

## Task 13: Dashboard — `src/app/(protected)/prospeccao/page.tsx`

- [ ] **Step 1: Reescrever como Server Component com dados reais**

```tsx
import Link from "next/link";
import { BarChart2, Map, Tag, TrendingUp, Users } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { CAMPAIGN_STATUS_CLASSES, CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const nicheRepo = new DrizzleNicheRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);

  const [niches, campaigns, leadCounts] = await Promise.all([
    nicheRepo.findAllByCompany(companyId),
    campaignRepo.findAllByCompany(companyId),
    leadRepo.countByCompany(companyId),
  ]);

  const activeNiches = niches.filter((n) => n.isActive).length;
  const completedCampaigns = campaigns.filter((c) => c.status === "completed").length;
  const recentCampaigns = campaigns.slice(-5).reverse();

  const stats = [
    { label: "Nichos ativos", value: activeNiches, icon: Tag, color: "text-primary bg-primary/10", href: "/prospeccao/nichos" },
    { label: "Campanhas concluídas", value: completedCampaigns, icon: Map, color: "text-violet-600 bg-violet-50", href: "/prospeccao/campanhas" },
    { label: "Leads prospectados", value: leadCounts.total, icon: Users, color: "text-amber-600 bg-amber-50", href: "/prospeccao/leads" },
    { label: "Qualificados (score 70+)", value: leadCounts.qualified, icon: TrendingUp, color: "text-emerald-600 bg-emerald-50", href: "/prospeccao/leads" },
  ];

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Visão geral da prospecção ativa
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, color, href }) => (
          <Link key={label} href={href}>
            <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-sm">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Campanhas recentes */}
      <div className="mt-8">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Campanhas recentes
        </h2>
        {recentCampaigns.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda.</p>
        ) : (
          <div className="space-y-2">
            {recentCampaigns.map((c) => (
              <Link key={c.id} href={`/prospeccao/campanhas/${c.id}`}>
                <div className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-muted/40">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.city}, {c.state}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums text-foreground">{c.totalFound} leads</span>
                    <Badge className={CAMPAIGN_STATUS_CLASSES[c.status]}>
                      {CAMPAIGN_STATUS_LABEL[c.status]}
                    </Badge>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## Task 14: Nichos — `src/app/(protected)/prospeccao/nichos/page.tsx`

> Segue o padrão thin-page + Suspense + bootstrap action + `_components/` explicado em "Conceitos que você precisa entender antes de codar".

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/nichos/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { getNichosBootstrapAction } from "@/app/actions/nichos/get-nichos-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { NichosContent } from "./_components/NichosContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Nichos" };
}

export default function NichosPage() {
  return (
    <BasePageLayout title="Nichos" description="Segmentos de mercado que você prospecta">
      <Suspense fallback={<LoadingContent title="Carregando nichos..." withHeader={false} rows={4} />}>
        <NichosDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function NichosDataLoader() {
  const { niches } = await getNichosBootstrapAction();
  return <NichosContent initialNiches={niches} />;
}
```

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/nichos/_components/NichosContent.tsx`**

Toda a interatividade (modais, formulário, TagInput, chamadas às actions de mutação) fica aqui. Recebe `initialNiches` como estado inicial — sem `useEffect` de fetch.

```tsx
"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Power, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { Niche } from "@/domain/repositories/INicheRepository";
import { createNicheAction } from "@/app/actions/nichos/create-niche";
import { deleteNicheAction } from "@/app/actions/nichos/delete-niche";
import { updateNicheAction } from "@/app/actions/nichos/update-niche";
import { TagInput } from "@/components/TagInput";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type NicheForm = {
  name: string;
  description: string;
  keywords: string[];
  targetServices: string[];
  commonPains: string[];
  baseMessageTemplate: string;
  isActive: boolean;
};

const emptyForm: NicheForm = {
  name: "",
  description: "",
  keywords: [],
  targetServices: [],
  commonPains: [],
  baseMessageTemplate: "",
  isActive: true,
};

interface NichosContentProps {
  initialNiches: Niche[];
}

export function NichosContent({ initialNiches }: NichosContentProps) {
  const [niches, setNiches] = useState<Niche[]>(initialNiches);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Niche | null>(null);
  const [form, setForm] = useState<NicheForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(niche: Niche) {
    setEditing(niche);
    setForm({
      name: niche.name,
      description: niche.description,
      keywords: niche.keywords,
      targetServices: niche.targetServices,
      commonPains: niche.commonPains,
      baseMessageTemplate: niche.baseMessageTemplate,
      isActive: niche.isActive,
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (editing) {
        const result = await updateNicheAction({ id: editing.id, ...form });
        if (!result.ok) { toast.error(result.error); return; }
        setNiches((prev) => prev.map((n) => (n.id === editing.id ? result.data : n)));
        toast.success("Nicho atualizado");
      } else {
        const result = await createNicheAction(form);
        if (!result.ok) { toast.error(result.error); return; }
        setNiches((prev) => [result.data, ...prev]);
        toast.success("Nicho criado");
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(niche: Niche) {
    const result = await updateNicheAction({ id: niche.id, isActive: !niche.isActive });
    if (!result.ok) { toast.error(result.error); return; }
    setNiches((prev) => prev.map((n) => (n.id === niche.id ? result.data : n)));
  }

  async function handleDelete(niche: Niche) {
    const result = await deleteNicheAction(niche.id);
    if (!result.ok) { toast.error(result.error); return; }
    setNiches((prev) => prev.filter((n) => n.id !== niche.id));
    toast.success("Nicho excluído");
  }

  async function generateAI() {
    if (!form.name) { toast.error("Digite o nome do nicho primeiro"); return; }
    setGenerating(true);
    await new Promise((r) => setTimeout(r, 800));
    const name = form.name.toLowerCase();
    if (name.includes("restaur") || name.includes("alimenta") || name.includes("pizza")) {
      setForm((f) => ({
        ...f,
        description: "Estabelecimentos de alimentação que precisam de presença digital e captação de clientes online.",
        keywords: ["restaurante", "pizzaria", "hamburgueria", "cafeteria", "lanchonete"],
        targetServices: ["Site profissional", "Cardápio digital", "Google Meu Negócio"],
        commonPains: ["Baixa presença digital", "Poucos pedidos online", "Sem site próprio"],
        baseMessageTemplate: "Olá, {nome}! Vi que vocês estão em {cidade} e quero apresentar uma solução para aumentar seus pedidos online.",
      }));
    } else if (name.includes("salon") || name.includes("beleza") || name.includes("estet")) {
      setForm((f) => ({
        ...f,
        description: "Salões de beleza e estética que buscam atrair novos clientes via redes sociais.",
        keywords: ["salão", "beleza", "estética", "cabeleireiro", "barbearia"],
        targetServices: ["Instagram profissional", "Agendamento online", "Google Ads"],
        commonPains: ["Agenda vazia", "Dependência de indicações", "Sem presença no Instagram"],
        baseMessageTemplate: "Oi, {nome}! Encontrei o salão de vocês em {cidade}. Posso ajudar a lotar a agenda usando o Instagram.",
      }));
    } else {
      setForm((f) => ({
        ...f,
        description: `Empresas do segmento ${form.name} que precisam de marketing digital para crescer.`,
        keywords: [form.name.toLowerCase()],
        targetServices: ["Site profissional", "Redes sociais", "Google Ads"],
        commonPains: ["Baixa presença digital", "Poucos clientes pelo digital"],
        baseMessageTemplate: "Olá, {nome}! Vi que vocês estão em {cidade} e tenho uma proposta para ajudar a crescer digitalmente.",
      }));
    }
    setGenerating(false);
    toast.success("Campos preenchidos com sugestão");
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1.5 h-4 w-4" /> Novo nicho
        </Button>
      </div>

      {niches.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <p className="text-sm text-muted-foreground">Nenhum nicho criado ainda</p>
          <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">
            <Plus className="mr-1.5 h-4 w-4" /> Criar primeiro nicho
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {niches.map((niche) => (
            <div key={niche.id} className="flex flex-col rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-foreground">{niche.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{niche.description}</p>
                </div>
                <Badge className={niche.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>
                  {niche.isActive ? "Ativo" : "Inativo"}
                </Badge>
              </div>
              <div className="mb-4 flex flex-wrap gap-1">
                {niche.keywords.slice(0, 3).map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-[11px]">{kw}</Badge>
                ))}
                {niche.keywords.length > 3 && (
                  <Badge variant="secondary" className="text-[11px]">+{niche.keywords.length - 3}</Badge>
                )}
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => openEdit(niche)} className="flex-1">
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleToggleActive(niche)} title={niche.isActive ? "Desativar" : "Ativar"}>
                  <Power className="h-4 w-4" />
                </Button>
                {!niche.isActive && (
                  <AlertDialog>
                    <AlertDialogTrigger>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-destructive transition-all hover:bg-muted">
                        <Trash2 className="h-4 w-4" />
                      </span>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir nicho?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Esta ação não pode ser desfeita. O nicho &quot;{niche.name}&quot; será removido permanentemente.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(niche)} className="bg-destructive text-destructive-foreground">
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar nicho" : "Novo nicho"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="niche-name">Nome *</Label>
                <Input id="niche-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Restaurantes" />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" size="sm" onClick={generateAI} disabled={generating}>
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="ml-1.5">Gerar com IA</span>
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="niche-desc">Descrição</Label>
              <Textarea id="niche-desc" rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>

            <TagInput label="Keywords de busca" values={form.keywords} onChange={(v) => setForm((f) => ({ ...f, keywords: v }))} placeholder="restaurante, pizzaria..." />
            <TagInput label="Serviços oferecidos" values={form.targetServices} onChange={(v) => setForm((f) => ({ ...f, targetServices: v }))} placeholder="Site, Google Ads..." />
            <TagInput label="Dores comuns" values={form.commonPains} onChange={(v) => setForm((f) => ({ ...f, commonPains: v }))} placeholder="Sem presença digital..." />

            <div className="space-y-1.5">
              <Label htmlFor="msg-template">Template de mensagem</Label>
              <Textarea
                id="msg-template"
                rows={3}
                value={form.baseMessageTemplate}
                onChange={(e) => setForm((f) => ({ ...f, baseMessageTemplate: e.target.value }))}
                placeholder="Use {nome} e {cidade} como variáveis"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

---

## Task 15: Campanhas — `src/app/(protected)/prospeccao/campanhas/page.tsx`

> Segue o padrão thin-page + Suspense + bootstrap action + `_components/`.

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/campanhas/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { getCampanhasBootstrapAction } from "@/app/actions/campanhas/get-campanhas-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { CampanhasContent } from "./_components/CampanhasContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Campanhas" };
}

export default function CampanhasPage() {
  return (
    <BasePageLayout title="Campanhas" description="Buscas georreferenciadas por nicho">
      <Suspense fallback={<LoadingContent title="Carregando campanhas..." withHeader={false} rows={5} />}>
        <CampanhasDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function CampanhasDataLoader() {
  const { campaigns, niches } = await getCampanhasBootstrapAction();
  return <CampanhasContent initialCampaigns={campaigns} initialNiches={niches} />;
}
```

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/campanhas/_components/CampanhasContent.tsx`**

> **Polling sem rota REST:** enquanto alguma campanha está `running` (a busca roda em background via `after()`), o Client Component chama `getCampanhasBootstrapAction()` diretamente a cada 3s — Server Actions podem ser invocadas do client livremente, sem precisar existir como rota HTTP.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, MapPin, Play, Plus } from "lucide-react";
import { toast } from "sonner";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Niche } from "@/domain/repositories/INicheRepository";
import { createCampaignAction } from "@/app/actions/campanhas/create-campaign";
import { getCampanhasBootstrapAction } from "@/app/actions/campanhas/get-campanhas-bootstrap";
import { runCampaignAction } from "@/app/actions/campanhas/run-campaign";
import { CAMPAIGN_STATUS_CLASSES, CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type CampaignForm = {
  cep: string;
  nicheId: string;
  name: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  maxResults: number;
};

const DEFAULT_FORM: CampaignForm = {
  cep: "",
  nicheId: "",
  name: "",
  city: "",
  state: "",
  country: "Brazil",
  latitude: 0,
  longitude: 0,
  radiusKm: 5,
  maxResults: 50,
};

interface CampanhasContentProps {
  initialCampaigns: Campaign[];
  initialNiches: Niche[];
}

export function CampanhasContent({ initialCampaigns, initialNiches }: CampanhasContentProps) {
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [niches] = useState<Niche[]>(initialNiches);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CampaignForm>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");

  // Polling automático enquanto qualquer campanha estiver "running"
  useEffect(() => {
    const hasRunning = campaigns.some((c) => c.status === "running");
    if (!hasRunning) return;

    const timer = setInterval(async () => {
      const { campaigns: fresh } = await getCampanhasBootstrapAction();
      setCampaigns((prev) => {
        for (const c of fresh) {
          const old = prev.find((p) => p.id === c.id);
          if (old?.status === "running" && c.status === "completed") {
            setTimeout(() => toast.success(`${c.totalFound} leads encontrados`), 0);
          } else if (old?.status === "running" && c.status === "failed") {
            setTimeout(() => toast.error("Campanha falhou ao buscar leads"), 0);
          }
        }
        return fresh;
      });
    }, 3000);

    return () => clearInterval(timer);
  }, [campaigns]);

  async function fetchCep(digits: string) {
    setCepLoading(true);
    setCepError("");
    try {
      const viacepRes = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const viacepData = await viacepRes.json();
      if (viacepData.erro) { setCepError("CEP não encontrado"); return; }
      const city: string = viacepData.localidade;
      const state: string = viacepData.uf;
      const query = encodeURIComponent(`${viacepData.logradouro || city}, ${city}, ${state}, Brazil`);
      const nominatimRes = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
        { headers: { "Accept-Language": "pt-BR" } }
      );
      const nominatimData = await nominatimRes.json();
      const lat = nominatimData[0] ? parseFloat(nominatimData[0].lat) : 0;
      const lon = nominatimData[0] ? parseFloat(nominatimData[0].lon) : 0;
      setForm((f) => ({ ...f, city, state, latitude: lat, longitude: lon }));
    } catch {
      setCepError("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }

  async function handleCreate() {
    if (!form.nicheId || !form.name || !form.cep || !form.city || !form.state || form.latitude === 0) {
      toast.error("Preencha o CEP e aguarde o preenchimento automático");
      return;
    }
    setSaving(true);
    const result = await createCampaignAction({ ...form, additionalKeywords: [] });
    setSaving(false);
    if (!result.ok) { toast.error(result.error); return; }
    setCampaigns((prev) => [...prev, result.data]);
    setOpen(false);
    setForm(DEFAULT_FORM);
    toast.success("Campanha criada");
  }

  async function handleRun(campaign: Campaign) {
    setRunning(campaign.id);
    setCampaigns((prev) => prev.map((c) => (c.id === campaign.id ? { ...c, status: "running" } : c)));
    // A action retorna imediatamente — AI + Overpass rodam em background.
    // O polling detecta quando o status muda para completed/failed.
    await runCampaignAction(campaign.id);
    setRunning(null);
  }

  const activeNiches = niches.filter((n) => n.isActive);

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setOpen(true)} size="sm" disabled={activeNiches.length === 0}>
          <Plus className="mr-1.5 h-4 w-4" /> Nova campanha
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-20">
          <MapPin className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma campanha criada ainda</p>
          {activeNiches.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">Crie um nicho ativo primeiro</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Nicho</TableHead>
                <TableHead>Segmentação</TableHead>
                <TableHead className="text-center">Leads</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {campaigns.map((c) => {
                const niche = niches.find((n) => n.id === c.nicheId);
                const isRunning = running === c.id || c.status === "running";
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-muted-foreground">{niche?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.city}, {c.state} · {c.radiusKm}km
                    </TableCell>
                    <TableCell className="text-center tabular-nums font-medium">{c.totalFound}</TableCell>
                    <TableCell>
                      <Badge className={CAMPAIGN_STATUS_CLASSES[c.status]}>
                        {CAMPAIGN_STATUS_LABEL[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRun(c)}
                          disabled={isRunning}
                          title="Executar busca"
                        >
                          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Link
                          href={`/prospeccao/campanhas/${c.id}`}
                          title="Ver detalhes"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-all hover:bg-muted hover:text-foreground"
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modal nova campanha */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova campanha</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nicho *</Label>
              <Select value={form.nicheId} onValueChange={(v) => { if (v) setForm((f) => ({ ...f, nicheId: v })); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um nicho">
                    {activeNiches.find((n) => n.id === form.nicheId)?.name}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {activeNiches.map((n) => (
                    <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Nome da campanha *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: Restaurantes - SP Centro" />
            </div>
            <div className="space-y-1.5">
              <Label>CEP *</Label>
              <div className="flex gap-2">
                <Input
                  value={form.cep.length > 5 ? `${form.cep.slice(0, 5)}-${form.cep.slice(5)}` : form.cep}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setForm((f) => ({ ...f, cep: v }));
                  }}
                  placeholder="00000-000"
                  maxLength={9}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fetchCep(form.cep)}
                  disabled={form.cep.length !== 8 || cepLoading}
                  className="shrink-0"
                >
                  {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>
              {cepError && <p className="text-xs text-destructive">{cepError}</p>}
              {form.latitude !== 0 && (
                <p className="text-xs text-muted-foreground">
                  {form.city}, {form.state} · {form.latitude.toFixed(4)}, {form.longitude.toFixed(4)}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cidade *</Label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="São Paulo" />
              </div>
              <div className="space-y-1.5">
                <Label>Estado *</Label>
                <Input
                  maxLength={2}
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))}
                  placeholder="SP"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Raio: {form.radiusKm} km</Label>
              <Slider
                min={1}
                max={50}
                step={1}
                value={[form.radiusKm]}
                onValueChange={(vals: number | readonly number[]) => {
                  const v = Array.isArray(vals) ? vals[0] : vals;
                  setForm((f) => ({ ...f, radiusKm: v ?? f.radiusKm }));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Máximo de resultados</Label>
              <Select
                value={String(form.maxResults)}
                onValueChange={(v) => { if (v) setForm((f) => ({ ...f, maxResults: parseInt(v, 10) })); }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Criar campanha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

---

## Task 16: Detalhe Campanha — `src/app/(protected)/prospeccao/campanhas/[id]/page.tsx`

> Segue o padrão thin-page + Suspense + bootstrap action + `_components/`. Como o Client Component já renderiza seu próprio cabeçalho rico (nome + badge + botão "Executar busca"), o `BasePageLayout` é usado **sem** `title` aqui.

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/campanhas/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCampanhaDetailBootstrapAction } from "@/app/actions/campanhas/get-campanha-detail-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { CampanhaDetailContent } from "./_components/CampanhaDetailContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Detalhe da campanha" };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampanhaDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <BasePageLayout>
      <Suspense fallback={<LoadingContent title="Carregando campanha..." withHeader={false} rows={4} />}>
        <CampanhaDetailDataLoader campaignId={id} />
      </Suspense>
    </BasePageLayout>
  );
}

async function CampanhaDetailDataLoader({ campaignId }: { campaignId: string }) {
  const result = await getCampanhaDetailBootstrapAction(campaignId);
  if (!result.ok) redirect("/prospeccao/campanhas");

  return (
    <CampanhaDetailContent
      initialCampaign={result.campaign}
      initialNiche={result.niche}
      initialLeads={result.leads}
    />
  );
}
```

**Por que `redirect()` em vez do `router.replace` client-side de antes:** a checagem de tenant (`campaignRepo.findById(campaignId, companyId)` retornando `null`) agora acontece no servidor, dentro da Server Action de bootstrap — então o redirecionamento também é feito no servidor, antes de qualquer HTML chegar ao client.

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/campanhas/[id]/_components/CampanhaDetailContent.tsx`**

> **Polling sem rota REST:** o `useEffect` de polling agora chama `getCampanhaDetailBootstrapAction(campaign.id)` diretamente, em vez de `fetch(`/api/campanhas/${id}`)`.

```tsx
"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, MessageCircle, Play, Target, Users } from "lucide-react";
import { toast } from "sonner";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Lead } from "@/domain/repositories/ILeadRepository";
import type { Niche } from "@/domain/repositories/INicheRepository";
import { getCampanhaDetailBootstrapAction } from "@/app/actions/campanhas/get-campanha-detail-bootstrap";
import { runCampaignAction } from "@/app/actions/campanhas/run-campaign";
import { CAMPAIGN_STATUS_CLASSES, CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CampaignMap = dynamic(() => import("@/components/CampaignMap"), { ssr: false });

function Metric({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

interface CampanhaDetailContentProps {
  initialCampaign: Campaign;
  initialNiche: Niche | null;
  initialLeads: Lead[];
}

export function CampanhaDetailContent({
  initialCampaign,
  initialNiche,
  initialLeads,
}: CampanhaDetailContentProps) {
  const [campaign, setCampaign] = useState<Campaign>(initialCampaign);
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [niche] = useState<Niche | null>(initialNiche);
  const [running, setRunning] = useState(false);

  // Polling enquanto campanha está em execução background (next/server after())
  useEffect(() => {
    if (campaign.status !== "running") return;
    const timer = setInterval(async () => {
      const result = await getCampanhaDetailBootstrapAction(campaign.id);
      if (!result.ok) return;
      const fresh = result.campaign;
      if (fresh.status === "completed") {
        clearInterval(timer);
        setCampaign(fresh);
        setLeads(result.leads);
        setTimeout(() => toast.success(`${fresh.totalFound} leads encontrados`), 0);
      } else if (fresh.status === "failed") {
        clearInterval(timer);
        setCampaign(fresh);
        setTimeout(() => toast.error("Campanha falhou ao buscar leads"), 0);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [campaign.status, campaign.id]);

  async function handleRun() {
    setRunning(true);
    setCampaign((c) => ({ ...c, status: "running" }));
    // action retorna imediatamente — AI + Overpass rodam em background via after()
    await runCampaignAction(campaign.id);
    setRunning(false);
  }

  const qualified = leads.filter((l) => l.score >= 70).length;
  const whatsappLikely = leads.filter(
    (l) => l.whatsappStatus === "probable" || l.whatsappStatus === "confirmed"
  ).length;
  const reached = leads.filter((l) =>
    ["whatsapp_opened", "message_sent", "responded"].includes(l.status)
  ).length;

  return (
    <>
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/prospeccao/campanhas"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg border-transparent text-sm font-medium transition-all hover:bg-muted hover:text-foreground"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {niche?.name} · {campaign.city}, {campaign.state}
            {campaign.cep ? ` (${campaign.cep.slice(0, 5)}-${campaign.cep.slice(5)})` : ""} · raio {campaign.radiusKm}km · máx {campaign.maxResults} resultados
          </p>
        </div>
        <Badge className={CAMPAIGN_STATUS_CLASSES[campaign.status]}>
          {CAMPAIGN_STATUS_LABEL[campaign.status]}
        </Badge>
        <Button onClick={handleRun} disabled={running || campaign.status === "running"} size="sm">
          {running || campaign.status === "running" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-4 w-4" />
          )}
          Executar busca
        </Button>
      </div>

      {/* Métricas */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="Total encontrados" value={campaign.totalFound} icon={<Users className="h-4 w-4" />} color="text-primary bg-primary/10" />
        <Metric label="Qualificados (70+)" value={qualified} icon={<Target className="h-4 w-4" />} color="text-emerald-600 bg-emerald-50" />
        <Metric label="WhatsApp provável" value={whatsappLikely} icon={<MessageCircle className="h-4 w-4" />} color="text-green-600 bg-green-50" />
        <Metric label="Abordados" value={reached} icon={<CheckCircle2 className="h-4 w-4" />} color="text-violet-600 bg-violet-50" />
      </div>

      {/* Parâmetros */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Parâmetros da busca</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Localização</span>
            <p className="font-medium">
              {campaign.city}, {campaign.state}
              {campaign.cep ? ` · ${campaign.cep.slice(0, 5)}-${campaign.cep.slice(5)}` : ""}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Coordenadas</span>
            <p className="font-medium tabular-nums">{campaign.latitude.toFixed(4)}, {campaign.longitude.toFixed(4)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Raio / Máximo</span>
            <p className="font-medium">{campaign.radiusKm}km · {campaign.maxResults} leads</p>
          </div>
        </div>
      </div>

      {/* Mapa */}
      {leads.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <CampaignMap campaign={campaign} leads={leads} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-20 text-sm text-muted-foreground">
          Execute a campanha para visualizar os leads no mapa
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Link
            href="/prospeccao/leads"
            className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground"
          >
            Ver todos os leads
          </Link>
        </div>
      )}
    </>
  );
}
```

---

## Task 17: Leads — `src/app/(protected)/prospeccao/leads/page.tsx`

> Segue o padrão thin-page + Suspense + bootstrap action + `_components/`. Como o Client Component já renderiza seu próprio cabeçalho (título + contador + toggle Lista/Mapa), o `BasePageLayout` é usado sem `title`.

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/leads/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { getLeadsBootstrapAction } from "@/app/actions/leads/get-leads-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { LeadsContent } from "./_components/LeadsContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Leads" };
}

export default function LeadsPage() {
  return (
    <BasePageLayout>
      <Suspense fallback={<LoadingContent title="Carregando leads..." withHeader={false} rows={6} />}>
        <LeadsDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function LeadsDataLoader() {
  const { leads, campaigns } = await getLeadsBootstrapAction();
  return <LeadsContent initialLeads={leads} initialCampaigns={campaigns} />;
}
```

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/leads/_components/LeadsContent.tsx`**

Toda a lógica (filtros, paginação, mapa, sheet de detalhes, geração de diagnóstico/mensagem por IA) migra sem mudança de comportamento — só troca o `useEffect` de fetch inicial por props (`initialLeads`, `initialCampaigns`).

```tsx
"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import {
  Camera, Globe, List, Loader2, Map, MessageCircle, Phone, Sparkles, Star,
} from "lucide-react";
import { toast } from "sonner";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Lead, LeadStatus } from "@/domain/repositories/ILeadRepository";
import { generateDiagnosisAction } from "@/app/actions/leads/generate-diagnosis";
import { generateMessageAction } from "@/app/actions/leads/generate-message";
import { updateLeadStatusAction } from "@/app/actions/leads/update-lead-status";
import { LEAD_STATUS_CLASSES, LEAD_STATUS_LABEL, scoreBg } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const LeadsMap = dynamic(() => import("@/components/LeadsMap"), { ssr: false });

const PER_PAGE = 15;

const LEAD_STATUSES: LeadStatus[] = [
  "new", "qualified", "not_qualified", "whatsapp_opened",
  "message_sent", "responded", "lost", "do_not_contact",
];

function Signal({
  active,
  icon: Icon,
  label,
}: {
  active: boolean;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <div
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
        active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-border text-muted-foreground"
      }`}
    >
      <Icon className="h-3 w-3" />
      {label}
    </div>
  );
}

interface LeadsContentProps {
  initialLeads: Lead[];
  initialCampaigns: Campaign[];
}

export function LeadsContent({ initialLeads, initialCampaigns }: LeadsContentProps) {
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [campaigns] = useState<Campaign[]>(initialCampaigns);
  const [view, setView] = useState<"list" | "map">("list");
  const [campaignId, setCampaignId] = useState("all");
  const [status, setStatus] = useState("all");
  const [minScore, setMinScore] = useState(0);
  const [onlyWa, setOnlyWa] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Lead | undefined>(undefined);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [generatingMsg, setGeneratingMsg] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState("");

  const filtered = useMemo(
    () =>
      leads.filter((l) => {
        if (campaignId !== "all" && l.campaignId !== campaignId) return false;
        if (status !== "all" && l.status !== status) return false;
        if (l.score < minScore) return false;
        if (onlyWa && !l.hasWhatsapp) return false;
        return true;
      }),
    [leads, campaignId, status, minScore, onlyWa]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const pageLeads = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function updateLead(id: string, patch: Partial<Lead>) {
    setLeads((arr) => arr.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setSelected((curr) => (curr?.id === id ? ({ ...curr, ...patch } as Lead) : curr));
  }

  async function handleDiagnosis() {
    if (!selected) return;
    setGeneratingAI(true);
    const result = await generateDiagnosisAction(selected.id);
    setGeneratingAI(false);
    if (!result.ok) { toast.error(result.error); return; }
    updateLead(selected.id, { aiOverview: result.data.aiOverview, suggestedOffer: result.data.suggestedOffer });
    toast.success("Diagnóstico gerado");
  }

  async function handleMessage() {
    if (!selected) return;
    setGeneratingMsg(true);
    const result = await generateMessageAction(selected.id);
    setGeneratingMsg(false);
    if (!result.ok) { toast.error(result.error); return; }
    setGeneratedMessage(result.message);
  }

  function openWhatsApp() {
    if (!selected?.phoneNormalized || !generatedMessage) return;
    const url = `https://wa.me/${selected.phoneNormalized}?text=${encodeURIComponent(generatedMessage)}`;
    window.open(url, "_blank");
    if (selected.status === "new" || selected.status === "qualified") {
      updateLeadStatusAction(selected.id, "whatsapp_opened").then((r) => {
        if (r.ok) updateLead(selected.id, { status: "whatsapp_opened" });
      });
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {filtered.length} lead{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={view === "list" ? "default" : "outline"} size="sm" onClick={() => setView("list")}>
            <List className="mr-1.5 h-4 w-4" /> Lista
          </Button>
          <Button variant={view === "map" ? "default" : "outline"} size="sm" onClick={() => setView("map")}>
            <Map className="mr-1.5 h-4 w-4" /> Mapa
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Campanha</Label>
          <Select value={campaignId} onValueChange={(v) => { if (v) { setCampaignId(v); setPage(1); } }}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue>
                {campaignId === "all" ? "Todas" : (campaigns.find((c) => c.id === campaignId)?.name ?? campaignId)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={(v) => { if (v) { setStatus(v); setPage(1); } }}>
            <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {LEAD_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-40 space-y-1.5">
          <Label className="text-xs">Score mínimo: {minScore}</Label>
          <Slider
            min={0}
            max={100}
            step={5}
            value={[minScore]}
            onValueChange={(vals: number | readonly number[]) => {
              const v = Array.isArray(vals) ? vals[0] : vals;
              setMinScore(v ?? 0);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="only-wa" checked={onlyWa} onCheckedChange={(v) => { setOnlyWa(!!v); setPage(1); }} />
          <Label htmlFor="only-wa" className="cursor-pointer text-xs">Só com WhatsApp</Label>
        </div>
      </div>

      {view === "map" ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <LeadsMap leads={filtered} onSelect={(lead) => setSelected(lead)} height={560} />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Cidade</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Sinais</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageLeads.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Nenhum lead corresponde aos filtros
                    </TableCell>
                  </TableRow>
                ) : (
                  pageLeads.map((lead) => (
                    <TableRow
                      key={lead.id}
                      className="cursor-pointer"
                      onClick={() => { setSelected(lead as Lead); setGeneratedMessage(""); }}
                    >
                      <TableCell className="font-medium">{lead.name}</TableCell>
                      <TableCell className="text-muted-foreground">{lead.city}, {lead.state}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${scoreBg(lead.score)}`}>
                          {lead.score}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {lead.hasWebsite && <Globe className="h-3.5 w-3.5 text-blue-500" />}
                          {lead.hasInstagram && <Camera className="h-3.5 w-3.5 text-pink-500" />}
                          {lead.hasWhatsapp && <MessageCircle className="h-3.5 w-3.5 text-green-500" />}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={LEAD_STATUS_CLASSES[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          )}
        </>
      )}

      {/* Sheet de detalhes */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(undefined)}>
        <SheetContent className="w-full max-w-md overflow-y-auto px-6">
          {selected && (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>{selected.name}</SheetTitle>
                <p className="text-sm text-muted-foreground">{selected.address}</p>
              </SheetHeader>

              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold tabular-nums ${scoreBg(selected.score)}`}>
                    Score {selected.score}
                  </span>
                  <Badge className={LEAD_STATUS_CLASSES[selected.status]}>{LEAD_STATUS_LABEL[selected.status]}</Badge>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Presença digital</p>
                  <div className="flex flex-wrap gap-2">
                    <Signal active={selected.hasWebsite} icon={Globe} label="Website" />
                    <Signal active={selected.hasInstagram} icon={Camera} label="Camera" />
                    <Signal active={selected.hasWhatsapp} icon={MessageCircle} label="WhatsApp" />
                  </div>
                </div>

                {selected.phone && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Contato</p>
                    <p className="flex items-center gap-1.5 text-sm">
                      <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                      {selected.phone}
                    </p>
                  </div>
                )}

                {selected.rating && (
                  <div className="flex items-center gap-1.5 text-sm">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{selected.rating.toFixed(1)}</span>
                    <span className="text-muted-foreground">({selected.reviewCount} avaliações)</span>
                  </div>
                )}

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Diagnóstico IA</p>
                    <Button size="sm" variant="outline" onClick={handleDiagnosis} disabled={generatingAI}>
                      {generatingAI ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      Gerar
                    </Button>
                  </div>
                  {selected.aiOverview ? (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm text-foreground">{selected.aiOverview}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhum diagnóstico gerado ainda</p>
                  )}
                  {selected.suggestedOffer && (
                    <p className="mt-2 text-xs text-muted-foreground">💡 {selected.suggestedOffer}</p>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Mensagem WhatsApp</p>
                    <Button size="sm" variant="outline" onClick={handleMessage} disabled={generatingMsg}>
                      {generatingMsg ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                      Gerar
                    </Button>
                  </div>
                  <Textarea
                    rows={4}
                    value={generatedMessage}
                    onChange={(e) => setGeneratedMessage(e.target.value)}
                    placeholder="Clique em 'Gerar' para criar uma mensagem personalizada..."
                    className="text-sm"
                  />
                  {selected.phoneNormalized && generatedMessage && (
                    <Button className="mt-3 w-full" onClick={openWhatsApp}>
                      <MessageCircle className="mr-1.5 h-4 w-4" /> Abrir WhatsApp
                    </Button>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Alterar status</p>
                  <Select
                    value={selected.status}
                    onValueChange={async (v) => {
                      if (!v) return;
                      const result = await updateLeadStatusAction(selected.id, v as LeadStatus);
                      if (result.ok) updateLead(selected.id, { status: v as LeadStatus });
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{LEAD_STATUS_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
```

---

## Task 18: Verificação final

- [ ] **Step 1: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | grep -v "docs/ui_loveble"
```

Resultado esperado: zero erros em `src/`.

- [ ] **Step 2: Testar fluxo completo**

| Ação | Resultado esperado |
|---|---|
| Acessar `/prospeccao` | Dashboard com cards de métricas (zeros se sem dados) |
| Acessar `/prospeccao/nichos` | Lista vazia com botão "Criar primeiro nicho" |
| Criar nicho | Card aparece na grid |
| Clicar "Gerar com IA" no modal | Campos preenchidos com preset |
| Acessar `/prospeccao/campanhas` | Lista vazia |
| Criar campanha com nicho ativo | Linha aparece na tabela com status "Rascunho" |
| Clicar "Executar" na campanha | Status muda para "Executando" → "Concluída" com N leads |
| Acessar detalhe da campanha | Mapa com CircleMarkers coloridos por score |
| Acessar `/prospeccao/leads` | Tabela com leads encontrados |
| Filtrar por campanha/status/score | Tabela atualiza em tempo real |
| Clicar em lead | Sheet abre com dados detalhados |
| Clicar "Gerar" diagnóstico | aiOverview e suggestedOffer aparecem |
| Clicar "Gerar" mensagem | Textarea preenchida com mensagem personalizada |
| Clicar "Abrir WhatsApp" | Abre `wa.me/` em nova aba com a mensagem |

---

## Armadilhas desta fase

### Leaflet e SSR + Turbopack (duas armadilhas distintas)
**Armadilha 1 — SSR:** O Leaflet usa `window` e `document`. Nunca importe diretamente em Server Components. Sempre use `dynamic(() => import(...), { ssr: false })` na página que importa os componentes de mapa.

**Armadilha 2 — Turbopack CSS:** `require("leaflet/dist/leaflet.css")` dentro de `useEffect` **falha com Turbopack** (Next.js 16 dev mode) com o erro "module factory is not available". O Turbopack não suporta `require()` de CSS em runtime. A solução é importar o CSS no **topo do arquivo** como import estático:

```typescript
// ERRADO — falha com Turbopack
useEffect(() => {
  const L = require("leaflet");
  require("leaflet/dist/leaflet.css"); // ← erro: module factory not available
}, []);

// CORRETO — import estático no topo do arquivo
import "leaflet/dist/leaflet.css"; // ← Turbopack processa corretamente
// ...
useEffect(() => {
  const L = require("leaflet"); // só o JS precisa de require dinâmico
}, []);
```

O motivo de ainda usar `require("leaflet")` em vez de `import L from "leaflet"` é que o `MapContainer` do Leaflet referencia `window` no module level — o import estático quebraria o SSR mesmo com `dynamic({ ssr: false })`. O CSS não tem esse problema.

### Overpass API — keywords PT ≠ amenity OSM (armadilha crítica)
A tag `amenity` no OpenStreetMap usa **inglês**: `restaurant`, `fast_food`, `cafe`, `bar`. Buscar `amenity~"restaurante"` retorna sempre 0 resultados porque nenhum dado OSM usa português nos valores de amenity.

**Solução implementada — IA gera as tags OSM dinamicamente:**
O use case `RunCampaign` chama `IAIService.complete()` com o nome/descrição do nicho em português e recebe de volta um JSON com os valores corretos para cada categoria OSM (`amenity`, `shop`, `craft`, `tourism`, `office`, `leisure`). O `OverpassGeoService` usa essas tags como query primária. Fallback por nome (`name~"keyword",i`) só ativa se a IA falhar.

```typescript
// RunCampaign — geração de tags OSM via IA
const raw = await this.aiService.complete(OSM_TAG_SYSTEM_PROMPT, `Niche: ${niche.name}`);
const match = raw.match(/\{[\s\S]*\}/);
if (match) {
  const parsed = JSON.parse(match[0]) as OsmTags;
  // osmTags = { amenity: ["restaurant","fast_food"], shop: [], ... }
  if (Object.values(parsed).some((v) => Array.isArray(v) && v.length > 0))
    osmTags = parsed;
}
```

Vantagem sobre dicionário estático: funciona para qualquer nicho sem manutenção manual. Desvantagem: adiciona ~1–2s de latência da IA antes de chamar o Overpass.

### Overpass API — HTTP 406 em server-side fetch (Node.js)
O Apache que faz proxy para a Overpass API retorna **406 Not Acceptable** quando o header `Accept` está ausente ou inválido. O browser envia `Accept: */*` por padrão, mas o Node.js fetch (usado em Server Actions) **não envia esse header**. Resultado: 406 em produção, funciona no browser.

**Solução:** sempre incluir explicitamente no fetch:
```typescript
headers: {
  "Content-Type": "application/x-www-form-urlencoded",
  "Accept": "application/json, text/plain, */*",
  "User-Agent": "ProspFlow/1.0 (prospflow@aivonlabs.com)",
}
```

### Overpass API — `around:` vs bounding box
A implementação usa `around:raioEmMetros,lat,lon` (círculo exato) em vez de bounding box (retângulo). A suposição inicial de que bbox seria mais rápido por usar índice espacial provou-se errada na prática — bbox retornou 0 resultados em testes enquanto `around:` retornou leads corretamente.

```typescript
// CORRETO — círculo centrado no ponto
const radiusMeters = radiusKm * 1000;
const around = `around:${radiusMeters},${lat},${lon}`;
lines.push(`  node["amenity"~"${amenity}"](${around});`);
```

### Overpass API — mirrors e cobertura do Brasil
`overpass-api.de` é o servidor primário com cobertura global completa. `kumi.systems` foi adicionado como **fallback secundário** — testado e funcional para dados do Brasil, mas com capacidade menor. `openstreetmap.ru` não é usado (sem dados do Brasil).

```typescript
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",       // primário — cobertura total
  "https://overpass.kumi.systems/api/interpreter",  // fallback — funcional para BR
];
```

A estratégia de fallback tenta o próximo endpoint apenas em caso de erro de rede ou HTTP 5xx/504 — nunca em caso de 429 (rate limit por IP, afeta todos os endpoints igualmente).

### Overpass API — timeout e performance da query

**`[timeout:30]` + `out tags center qt 200`** é a combinação ideal:

- `timeout:30` — o servidor Overpass aborta após 30s (menos que o default de 60s, reduz carga)
- `out tags` — retorna apenas as tags, sem coordenadas dos nós-membro de ways (muito mais leve que `out body`)
- `center` — calcula e retorna o centro geométrico de ways (necessário para plotar no mapa)
- `qt` — sem ordenação de resultado (mais rápido que o default que ordena por id)
- `200` — limite máximo retornado pelo Overpass; `maxResults` real é aplicado no código após filtrar `el.tags?.name`

```typescript
// CORRETO — leve e rápido
lines.push(");", "out tags center qt 200;");

// NÃO USAR — body retorna coordenadas de todos os nós-membro, muito pesado para ways complexos
lines.push(");", "out body center;");
```

O `AbortController` no cliente usa 35s (ligeiramente maior que o timeout da query) para garantir que a Overpass responda o erro de timeout antes de o cliente abortar — evita que a request fique presa indefinidamente.

### `after()` — execução em background de Server Actions
A busca Overpass + IA pode levar 5–30s. Usar `await` na action travaria a request do Next.js e causaria timeout em Vercel Serverless (limite de 10s). A solução é `after()` do `next/server`:

```typescript
// PADRÃO: action retorna imediatamente, trabalho pesado roda em background
after(async () => {
  // Este bloco executa APÓS a response ser enviada ao cliente
  await useCase.execute({ campaignId, companyId });
});
return { ok: true, queued: true }; // cliente recebe isso em ~200ms
```

**Consequências de design:**
1. A action nunca retorna `totalFound` — o valor só existe quando o background termina
2. O cliente precisa de polling para detectar a conclusão (setInterval a cada 3s)
3. O status "running" deve ser setado na DB *antes* do `after()` — senão o cliente não sabe que começou
4. As dependências (repos, services) precisam ser reinstanciadas *dentro* do `after()` — o escopo da request já fechou quando o callback executa

### Select component mostrando UUID em vez do nome do nicho
O componente `@base-ui/react/select` (shadcn) **não** resolve automaticamente o texto do item selecionado a partir do `value` prop — comportamento diferente do Radix UI clássico. Sem `children` explícitos em `SelectValue`, exibe o UUID cru.

```tsx
// ERRADO — exibe o UUID do nicho
<SelectValue placeholder="Selecione um nicho" />

// CORRETO — passa o texto como children explícito
<SelectValue placeholder="Selecione um nicho">
  {activeNiches.find((n) => n.id === form.nicheId)?.name}
</SelectValue>
```

### Coluna CEP na tabela de campanhas
O formulário de campanha usa CEP para geocodificação (ViaCEP + Nominatim), mas o CEP deve ser persistido para exibição posterior nos detalhes da campanha. Adicionado `cep varchar(8)` nullable em `prospectingCampaignsTable`. O `drizzle-kit push` aplica a coluna sem downtime (ADD COLUMN nullable).

### Arrays PostgreSQL com Drizzle
O Drizzle usa `sql\`'{}'\`` como default para arrays PostgreSQL. Sem isso, o banco retorna erro de tipo.

### doublePrecision vs real
`doublePrecision` (8 bytes) para lat/lng — precisão necessária para coordenadas geográficas. `real` (4 bytes) apenas para rating onde decimais grossos bastam.

### Campos de lat/lon no formulário de campanha → usar CEP
Expor latitude e longitude como campos numéricos editáveis é inutilizável na prática. A solução implementada usa **ViaCEP + Nominatim** para geocodificação automática:

1. Usuário digita o CEP → `onBlur` dispara `handleCepBlur`
2. Chamada à ViaCEP (`https://viacep.com.br/ws/{cep}/json/`) retorna cidade, estado e logradouro
3. Chamada ao Nominatim (`https://nominatim.openstreetmap.org/search`) converte o endereço em lat/lon
4. Campos `city`, `state`, `latitude`, `longitude` do formulário são preenchidos automaticamente
5. Cidade e estado ficam editáveis (correção manual possível); lat/lon são exibidos só como confirmação

**Atenção:** Nominatim tem rate limit de 1 req/s por IP. Em produção com muitos usuários, considere cache ou proxy. Para testes locais não há problema.

**Atenção 2:** `onBlur` no campo de CEP era pouco confiável (não disparava ao pressionar Enter ou navegar com Tab). A solução definitiva foi um botão "Buscar" explícito — mais previsível para o usuário e sem dependência de eventos de foco.

```typescript
// fetchCep — cliente (campanhas/page.tsx)
// Disparado pelo botão "Buscar" (não onBlur — onBlur é pouco confiável)
async function fetchCep(digits: string) {
  setCepLoading(true);
  setCepError("");
  try {
    const viacepData = await fetch(`https://viacep.com.br/ws/${digits}/json/`).then(r => r.json());
    if (viacepData.erro) { setCepError("CEP não encontrado"); return; }
    const city: string = viacepData.localidade;
    const state: string = viacepData.uf;
    const query = encodeURIComponent(`${viacepData.logradouro || city}, ${city}, ${state}, Brazil`);
    const nominatimData = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "pt-BR" } }
    ).then(r => r.json());
    const lat = nominatimData[0] ? parseFloat(nominatimData[0].lat) : 0;
    const lon = nominatimData[0] ? parseFloat(nominatimData[0].lon) : 0;
    setForm((f) => ({ ...f, city, state, latitude: lat, longitude: lon }));
  } catch {
    setCepError("Erro ao buscar CEP");
  } finally {
    setCepLoading(false);
  }
}
```

### Cloudflare AI — JSON parsing
O modelo pode retornar texto extra antes/depois do JSON. O `JSON.parse(raw.trim())` pode falhar. Em produção, usar regex para extrair o JSON do response ou adicionar tentativa com fallback.

### Route Handlers no Next.js 16
`params` em Route Handlers é uma `Promise` — sempre `await params` antes de desestruturar.

---

## Próximos passos — Fase 3

Na Fase 3 vamos construir o **Funil Comercial (CRM Kanban)**:

- Kanban com drag-and-drop via `@dnd-kit`
- 8 etapas padrão por empresa (SeedFunnelStages)
- Conversão de lead prospectado em lead do CRM
- Sheet de detalhes com histórico de atividades
- Tabelas: `funnel_stages`, `crm_leads`, `lead_activities`

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

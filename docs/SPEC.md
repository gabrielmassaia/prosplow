# SPEC — ProspFlow

> **Como usar este arquivo**
> Este é o documento-mestre do projeto. O agente deve **ler o SPEC inteiro antes de começar**
> para entender o contexto global, mas deve **executar apenas a fase indicada** na sessão atual.
>
> Instruções para AI AGENT - CLAUDE.MD e AGENTS.md
> Obrigatória a documentação em /phases no padrão de C:\projects\aivonlabs\prospflow\phases\FASE_1_setup-base.md.
> Referências de UI estão em `/docs/ui-lovable/` (projeto Lovable exportado).
> Referências de componentes e tipos estão em `/docs/DOC_*.md`.
> Guia de setup base está em `/docs/setup-next16-better-auth-neon.md`.

---

## Visão geral do produto

**ProspFlow** é um SaaS multi-tenant de prospecção ativa e gestão comercial para agências de marketing digital. Permite criar nichos de mercado, executar campanhas de busca georreferenciada via Overpass API, qualificar leads com IA (Cloudflare AI), enviar abordagens via WhatsApp e gerenciar o pipeline comercial em um kanban.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 |
| Estilização | Tailwind CSS v4 |
| Componentes | shadcn/ui |
| Banco | PostgreSQL via Neon (serverless) |
| ORM | Drizzle ORM |
| Autenticação | Better Auth |
| IA | Cloudflare AI (Workers AI — gratuito) |
| Mapas | Leaflet + react-leaflet (client-only) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Deploy | Vercel |

---

## Princípios de arquitetura

A estrutura segue um **Clean Architecture pragmático** — não o full enterprise com entities isoladas, mas o suficiente para garantir:

- **DIP (Dependency Inversion):** Use cases dependem de interfaces (`ILeadRepository`, `IGeoService`), nunca de implementações concretas (Drizzle, Overpass). Trocar banco ou provider de IA não toca em lógica de negócio.
- **SRP (Single Responsibility):** Actions são controllers finos. Só validam input, chamam o use case e retornam. Lógica de negócio fica nos use cases.
- **ISP (Interface Segregation):** Cada repositório expõe só o que seus consumidores precisam. `ICampaignRepository` não carrega métodos de leads.
- **OCP (Open/Closed):** Adicionar novo provider de IA ou geo significa criar uma nova implementação em `infrastructure/services/`, sem alterar use cases.

### As três camadas

```
domain/          → contratos (interfaces). Zero dependência externa. Nunca importa Drizzle, Next.js ou qualquer lib.
infrastructure/  → implementações concretas dos contratos. Conhece Drizzle, Fetch, Cloudflare.
app/             → Next.js. Actions são controllers: validam, instanciam use case com dependências, retornam.
```

A regra de dependência: as setas sempre apontam para dentro. `app → use-cases → domain`. `infrastructure → domain`. Nunca o contrário.

---

## Estrutura de pastas

```
/
├── docs/                                     ← documentação (não entra no build)
│   ├── SPEC.md
│   ├── setup-next16-better-auth-neon.md
│   ├── DOC_INDEX.md
│   ├── DOC_AppLayout.md
│   ├── DOC_Campanhas.md
│   ├── DOC_DashboardProspeccao.md
│   ├── DOC_DetalheCampanha.md
│   ├── DOC_Funil.md
│   ├── DOC_Leads.md
│   ├── DOC_Login.md
│   ├── DOC_Nichos.md
│   ├── DOC_Signup.md
│   └── ui-lovable/                           ← projeto Lovable exportado (referência de UI)
│
├── drizzle/                                  ← migrations geradas pelo drizzle-kit
├── drizzle.config.ts
├── .env.local
├── .env.local.example
│
└── src/
    │
    ├── domain/                               ← CAMADA DE DOMÍNIO
    │   └── repositories/                    ← contratos (interfaces puras, sem implementação)
    │       ├── IUserRepository.ts
    │       ├── ICompanyRepository.ts
    │       ├── INicheRepository.ts
    │       ├── ICampaignRepository.ts
    │       ├── ILeadRepository.ts
    │       ├── IFunnelStageRepository.ts
    │       ├── ICrmLeadRepository.ts
    │       └── ILeadActivityRepository.ts
    │
    ├── infrastructure/                       ← CAMADA DE INFRAESTRUTURA
    │   ├── db/
    │   │   ├── index.ts                     ← pool PostgreSQL + instância drizzle (singleton)
    │   │   └── schema.ts                    ← todas as tabelas Drizzle
    │   ├── repositories/                    ← implementações concretas dos contratos
    │   │   ├── DrizzleUserRepository.ts
    │   │   ├── DrizzleCompanyRepository.ts
    │   │   ├── DrizzleNicheRepository.ts
    │   │   ├── DrizzleCampaignRepository.ts
    │   │   ├── DrizzleLeadRepository.ts
    │   │   ├── DrizzleFunnelStageRepository.ts
    │   │   ├── DrizzleCrmLeadRepository.ts
    │   │   └── DrizzleLeadActivityRepository.ts
    │   └── services/                        ← integrações externas (implementam interfaces do domain)
    │       ├── CloudflareAIService.ts       ← implementa IAIService
    │       └── OverpassGeoService.ts        ← implementa IGeoService
    │
    ├── use-cases/                            ← LÓGICA DE NEGÓCIO (sem framework)
    │   ├── auth/
    │   │   └── CreateUserWithCompany.ts     ← cria user + company + member em transação
    │   ├── nichos/
    │   │   ├── CreateNiche.ts
    │   │   ├── UpdateNiche.ts
    │   │   └── DeleteNiche.ts
    │   ├── campanhas/
    │   │   ├── CreateCampaign.ts
    │   │   └── RunCampaign.ts               ← orquestra Overpass + score + persist leads
    │   ├── leads/
    │   │   ├── UpdateLeadStatus.ts
    │   │   ├── GenerateDiagnosis.ts         ← chama IAIService
    │   │   └── GenerateMessage.ts           ← chama IAIService
    │   └── funil/
    │       ├── CreateCrmLead.ts
    │       ├── MoveLead.ts                  ← move stage + registra LeadActivity
    │       ├── UpdateCrmLead.ts
    │       └── SeedFunnelStages.ts          ← cria as 8 etapas padrão para nova empresa
    │
    ├── lib/                                  ← UTILITÁRIOS TRANSVERSAIS
    │   ├── auth.ts                          ← instância servidor Better Auth
    │   ├── auth-client.ts                   ← cliente React Better Auth
    │   ├── tenant.ts                        ← requireUser() + requireCompany()
    │   └── format.ts                        ← formatBRL, scoreColor, LEAD_STATUS_LABEL etc.
    │
    └── app/                                  ← CAMADA NEXT.JS (controllers + UI)
        ├── api/
        │   └── auth/
        │       └── [...all]/route.ts        ← handler universal Better Auth
        │
        ├── actions/                          ← controllers finos: validar → use case → return
        │   ├── auth/
        │   │   └── signup.ts
        │   ├── nichos/
        │   │   ├── create-niche.ts
        │   │   ├── update-niche.ts
        │   │   └── delete-niche.ts
        │   ├── campanhas/
        │   │   ├── create-campaign.ts
        │   │   └── run-campaign.ts
        │   ├── leads/
        │   │   ├── update-lead-status.ts
        │   │   ├── generate-diagnosis.ts
        │   │   └── generate-message.ts
        │   └── funil/
        │       ├── create-crm-lead.ts
        │       ├── move-lead.ts
        │       └── update-crm-lead.ts
        │
        ├── (auth)/
        │   ├── layout.tsx
        │   ├── login/page.tsx
        │   └── register/page.tsx
        │
        ├── (app)/
        │   ├── layout.tsx                   ← AppLayout com sidebar (ver DOC_AppLayout.md)
        │   ├── prospeccao/
        │   │   ├── page.tsx                 ← dashboard (ver DOC_DashboardProspeccao.md)
        │   │   ├── nichos/page.tsx          ← (ver DOC_Nichos.md)
        │   │   ├── campanhas/
        │   │   │   ├── page.tsx             ← (ver DOC_Campanhas.md)
        │   │   │   └── [id]/page.tsx        ← (ver DOC_DetalheCampanha.md)
        │   │   └── leads/page.tsx           ← (ver DOC_Leads.md)
        │   └── funil/page.tsx               ← (ver DOC_Funil.md)
        │
        ├── layout.tsx                       ← root layout
        ├── middleware.ts
        └── not-found.tsx
```

---

## Contratos de domínio

> Interfaces puras. Nenhuma importa Drizzle ou qualquer lib externa.
> Toda implementação concreta fica em `infrastructure/repositories/`.

### Repositórios — Fase 1

```typescript
// src/domain/repositories/ICompanyRepository.ts
export interface ICompanyRepository {
  create(data: { name: string; slug: string; ownerId: string }): Promise<Company>;
  findByUserId(userId: string): Promise<Company | null>;
  findById(id: string): Promise<Company | null>;
}

// src/domain/repositories/IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
}
```

### Repositórios — Fase 2

```typescript
// src/domain/repositories/INicheRepository.ts
export interface INicheRepository {
  findAllByCompany(companyId: string): Promise<Niche[]>;
  create(data: CreateNicheData): Promise<Niche>;
  update(id: string, companyId: string, data: Partial<CreateNicheData>): Promise<Niche>;
  delete(id: string, companyId: string): Promise<void>;
}

// src/domain/repositories/ICampaignRepository.ts
export interface ICampaignRepository {
  findAllByCompany(companyId: string): Promise<Campaign[]>;
  findById(id: string, companyId: string): Promise<Campaign | null>;
  create(data: CreateCampaignData): Promise<Campaign>;
  updateStatus(id: string, companyId: string, status: CampaignStatus, totalFound?: number): Promise<void>;
}

// src/domain/repositories/ILeadRepository.ts
export interface ILeadRepository {
  findByCampaign(campaignId: string, companyId: string): Promise<Lead[]>;
  findAllByCompany(companyId: string, filters?: LeadFilters): Promise<Lead[]>;
  bulkCreate(leads: CreateLeadData[]): Promise<Lead[]>;
  update(id: string, companyId: string, data: Partial<Lead>): Promise<Lead>;
}
```

### Interfaces de serviço — Fase 2

```typescript
// src/domain/repositories/IGeoService.ts
export interface IGeoService {
  search(params: GeoSearchParams): Promise<GeoResult[]>;
}

export interface GeoSearchParams {
  latitude: number;
  longitude: number;
  radiusKm: number;
  keywords: string[];
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

// src/domain/repositories/IAIService.ts
export interface IAIService {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}
```

---

## Schema completo do banco

### Tabelas Better Auth + tenant (Fase 1)

```typescript
import {
  boolean, index, pgEnum, pgTable, text,
  timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// ── Better Auth (obrigatórias) ─────────────────────────────────────────────

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
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
});

export const accountsTable = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
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
  ownerId: text("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
});

export const companyRoleEnum = pgEnum("company_role", ["owner", "member"]);

export const companyMembersTable = pgTable("company_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: companyRoleEnum("role").default("owner").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  companyUserUnique: uniqueIndex("company_members_company_user_unique").on(t.companyId, t.userId),
  companyIdIdx: index("company_members_company_id_idx").on(t.companyId),
}));
```

### Tabelas de prospecção (Fase 2)

```typescript
import { sql, doublePrecision, integer, real, varchar } from "drizzle-orm/pg-core";

export const prospectingNichesTable = pgTable("prospecting_niches", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  keywords: text("keywords").array().notNull().default(sql`'{}'`),
  targetServices: text("target_services").array().notNull().default(sql`'{}'`),
  commonPains: text("common_pains").array().notNull().default(sql`'{}'`),
  baseMessageTemplate: text("base_message_template").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  companyIdIdx: index("prospecting_niches_company_id_idx").on(t.companyId),
}));

export const campaignStatusEnum = pgEnum("campaign_status", ["draft", "running", "completed", "failed"]);

export const prospectingCampaignsTable = pgTable("prospecting_campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  nicheId: uuid("niche_id").notNull().references(() => prospectingNichesTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: varchar("state", { length: 2 }).notNull(),
  country: text("country").notNull().default("Brazil"),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  radiusKm: integer("radius_km").notNull().default(5),
  maxResults: integer("max_results").notNull().default(50),
  additionalKeywords: text("additional_keywords").array().notNull().default(sql`'{}'`),
  status: campaignStatusEnum("status").notNull().default("draft"),
  totalFound: integer("total_found").notNull().default(0),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  companyIdIdx: index("campaigns_company_id_idx").on(t.companyId),
  nicheIdIdx: index("campaigns_niche_id_idx").on(t.nicheId),
}));

export const leadStatusEnum = pgEnum("lead_status", [
  "new", "qualified", "not_qualified",
  "whatsapp_opened", "message_sent", "responded",
  "lost", "do_not_contact",
]);

export const whatsappStatusEnum = pgEnum("whatsapp_status", [
  "unknown", "probable", "confirmed", "invalid",
]);

export const prospectingLeadsTable = pgTable("prospecting_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  campaignId: uuid("campaign_id").notNull().references(() => prospectingCampaignsTable.id, { onDelete: "cascade" }),
  nicheId: uuid("niche_id").notNull().references(() => prospectingNichesTable.id, { onDelete: "restrict" }),
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
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  companyIdIdx: index("leads_company_id_idx").on(t.companyId),
  campaignIdIdx: index("leads_campaign_id_idx").on(t.campaignId),
  statusIdx: index("leads_status_idx").on(t.status),
  scoreIdx: index("leads_score_idx").on(t.score),
}));
```

### Tabelas de funil (Fase 3)

```typescript
import { numeric } from "drizzle-orm/pg-core";

export const stageKindEnum = pgEnum("stage_kind", ["normal", "won", "lost", "triage"]);

export const funnelStagesTable = pgTable("funnel_stages", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  colorHex: varchar("color_hex", { length: 7 }).notNull().default("#6366f1"),
  kind: stageKindEnum("kind").notNull().default("normal"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  companyPositionUnique: uniqueIndex("funnel_stages_company_position_unique").on(t.companyId, t.position),
}));

export const crmLeadOriginEnum = pgEnum("crm_lead_origin", ["manual", "prospecting"]);

export const crmLeadsTable = pgTable("crm_leads", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  prospectingLeadId: uuid("prospecting_lead_id").references(() => prospectingLeadsTable.id, { onDelete: "set null" }),
  stageId: uuid("stage_id").notNull().references(() => funnelStagesTable.id, { onDelete: "restrict" }),
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
}, (t) => ({
  companyIdIdx: index("crm_leads_company_id_idx").on(t.companyId),
  stageIdIdx: index("crm_leads_stage_id_idx").on(t.stageId),
}));

export const leadActivitiesTable = pgTable("lead_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  companyId: uuid("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  leadId: uuid("lead_id").notNull().references(() => crmLeadsTable.id, { onDelete: "cascade" }),
  fromStageId: uuid("from_stage_id").references(() => funnelStagesTable.id, { onDelete: "set null" }),
  toStageId: uuid("to_stage_id").references(() => funnelStagesTable.id, { onDelete: "set null" }),
  description: text("description").notNull(),
  createdBy: text("created_by").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  leadIdIdx: index("lead_activities_lead_id_idx").on(t.leadId),
  createdAtIdx: index("lead_activities_created_at_idx").on(t.createdAt),
}));
```

---

## Integrações externas

### ViaCEP + Nominatim (geocodificação do formulário de campanha)

No formulário de criação de campanha, o usuário informa apenas o **CEP**. O sistema faz duas chamadas client-side para obter coordenadas automaticamente:

1. **ViaCEP** (`https://viacep.com.br/ws/{cep}/json/`) → retorna `localidade` (cidade), `uf` (estado), `logradouro`
2. **Nominatim/OpenStreetMap** (`https://nominatim.openstreetmap.org/search`) → converte o endereço em `latitude` e `longitude`

Ambas as APIs são gratuitas e não requerem chave de API. Os campos cidade e estado são preenchidos automaticamente mas continuam editáveis. Lat/lon ficam visíveis como informação de confirmação (read-only) abaixo do campo CEP.

```typescript
// Fluxo no componente (client-side, onBlur do campo CEP)
const viacepRes = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
const { localidade, uf, logradouro } = await viacepRes.json();

const query = encodeURIComponent(`${logradouro || localidade}, ${localidade}, ${uf}, Brazil`);
const nominatimRes = await fetch(
  `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
  { headers: { "Accept-Language": "pt-BR" } }
);
const [{ lat, lon }] = await nominatimRes.json();
```

---

### Overpass API (busca georreferenciada)

Gratuito, sem chave de API. Endpoint: `https://overpass-api.de/api/interpreter`

**Estratégia de query dupla:** as keywords do nicho são em português, mas o OSM taggeia negócios com `amenity` em inglês (ex: `restaurant`, não `restaurante`). A solução usa uma query combinada:

1. **Amenity-based** (principal): busca por `amenity~"restaurant|fast_food|cafe|bar"` com `["name"]` obrigatório → encontra todos os restaurantes independente do nome do estabelecimento
2. **Name-based** (fallback): busca `name~"restaurante|pizzaria",i` → pega estabelecimentos sem tag `amenity` mas com keyword no nome

O mapeamento `KEYWORD_TO_AMENITY` em `OverpassGeoService.ts` converte keywords PT → amenity OSM para ~40 tipos de negócio. Novos mapeamentos podem ser adicionados sem alterar a interface `IGeoService`.

**Headers obrigatórios no fetch server-side:** o Node.js fetch não envia `Accept: */*` por padrão (diferente do browser). O Apache/proxy da Overpass retorna 406 sem esse header. Sempre incluir:
```
Accept: application/json, text/plain, */*
User-Agent: ProspFlow/1.0
```

```typescript
// Query gerada para keywords ["restaurante", "pizzaria", "lanchonete"]
[out:json][timeout:25];
(
  node["amenity"~"restaurant|fast_food"]["name"](around:5000,lat,lon);
  way["amenity"~"restaurant|fast_food"]["name"](around:5000,lat,lon);
  node["name"~"restaurante|pizzaria|lanchonete",i](around:5000,lat,lon);
  way["name"~"restaurante|pizzaria|lanchonete",i](around:5000,lat,lon);
);
out body center;
```

**Algoritmo de score (executado no use case `RunCampaign`, não na infra):**

| Sinal | Pontos |
|---|---|
| Score base | +20 |
| Tem website | +20 |
| Tem telefone | +15 |
| Rating >= 4.0 | +20 |
| Rating >= 3.0 | +10 |
| reviewCount >= 50 | +15 |
| reviewCount >= 10 | +5 |
| Tag instagram presente | +10 |

Score máximo: 100. Score mínimo: 20.

### Cloudflare AI

Modelo: `@cf/meta/llama-3-8b-instruct` (tier gratuito).

```typescript
// src/infrastructure/services/CloudflareAIService.ts
// Implementa IAIService

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/meta/llama-3-8b-instruct`;
```

**System prompt — diagnóstico de lead:**
```
Você é um consultor de marketing digital especialista em prospecção ativa para agências.
Analise o lead e responda APENAS com JSON válido, sem texto extra:
{ "aiOverview": "parágrafo curto sobre o negócio e oportunidade", "suggestedOffer": "oferta em uma linha" }
```

**User prompt — diagnóstico:**
```
Lead: {nome} | Cidade: {cidade} | Nicho: {nicheName}
Website: {hasWebsite} | Instagram: {hasInstagram} | Avaliação: {rating} ({reviewCount} avaliações)
Serviços da agência: {targetServices}
Dores do nicho: {commonPains}
```

**System prompt — geração de mensagem:**
```
Você é especialista em copy para prospecção via WhatsApp.
Gere uma mensagem de abordagem com no máximo 300 caracteres.
Use o template como base, personalize com os dados do lead.
Responda APENAS com o texto da mensagem, sem aspas ou formatação.
```

**User prompt — mensagem:**
```
Template do nicho: {baseMessageTemplate}
Lead: {nome} | Cidade: {cidade}
Diagnóstico: {aiOverview}
```

---

## Fases de desenvolvimento

---

### ✅ FASE 1 — Setup base (executar agora)

**Objetivo:** Next.js 16 funcionando com banco conectado, autenticação completa, criação de empresa no cadastro. Estrutura de pastas da arquitetura criada (mesmo que vazia nas camadas de domínio).

**Entregáveis obrigatórios:**

#### Estrutura e configuração

- `drizzle.config.ts` na raiz
- `.env.local.example` com todas as variáveis da Fase 1
- Pasta `src/domain/repositories/` criada com `IUserRepository.ts` e `ICompanyRepository.ts`
- Pasta `src/infrastructure/repositories/` criada
- Pasta `src/use-cases/auth/` criada

#### Banco — `src/infrastructure/db/`

- `index.ts` — pool PostgreSQL singleton com SSL para Neon (ver `/docs/setup-next16-better-auth-neon.md` § 4)
- `schema.ts` — tabelas da Fase 1: `usersTable`, `sessionsTable`, `accountsTable`, `verificationsTable`, `companiesTable`, `companyMembersTable`

#### Domínio — `src/domain/repositories/`

```typescript
// IUserRepository.ts
export interface IUserRepository {
  findById(id: string): Promise<{ id: string; name: string; email: string } | null>;
}

// ICompanyRepository.ts
export interface ICompanyRepository {
  create(data: { name: string; slug: string; ownerId: string }): Promise<{ id: string; name: string; slug: string }>;
  findByUserId(userId: string): Promise<{ id: string; name: string; slug: string } | null>;
}
```

#### Infraestrutura — `src/infrastructure/repositories/`

```typescript
// DrizzleCompanyRepository.ts — implementa ICompanyRepository
// Usa db.transaction() para create (companies + company_members atomicamente)
// findByUserId: join company_members → companies WHERE userId = ?
```

#### Use case — `src/use-cases/auth/CreateUserWithCompany.ts`

```typescript
// Recebe: { name, email, password, companyName }
// 1. Chama auth.api.signUpEmail() para criar o usuário no Better Auth
// 2. Gera slug: slugify(companyName)
// 3. Chama ICompanyRepository.create() em db.transaction()
// 4. Retorna { ok: true } | { ok: false, error: string }

// Regra de slugify:
// s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
```

#### Auth e tenant — `src/lib/`

- `auth.ts` — instância Better Auth com drizzleAdapter, emailAndPassword + bcrypt (ver `/docs/setup-next16-better-auth-neon.md` § 6)
- `auth-client.ts` — `createAuthClient()` (ver § 7)
- `tenant.ts` — `requireUser()` e `requireCompany(userId)` (ver § 9)

#### App — `src/app/`

- `api/auth/[...all]/route.ts` — `toNextJsHandler(auth)`
- `actions/auth/signup.ts` — controller: valida campos → instancia use case → retorna `{ ok, error? }`
- `(auth)/layout.tsx` — layout público centralizado
- `(auth)/login/page.tsx` — `"use client"`, chama `authClient.signIn.email()`, redireciona para `/prospeccao`
- `(auth)/register/page.tsx` — `"use client"`, 4 campos (nome, empresa, email, senha), chama `signup` action
- `(app)/layout.tsx` — layout protegido placeholder (só `{children}`, sem sidebar)
- `(app)/prospeccao/page.tsx` — Server Component, chama `requireUser()` + `requireCompany()`, exibe `"Olá, {nome} — {nomeEmpresa}"`
- `middleware.ts` — protege rotas `(app)`, libera `(auth)` e `/api/auth`

#### Comandos ao final

```bash
npx drizzle-kit push    # cria as tabelas no Neon
npm run dev             # servidor rodando em localhost:3000
```

**Comportamento esperado:**

| Ação | Resultado |
|---|---|
| `GET /register` sem sessão | Exibe formulário de cadastro |
| Submit register (campos válidos) | Cria user + company + member → redireciona `/prospeccao` |
| Submit register (campos vazios) | Retorna erro inline, sem recarregar |
| `GET /login` sem sessão | Exibe formulário de login |
| Submit login (credenciais válidas) | Sessão criada → redireciona `/prospeccao` |
| Submit login (credenciais inválidas) | Erro inline |
| `GET /prospeccao` sem sessão | Redireciona `/login` |
| `GET /prospeccao` com sessão | Exibe `"Olá, {nome} — {nomeEmpresa}"` |

**Dependências:**

```bash
npx create-next-app@latest prospflow --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd prospflow

npm install drizzle-orm pg better-auth bcryptjs zod
npm install -D drizzle-kit @types/pg @types/bcryptjs

npx shadcn@latest init
npx shadcn@latest add button input label card
```

**Variáveis de ambiente (.env.local):**

```env
DATABASE_URL=postgresql://user:pass@ep-xxxx.neon.tech/neondb?sslmode=require
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=gerado_com_npx_better-auth_secret
```

**Notas para o agente:**

- `usersTable.id` é `text` (Better Auth). `companiesTable.id` é `uuid`. Nunca referenciar com tipo errado.
- `companiesTable.ownerId` referencia `usersTable.id` → tipo `text`, não uuid.
- Usar `db.transaction()` no `DrizzleCompanyRepository.create()` para garantir atomicidade.
- O `companyMembersTable` deve ser inserido na mesma transação com `role: "owner"`.
- O `DrizzleCompanyRepository` recebe `db` por injeção no construtor — não importa `db` diretamente.
- A action `signup.ts` instancia `DrizzleCompanyRepository` e passa para `CreateUserWithCompany`. Esse é o único lugar onde a implementação concreta é escolhida.
- Consulte `/docs/setup-next16-better-auth-neon.md` para todos os detalhes de configuração.

---

### 🔜 FASE 2 — Módulo de Prospecção (não executar ainda)

**Objetivo:** CRUD de nichos, campanhas com execução real via Overpass API, visualização de leads com mapa e sheet de detalhes com IA.

**Tabelas adicionadas ao schema:** `prospectingNichesTable`, `prospectingCampaignsTable`, `prospectingLeadsTable`

**Contratos a criar em `domain/repositories/`:** `INicheRepository`, `ICampaignRepository`, `ILeadRepository`, `IGeoService`, `IAIService`

**Implementações em `infrastructure/`:**
- `DrizzleNicheRepository`, `DrizzleCampaignRepository`, `DrizzleLeadRepository`
- `OverpassGeoService` (implementa `IGeoService`)
- `CloudflareAIService` (implementa `IAIService`)

**Use cases:** `CreateNiche`, `UpdateNiche`, `DeleteNiche`, `CreateCampaign`, `RunCampaign` (orquestra Overpass + score + persist), `UpdateLeadStatus`, `GenerateDiagnosis`, `GenerateMessage`

**UI:** AppLayout completo com sidebar, Dashboard, Nichos, Campanhas, DetalheCampanha, Leads

Ver DOC correspondente para cada página: props, estados, componentes e dados.

**Dependências adicionais:**
```bash
npm install leaflet react-leaflet @types/leaflet
npm install react-hook-form @hookform/resolvers
npm install sonner date-fns lucide-react
npx shadcn@latest add dialog alert-dialog sheet table select slider switch checkbox textarea tabs badge avatar
```

**Variáveis de ambiente adicionais:**
```env
CLOUDFLARE_ACCOUNT_ID=seu_account_id
CLOUDFLARE_AI_TOKEN=seu_token
```

---

### 🔜 FASE 3 — Funil Comercial (não executar ainda)

**Objetivo:** Kanban CRM com drag & drop, sheet de detalhes e histórico de atividades.

**Tabelas adicionadas:** `funnelStagesTable`, `crmLeadsTable`, `leadActivitiesTable`

**Contratos a criar:** `IFunnelStageRepository`, `ICrmLeadRepository`, `ILeadActivityRepository`

**Use cases:** `SeedFunnelStages` (8 etapas padrão para nova empresa), `CreateCrmLead`, `MoveLead` (muda stage + registra `LeadActivity`), `UpdateCrmLead`, `ConvertProspectingLead`

**UI:** Kanban com @dnd-kit, LeadDrawer com abas Dados/Histórico, modal de novo lead

Ver `DOC_Funil.md` para componentes, props e estados completos.

**Dependências adicionais:**
```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

---

### 🔜 FASE 4 — Polish e produção (não executar ainda)

**Objetivo:** Preparar para deploy real.

**Escopo:**
- Seletor de empresa (troca cookie `active_company_id`)
- `SeedFunnelStages` disparado automaticamente no primeiro login de uma empresa nova
- `generateMetadata()` em todas as páginas
- `error.tsx` e `not-found.tsx` globais
- Middleware com validação real de sessão (não só presença de cookie)
- Rate limiting nas server actions que chamam Cloudflare AI
- Convite de membros por email (Better Auth + email provider)

---

## Convenções de código

| Regra | Descrição |
|---|---|
| Exports do schema | Sempre com sufixo `Table` (ex: `nichesTable`, `crmLeadsTable`) |
| Server Actions | `"use server"` no topo, ficam em `src/app/actions/[feature]/nome.ts` |
| Actions são controllers | Só: `requireUser()` → `requireCompany()` → instanciar repositório → instanciar use case → chamar → retornar |
| Lógica de negócio | Sempre em `src/use-cases/`, nunca em actions ou repositories |
| Repositórios | Recebem `db` por injeção no construtor. Nunca importam `db` globalmente. |
| Componentes client | `"use client"` em formulários, modais, mapas, DnD e qualquer hook de estado |
| Componentes server | Padrão — só colocar `"use client"` quando necessário |
| Leaflet / DnD | `dynamic(() => import(...), { ssr: false })` obrigatório |
| Formatação | `formatBRL()`, `LEAD_STATUS_LABEL`, `CAMPAIGN_STATUS_LABEL` em `src/lib/format.ts` |
| Tenant guard | Toda action e todo use case recebem `companyId` explicitamente — nunca assume contexto global |

---

## Referências rápidas

| Precisa de | Onde está |
|---|---|
| Pool Drizzle + SSL Neon | `/docs/setup-next16-better-auth-neon.md` § 4 |
| Schema base Better Auth | `/docs/setup-next16-better-auth-neon.md` § 5 |
| Configuração `auth.ts` | `/docs/setup-next16-better-auth-neon.md` § 6 |
| `requireUser` + `requireCompany` | `/docs/setup-next16-better-auth-neon.md` § 9 |
| Exemplos login/register | `/docs/setup-next16-better-auth-neon.md` § 10 |
| Middleware de proteção | `/docs/setup-next16-better-auth-neon.md` § 11 |
| Layout e sidebar | `/docs/DOC_AppLayout.md` |
| Props e estados de cada página | `/docs/DOC_[NomeDaPagina].md` |
| Referência visual de UI | `/docs/ui-lovable/` |

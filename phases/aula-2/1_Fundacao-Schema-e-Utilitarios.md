# Aula 2 — 1. Fundação: Dependências, Schema e Utilitários

> Parte de `aula-2`. Pré-requisito: `0_Conceitos-e-Mapa-de-Arquivos.md`. Próximo arquivo: `2_Nichos.md`.
>
> Este arquivo cobre o que é compartilhado por todas as features da Fase 2 (Nichos, Campanhas, Leads): dependências, schema do banco, o serviço de IA (usado tanto por Campanhas quanto por Leads) e os utilitários de formatação. Os arquivos seguintes (`2_Nichos.md`, `3_Campanhas.md`, `4_Leads.md`) partem daqui.

## Task 1: Dependências e componentes shadcn

- [ ] **Step 1: Instalar pacotes npm**

```bash
npm install leaflet react-leaflet date-fns sonner
npm install -D @types/leaflet
```

- [ ] **Step 2: Adicionar componentes shadcn**

```bash
npx shadcn@latest add dialog alert-dialog sheet table select slider switch checkbox textarea tabs badge avatar
```

Responder "Yes" para qualquer prompt de sobrescrita.

- [ ] **Step 3: Adicionar `<Toaster />` ao root layout**

`sonner` não estava instalado na Fase 1 (ver `aula-1/7_UI-Paginas-Auth.md`) — só entra agora, junto com as primeiras ações desta fase que disparam toasts de sucesso/erro (criar nicho, executar campanha, etc). Em `src/app/layout.tsx`, adicione o import e o componente:

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

## IA compartilhada — `IAIService` e `CloudflareAIService`

> Usado tanto por `RunCampaign` (geração de tags OSM, ver `3_Campanhas.md`) quanto pelos use-cases de diagnóstico/mensagem de leads (ver `4_Leads.md`) — por isso o contrato e a implementação ficam na fundação compartilhada, não em um arquivo de feature só.

- [ ] **Criar `src/domain/services/IAIService.ts`**

```typescript
export interface IAIService {
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}
```

- [ ] **Criar `src/infrastructure/services/CloudflareAIService.ts`**

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


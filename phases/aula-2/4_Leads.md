# Aula 2 — 4. Leads

> Parte de `aula-2`. Pré-requisito: `3_Campanhas.md`. Próximo arquivo: `5_Dashboard-e-Layout.md`.
>
> Fluxo completo da funcionalidade de Leads: domínio, infraestrutura, use-cases (diagnóstico e mensagem via `IAIService` compartilhado — ver `1_Fundacao-Schema-e-Utilitarios.md`), Server Actions, mapa e UI.

---

## Domínio — `ILeadRepository`

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

---

## Domínio — regra de "lead qualificado"

- [ ] **Step 2b: Criar `src/domain/lead-qualification.ts`**

> A partir de qual score um lead é "qualificado" é uma **regra de negócio**, não um detalhe de banco. Em vez de repetir o número `70` no SQL do repositório, no label do dashboard e nas telas, definimos uma única fonte da verdade no domínio. O repositório (infra) pode importar do domínio — a seta de dependência aponta para dentro.

```typescript
// Regra de negócio de domínio: a partir de qual score (0–100) um lead é "qualificado".
export const QUALIFIED_SCORE_THRESHOLD = 70;

export function isQualifiedLead(score: number): boolean {
  return score >= QUALIFIED_SCORE_THRESHOLD;
}
```

---

## Infraestrutura — `DrizzleLeadRepository`

- [ ] **Step 3: Criar `src/infrastructure/repositories/DrizzleLeadRepository.ts`**

```typescript
import { and, eq, gte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { QUALIFIED_SCORE_THRESHOLD } from "@/domain/lead-qualification";
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
        qualified: sql<number>`count(*) filter (where score >= ${QUALIFIED_SCORE_THRESHOLD})::int`,
      })
      .from(prospectingLeadsTable)
      .where(eq(prospectingLeadsTable.companyId, companyId));
    return row ?? { total: 0, qualified: 0 };
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

## Server Actions

- [ ] **Step 6: Criar `src/app/actions/leads/update-lead-status.ts`**

```typescript
"use server";

import type { LeadStatus } from "@/domain/repositories/ILeadRepository";
import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { UpdateLeadStatus } from "@/use-cases/leads/UpdateLeadStatus";

export async function updateLeadStatusAction(leadId: string, status: LeadStatus) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);
  const repo = new DrizzleLeadRepository(db);
  const useCase = new UpdateLeadStatus(repo);
  return useCase.execute({ leadId, companyId, status });
}
```

`LeadStatus` já é exportado por `ILeadRepository.ts` (o mesmo union type usado no enum do schema) — reaproveitamos o tipo em vez de redeclarar um array `as const` local.

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

> A leitura inicial dos leads **não** tem Server Action própria: o Data Loader da página (`leads/page.tsx`, mais abaixo) lê direto dos repositórios no servidor. As Server Actions de leads são só de **escrita/IA** (`update-lead-status`, `generate-diagnosis`, `generate-message`).

---

## Mapa — `LeadsMap.tsx`

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


---

## Task 17: Leads — `src/app/(protected)/prospeccao/leads/page.tsx`

> Segue o padrão thin-page + Suspense + Data Loader lendo direto + `_components/`. Como o Client Component já renderiza seu próprio cabeçalho (título + contador + toggle Lista/Mapa), o `BasePageLayout` é usado sem `title`.

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/leads/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
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
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const leadRepo = new DrizzleLeadRepository(db);
  const campaignRepo = new DrizzleCampaignRepository(db);

  const [leads, campaigns] = await Promise.all([
    leadRepo.findAllByCompany(companyId),
    campaignRepo.findAllByCompany(companyId),
  ]);

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
      updateLeadStatusAction(selected.id, "whatsapp_opened")
        .then((r) => {
          if (r.ok) updateLead(selected.id, { status: "whatsapp_opened" });
        })
        .catch(() => toast.error("Não foi possível atualizar o status do lead"));
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
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
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
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
          <LeadsMap leads={filtered} onSelect={(lead) => setSelected(lead)} height={560} />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
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
                      onClick={() => { setSelected(lead); setGeneratedMessage(""); }}
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

# Aula 2 — 3. Campanhas

> Parte de `aula-2`. Pré-requisito: `2_Nichos.md`. Próximo arquivo: `4_Leads.md`.
>
> Fluxo completo da funcionalidade de Campanhas: domínio, infraestrutura (incluindo a integração com a Overpass API), use-cases (`RunCampaign`, que também usa o `IAIService` compartilhado — ver `1_Fundacao-Schema-e-Utilitarios.md`), Server Actions e UI (lista + detalhe + mapa).

---

## Domínio — `ICampaignRepository` e `IGeoService`

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

---

## Infraestrutura — `DrizzleCampaignRepository` e `OverpassGeoService`

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
      // Fallback por nome: só ativo quando a IA não gerou tags (evita scan de todos os nomes da área)
      const nameRegex = keywords.join("|");
      lines.push(`  node["name"~"${nameRegex}",i](${around});`);
      lines.push(`  way["name"~"${nameRegex}",i](${around});`);
    }

    // `tags center qt`: apenas tags + centro de ways (sem coordenadas de membros) + sem ordenação
    // Muito mais leve que `body center` para respostas com muitos ways
    lines.push(");", "out tags center qt 200;");
    const query = lines.join("\n");

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

      // Limite aplicado aqui, depois de filtrar por nome
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

---

## Task 8: Use Cases — Campanhas

- [ ] **Step 1: Criar `src/use-cases/campanhas/CreateCampaign.ts`**

```typescript
import type {
  Campaign,
  CreateCampaignData,
  ICampaignRepository,
} from "@/domain/repositories/ICampaignRepository";

type Result = { ok: true; data: Campaign } | { ok: false; error: string };

export class CreateCampaign {
  constructor(private campaignRepo: ICampaignRepository) {}

  async execute(input: CreateCampaignData): Promise<Result> {
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
>
> O prompt do sistema (`OSM_TAG_SYSTEM_PROMPT`) instrui a IA a retornar APENAS JSON com as 6 chaves — sem texto extra. Os exemplos embutidos no prompt cobrem os casos mais comuns do Brasil (restaurante, mecânica, academia, advocacia, salão).

```typescript
import type { ICampaignRepository } from "@/domain/repositories/ICampaignRepository";
import type { IAIService } from "@/domain/services/IAIService";
import type { IGeoService, OsmTags } from "@/domain/services/IGeoService";
import type { ILeadRepository } from "@/domain/repositories/ILeadRepository";
import type { INicheRepository } from "@/domain/repositories/INicheRepository";

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

    // O status "running" já foi marcado pela action (runCampaignAction) antes do after(),
    // para o cliente ver imediatamente via polling. Aqui só cuidamos de completed/failed.
    try {
      // IA lê o nome + descrição do nicho e gera as tags OSM adequadas.
      // Não é necessário preencher keywords manualmente — o nome do nicho já é suficiente.
      // additionalKeywords da campanha são usados como fallback por nome (busca textual).
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

      // keywords manuais do nicho + campanha como fallback de busca por nome
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

## Server Actions

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

**Polling no cliente (`CampanhasContent.tsx` e `CampanhaDetailContent.tsx`, ver Tasks 15 e 16):** enquanto uma campanha está `running`, o Client Component chama uma Server Action de **leitura** a cada 3s — este é o caso em que a leitura parte do browser (o navegador não fala com o banco), então precisa de uma Server Action (não é a carga inicial, que roda direto no Server Component):

```typescript
// Ativa enquanto qualquer campanha estiver com status "running"
useEffect(() => {
  const hasRunning = campaigns.some((c) => c.status === "running");
  if (!hasRunning) return;

  const timer = setInterval(async () => {
    const fresh = await listCampaignsAction();
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

- [ ] **Step 10: Criar `src/app/actions/campanhas/list-campaigns.ts`**

> Leitura de campanhas **disparada pelo client** (polling). A carga inicial da página não usa esta action — o Server Component lê direto (Task 15). Esta existe só porque o polling parte do browser.

```typescript
"use server";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";

export async function listCampaignsAction(): Promise<Campaign[]> {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  return campaignRepo.findAllByCompany(companyId);
}
```

- [ ] **Step 11: Criar `src/app/actions/campanhas/get-campaign-detail.ts`**

> Mesmo caso: leitura do detalhe **disparada pelo client** (polling na página de detalhe). Retorna o par campanha + leads no shape `{ ok, data }`.

```typescript
"use server";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Lead } from "@/domain/repositories/ILeadRepository";
import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";

type Result = { ok: true; data: { campaign: Campaign; leads: Lead[] } } | { ok: false };

export async function getCampaignDetailAction(campaignId: string): Promise<Result> {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const campaign = await campaignRepo.findById(campaignId, companyId);
  if (!campaign) return { ok: false };

  const leadRepo = new DrizzleLeadRepository(db);
  const leads = await leadRepo.findByCampaign(campaignId, companyId);

  return { ok: true, data: { campaign, leads } };
}
```

- [ ] **Step 12: Criar `src/app/actions/campanhas/resolve-cep.ts`**

> Geocodificação do CEP **no servidor**. O formulário de campanha só pede o CEP; o servidor consulta o ViaCEP (cidade/UF) e o Nominatim (lat/lon). Antes essas duas chamadas eram `fetch()` no browser — trazê-las para uma Server Action tira as APIs externas do cliente e permite **validar a resposta externa com Zod** (JSON de terceiro nunca é confiável). Exige sessão: geocodificar não deve ser um endpoint público aberto.

```typescript
"use server";

import { z } from "zod";

import { requireCompany, requireUser } from "@/lib/tenant";

const cepSchema = z
  .string()
  .transform((s) => s.replace(/\D/g, ""))
  .refine((s) => s.length === 8, "CEP deve ter 8 dígitos");

const viacepSchema = z.object({
  localidade: z.string().optional(),
  uf: z.string().optional(),
  logradouro: z.string().optional(),
  erro: z.boolean().optional(),
});

const nominatimSchema = z.array(z.object({ lat: z.string(), lon: z.string() }));

type CepData = { city: string; state: string; street: string; latitude: number; longitude: number };
type Result = { ok: true; data: CepData } | { ok: false; error: string };

export async function resolveCepAction(cep: string): Promise<Result> {
  const user = await requireUser();
  await requireCompany(user.id);

  const parsed = cepSchema.safeParse(cep);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const digits = parsed.data;

  try {
    const viacepRes = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
    const viacep = viacepSchema.parse(await viacepRes.json());
    if (viacep.erro || !viacep.localidade || !viacep.uf) {
      return { ok: false, error: "CEP não encontrado" };
    }

    const city = viacep.localidade;
    const state = viacep.uf;
    const street = viacep.logradouro ?? "";

    const query = encodeURIComponent(`${street || city}, ${city}, ${state}, Brazil`);
    const nominatimRes = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`,
      { headers: { "Accept-Language": "pt-BR", "User-Agent": "ProspFlow/1.0" } }
    );
    const nominatim = nominatimSchema.parse(await nominatimRes.json());
    const first = nominatim[0];

    return {
      ok: true,
      data: {
        city,
        state,
        street,
        latitude: first ? parseFloat(first.lat) : 0,
        longitude: first ? parseFloat(first.lon) : 0,
      },
    };
  } catch {
    return { ok: false, error: "Erro ao buscar CEP" };
  }
}
```


---

## Task 15: Campanhas — `src/app/(protected)/prospeccao/campanhas/page.tsx`

> Segue o padrão thin-page + Suspense + Data Loader lendo direto + `_components/`.

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/campanhas/page.tsx`**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
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
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);

  const [campaigns, niches] = await Promise.all([
    campaignRepo.findAllByCompany(companyId),
    nicheRepo.findAllByCompany(companyId),
  ]);

  return <CampanhasContent initialCampaigns={campaigns} initialNiches={niches} />;
}
```

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/campanhas/_components/CampanhasContent.tsx`**

> **Polling via Server Action:** enquanto alguma campanha está `running` (a busca roda em background via `after()`), o Client Component chama `listCampaignsAction()` a cada 3s. É leitura disparada pelo browser, então passa por uma Server Action — diferente da carga inicial, que roda direto no Server Component.

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Loader2, MapPin, Play, Plus } from "lucide-react";
import { toast } from "sonner";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Niche } from "@/domain/repositories/INicheRepository";
import { createCampaignAction } from "@/app/actions/campanhas/create-campaign";
import { listCampaignsAction } from "@/app/actions/campanhas/list-campaigns";
import { resolveCepAction } from "@/app/actions/campanhas/resolve-cep";
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
      const fresh = await listCampaignsAction();
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
    // Geocodificação roda no servidor (resolveCepAction): ViaCEP + Nominatim ficam
    // fora do browser, e a resposta externa já chega validada por Zod.
    const result = await resolveCepAction(digits);
    setCepLoading(false);
    if (!result.ok) {
      setCepError(result.error);
      return;
    }
    const { city, state, latitude, longitude } = result.data;
    setForm((f) => ({ ...f, city, state, latitude, longitude }));
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
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card shadow-sm">
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
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors hover:bg-accent hover:text-foreground"
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

---

## Task 16: Detalhe Campanha — `src/app/(protected)/prospeccao/campanhas/[id]/page.tsx`

> Segue o padrão thin-page + Suspense + bootstrap action + `_components/`. Como o Client Component já renderiza seu próprio cabeçalho rico (nome + badge + botão "Executar busca"), o `BasePageLayout` é usado **sem** `title` aqui.

- [ ] **Step 1: Criar `src/app/(protected)/prospeccao/campanhas/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
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
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  const campaign = await campaignRepo.findById(campaignId, companyId);
  if (!campaign) redirect("/prospeccao/campanhas");

  const nicheRepo = new DrizzleNicheRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);

  const [niche, leads] = await Promise.all([
    nicheRepo.findById(campaign.nicheId, companyId),
    leadRepo.findByCampaign(campaignId, companyId),
  ]);

  return (
    <CampanhaDetailContent
      initialCampaign={campaign}
      initialNiche={niche}
      initialLeads={leads}
    />
  );
}
```

**Por que `redirect()` no servidor:** a checagem de tenant (`campaignRepo.findById(campaignId, companyId)` retornando `null`) acontece no próprio Server Component, então o redirecionamento é feito no servidor, antes de qualquer HTML chegar ao client.

- [ ] **Step 2: Criar `src/app/(protected)/prospeccao/campanhas/[id]/_components/CampanhaDetailContent.tsx`**

> **Polling via Server Action:** o `useEffect` de polling chama `getCampaignDetailAction(campaign.id)` (leitura disparada pelo client), em vez de `fetch("/api/campanhas/${id}")`.

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
import { getCampaignDetailAction } from "@/app/actions/campanhas/get-campaign-detail";
import { runCampaignAction } from "@/app/actions/campanhas/run-campaign";
import { isQualifiedLead } from "@/domain/lead-qualification";
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
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
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
      const result = await getCampaignDetailAction(campaign.id);
      if (!result.ok) return;
      const fresh = result.data.campaign;
      if (fresh.status === "completed") {
        clearInterval(timer);
        setCampaign(fresh);
        setLeads(result.data.leads);
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

  const qualified = leads.filter((l) => isQualifiedLead(l.score)).length;
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
            "inline-flex h-8 w-8 items-center justify-center rounded-lg border-transparent text-sm font-medium transition-colors hover:bg-accent hover:text-foreground"
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
      <div className="mb-6 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
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
        <div className="overflow-hidden rounded-xl border border-border/60 shadow-sm">
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
            className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-colors hover:bg-accent hover:text-foreground"
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

---

## Mapa — `CampaignMap.tsx`

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
      style={{ height: 560, width: "100%", borderRadius: "0.5rem" }}
    />
  );
}
```

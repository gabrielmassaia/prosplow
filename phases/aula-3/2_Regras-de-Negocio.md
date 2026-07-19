# Aula 3 — 2. Regras de Negócio: Use Cases e Server Actions

> Parte de `aula-3`. Pré-requisito: `1_Fundacao-Schema-Domain-Infra.md`. Próximo arquivo: `3_Interface-Kanban.md`.

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

- [x] **Criar `src/use-cases/funil/ConvertProspectingLead.ts`** — concentra **toda** a regra de conversão: checa duplicidade via `findByProspectingLeadId` (idempotência), carrega o `ProspectingLead`, **garante o seed do funil e escolhe a etapa de entrada** (primeira `kind: "normal"` por posição), resolve o nome do nicho, cria o `CrmLead` (`origin: "prospecting"`) e registra a atividade `"Lead convertido da prospecção"`. A action fica só com a fiação de dependências.

> **Por que a escolha da etapa vive no use case e não na action?** "Em qual etapa um lead convertido entra" é uma **regra de negócio** — se amanhã a regra virar "entra na etapa de Triagem" ou "na última usada", quem muda é o domínio, não o controller. A action continua fina (guard → instanciar → chamar). Por isso o use case recebe também `stageRepo` e `nicheRepo` e compõe o `SeedFunnelStages` internamente.

```typescript
import type { CrmLead, ICrmLeadRepository } from "@/domain/repositories/ICrmLeadRepository";
import type { IFunnelStageRepository } from "@/domain/repositories/IFunnelStageRepository";
import type { ILeadActivityRepository } from "@/domain/repositories/ILeadActivityRepository";
import type { ILeadRepository } from "@/domain/repositories/ILeadRepository";
import type { INicheRepository } from "@/domain/repositories/INicheRepository";
import { SeedFunnelStages } from "@/use-cases/funil/SeedFunnelStages";

type Input = {
  prospectingLeadId: string;
  companyId: string;
  userId: string;
};
type Result = { ok: true; data: CrmLead } | { ok: false; error: string };

export class ConvertProspectingLead {
  constructor(
    private crmLeadRepo: ICrmLeadRepository,
    private leadRepo: ILeadRepository,
    private leadActivityRepo: ILeadActivityRepository,
    private stageRepo: IFunnelStageRepository,
    private nicheRepo: INicheRepository
  ) {}

  async execute({ prospectingLeadId, companyId, userId }: Input): Promise<Result> {
    try {
      const already = await this.crmLeadRepo.findByProspectingLeadId(prospectingLeadId, companyId);
      if (already) return { ok: false, error: "Lead já convertido" };

      const prospectingLead = await this.leadRepo.findById(prospectingLeadId, companyId);
      if (!prospectingLead) return { ok: false, error: "Lead de prospecção não encontrado" };

      // Regra de negócio: garante que as etapas existem e escolhe a etapa de entrada —
      // a primeira "normal" por posição (fallback: a primeira de todas).
      const seed = await new SeedFunnelStages(this.stageRepo).execute({ companyId });
      const stages = seed.ok ? seed.data : await this.stageRepo.findAllByCompany(companyId);
      const targetStage =
        stages.filter((s) => s.kind === "normal").sort((a, b) => a.position - b.position)[0] ??
        stages.slice().sort((a, b) => a.position - b.position)[0];
      if (!targetStage) return { ok: false, error: "Nenhuma etapa de funil disponível" };

      const niche = await this.nicheRepo.findById(prospectingLead.nicheId, companyId);

      const crmLead = await this.crmLeadRepo.create({
        companyId,
        prospectingLeadId: prospectingLead.id,
        stageId: targetStage.id,
        name: prospectingLead.name,
        phone: prospectingLead.phone,
        email: prospectingLead.email,
        niche: niche?.name ?? null,
        subniche: null,
        origin: "prospecting",
        value: null,
        notes: null,
      });

      await this.leadActivityRepo.create({
        companyId,
        leadId: crmLead.id,
        fromStageId: null,
        toStageId: targetStage.id,
        description: "Lead convertido da prospecção",
        createdBy: userId,
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

> A leitura inicial do funil **não** tem Server Action de bootstrap: como acontece no servidor, o Data Loader da página (`funil/page.tsx`, ver `3_Interface-Kanban.md`) roda o seed lazy e lê etapas + leads direto dos repositórios. O código do Data Loader:

```tsx
async function FunilDataLoader() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const stageRepo = new DrizzleFunnelStageRepository(db);
  const crmLeadRepo = new DrizzleCrmLeadRepository(db);

  // Seed lazy: garante as etapas padrão na primeira visita de uma empresa nova.
  const seedResult = await new SeedFunnelStages(stageRepo).execute({ companyId });
  const stages = seedResult.ok ? seedResult.data : await stageRepo.findAllByCompany(companyId);
  const leads = await crmLeadRepo.findAllByCompany(companyId);

  return <FunilContent initialStages={stages} initialLeads={leads} />;
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

- [x] **Criar `src/app/actions/leads/convert-prospecting-lead.ts`** — controller fino: só instancia os repositórios, monta o `ConvertProspectingLead` e chama. Toda a regra (seed lazy, escolha da etapa de entrada, resolução do nicho) mora no use case.

```typescript
"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCrmLeadRepository } from "@/infrastructure/repositories/DrizzleCrmLeadRepository";
import { DrizzleFunnelStageRepository } from "@/infrastructure/repositories/DrizzleFunnelStageRepository";
import { DrizzleLeadActivityRepository } from "@/infrastructure/repositories/DrizzleLeadActivityRepository";
import { DrizzleLeadRepository } from "@/infrastructure/repositories/DrizzleLeadRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";
import { ConvertProspectingLead } from "@/use-cases/funil/ConvertProspectingLead";

export async function convertProspectingLeadAction(prospectingLeadId: string) {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const crmLeadRepo = new DrizzleCrmLeadRepository(db);
  const leadRepo = new DrizzleLeadRepository(db);
  const nicheRepo = new DrizzleNicheRepository(db);
  const stageRepo = new DrizzleFunnelStageRepository(db);
  const leadActivityRepo = new DrizzleLeadActivityRepository(db);

  const useCase = new ConvertProspectingLead(
    crmLeadRepo,
    leadRepo,
    leadActivityRepo,
    stageRepo,
    nicheRepo
  );
  return useCase.execute({ prospectingLeadId, companyId, userId: user.id });
}
```

- [x] **Modificar `src/app/(protected)/prospeccao/leads/page.tsx`** — o Data Loader da página de Leads (que lê direto no Server Component, ver aula-2) passa a carregar também os `convertedProspectingLeadIds` via `DrizzleCrmLeadRepository.findConvertedProspectingLeadIds`, usados pela UI para esconder/desabilitar o botão de conversão em leads já convertidos. Não há Server Action de bootstrap — a leitura inicial é direta.

```tsx
async function LeadsDataLoader() {
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

  return (
    <LeadsContent
      initialLeads={leads}
      initialCampaigns={campaigns}
      initialConvertedProspectingLeadIds={convertedProspectingLeadIds}
    />
  );
}
```

---

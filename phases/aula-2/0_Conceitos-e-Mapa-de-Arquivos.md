# Aula 2 — Módulo de Prospecção: Nichos, Campanhas, Leads e IA

> **Para agentes:** Use superpowers:subagent-driven-development ou superpowers:executing-plans para executar tarefa a tarefa. Steps usam checkbox (`- [ ]`) para rastreamento.
>
> **Regra:** NUNCA fazer `git commit` automaticamente. O desenvolvedor commita manualmente.

**Objetivo:** CRUD de nichos, campanhas de busca georreferenciada via Overpass API, visualização de leads com mapa Leaflet e sheet de detalhes com diagnóstico e mensagem gerados por Cloudflare AI.

**Arquitetura:** Clean Architecture pragmático. Schema → Domain (interfaces) → Infrastructure (Drizzle + services externos) → Use Cases (lógica de negócio) → Actions (controllers finos) → UI (Server e Client Components).

**Tech Stack adicionado:** `leaflet`, `react-leaflet`, `sonner`, `date-fns`. shadcn/ui: `dialog`, `alert-dialog`, `sheet`, `table`, `select`, `slider`, `switch`, `checkbox`, `textarea`, `tabs`, `badge`, `avatar`. (Os formulários desta fase são `<form>` nativo + `FormData` + `useState` — não usamos `react-hook-form`.)

---

## Roteiro desta pasta

| Arquivo | O que constrói |
|---|---|
| `1_Fundacao-Schema-e-Utilitarios.md` | Dependências, schema (3 tabelas + 3 enums), serviço de IA compartilhado, `format.ts` |
| `2_Nichos.md` | Fluxo completo de Nichos: domain, infra, use-cases, actions e UI |
| `3_Campanhas.md` | Fluxo completo de Campanhas: domain, infra (+ Overpass), use-cases (`RunCampaign`), actions e UI (+ mapa) |
| `4_Leads.md` | Fluxo completo de Leads: domain, infra, use-cases (diagnóstico/mensagem IA), actions e UI (+ mapa) |
| `5_Dashboard-e-Layout.md` | Componentes compartilhados de layout, Sidebar, Dashboard |
| `6_Verificacao-e-Armadilhas.md` | Checklist final, armadilhas da fase, próximos passos |

## Constraints globais

- Toda action começa com `requireUser()` → `requireCompany(user.id)`
- Toda query filtra por `companyId` — sem exceção
- Retorno de actions: `{ ok: true, data? } | { ok: false, error: string }`
- Repositórios recebem `db` no construtor, nunca importam globalmente
- `domain/` não importa nada externo (sem Drizzle, sem Next.js)
- Leaflet/DnD: sempre `dynamic(() => import(...), { ssr: false })`
- Rota protegida usa `src/app/(protected)/` (não `(app)/` como no SPEC)
- Modelo Cloudflare AI vem de `process.env.CLOUDFLARE_AI_MODEL`

---

## Conceitos que você precisa entender antes de codar

### Server Component lendo direto vs Client Component buscando via API

Toda página de listagem desta fase (nichos, campanhas, detalhe da campanha, leads) segue o mesmo formato. A chave: **a carga inicial é lida direto do repositório, dentro do Server Component** — sem Server Action e sem rota HTTP no meio.

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

`page.tsx` é sempre um **Server Component enxuto**: `generateMetadata` + `BasePageLayout` (layout compartilhado) + `Suspense` com skeleton (`LoadingContent`) + uma função `async` interna (o "Data Loader"). O Data Loader **instancia o repositório e consulta o banco diretamente** — ele já roda no servidor, então não há motivo para embrulhar essa leitura numa Server Action. O resultado vai como prop (`initial*`) para um **Client Component** em `_components/` dentro da própria rota (ex: `nichos/_components/NichosContent.tsx`), que concentra a interatividade (formulários, dialogs, filtros, mutações).

> **Regra de ouro leitura × escrita:** leitura que acontece **no servidor** (a carga inicial da página) é feita **direto no Server Component**. Server Action é para **escrita** (mutações) e para **leitura disparada pelo cliente** (o polling, mais abaixo). Uma Server Action é, por baixo, um `POST` — usá-la para a carga inicial só adiciona um round-trip HTTP inútil, sem ganho de cache.

**Por que não um Client Component com `useEffect(() => fetch("/api/nichos"))`?** É a alternativa óbvia para quem vem de React puro (SPA), e funciona — mas custa três coisas:

| | Server Component lendo direto | Client Component + rota GET |
|---|---|---|
| Onde roda a query no banco | No servidor, antes do HTML ser enviado | No servidor também, mas atrás de uma rota HTTP extra |
| Tela em branco / spinner inicial | Não precisa — `Suspense` mostra o skeleton só enquanto o Data Loader resolve, e o conteúdo real já chega pronto | Sempre existe um primeiro render vazio até o `useEffect` responder |
| Onde fica o guard de tenant (`requireUser`/`requireCompany`) | Uma vez, no próprio Data Loader | Duplicado: uma vez na rota GET, outra nas Server Actions de mutação |
| Superfície exposta | Nenhuma rota HTTP nova | Uma rota `route.ts` por recurso, mesmo sem nenhum consumidor externo |

A rota GET só faria sentido se algo **fora** do Next.js (um app mobile, um webhook, outro serviço) precisasse consumir os mesmos dados como API pública. Não é o caso aqui — é a própria página React consumindo.

**Leitura disparada pelo cliente (polling) — aí sim uma Server Action.** Campanhas e o detalhe da campanha rodam a busca em background (via `after()`, ver `3_Campanhas.md`) e o Client Component faz *polling* do status enquanto ela não termina. O navegador **não fala com o banco** — então esse polling chama uma Server Action dedicada de leitura (`listCampaignsAction`, `getCampaignDetailAction`). É o espelho da carga inicial: como o gatilho parte do browser, precisa existir um endpoint no servidor, e a Server Action é exatamente isso (sem precisar de uma rota REST `route.ts`). Resumo: **read no servidor → direto; read a partir do client → Server Action.**

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
| `src/app/actions/campanhas/resolve-cep.ts` | Criar | Server Action: geocodifica o CEP (ViaCEP + Nominatim) no servidor, valida com Zod |
| `src/app/actions/campanhas/list-campaigns.ts` | Criar | Server Action: leitura de campanhas disparada pelo client (polling) |
| `src/app/actions/campanhas/get-campaign-detail.ts` | Criar | Server Action: leitura do detalhe da campanha disparada pelo client (polling) |
| `src/domain/lead-qualification.ts` | Criar | Regra de domínio: `QUALIFIED_SCORE_THRESHOLD` + `isQualifiedLead` |
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

# Aula 3 — Funil Comercial (Kanban CRM)

> Parte de `aula-3`. Este é o índice de leitura da Aula 3.

---

## Roteiro desta pasta

| Arquivo | O que constrói |
|---|---|
| `1_Fundacao-Schema-Domain-Infra.md` | Dependências, schema (2 enums + 3 tabelas), interfaces de domínio, repositórios Drizzle, `format.ts` |
| `2_Regras-de-Negocio.md` | Use-cases e Server Actions do funil |
| `3_Interface-Kanban.md` | Página do funil e `FunilContent.tsx` — o kanban com drag-and-drop completo |
| `4_Integracao-com-Prospeccao.md` | Botão "Converter para CRM" em Leads, item de navegação na Sidebar |
| `5_Verificacao-e-Armadilhas.md` | Checklist final, armadilhas da fase, próximos passos |

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
| `src/app/(protected)/funil/_components/FunilContentLoader.tsx` | Criar | Wrapper `"use client"` que faz o `dynamic(..., { ssr: false })` de `FunilContent` — obrigatório porque `page.tsx` é Server Component e o Next.js 16 não permite `ssr: false` fora de um Client Component |
| `src/app/(protected)/prospeccao/leads/_components/LeadsContent.tsx` | Modificar | Botão "Converter para CRM" no sheet de detalhe |
| `src/app/(protected)/prospeccao/leads/page.tsx` | Modificar | Repassar `convertedProspectingLeadIds` |
| `src/components/layout/Sidebar.tsx` | Modificar | Novo item de navegação "Funil" |

---

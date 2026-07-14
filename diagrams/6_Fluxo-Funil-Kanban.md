# Fluxo — Funil Comercial (Kanban)

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Fonte: `phases/aula-3/`, `docs/DOC_Funil.md`.

---

## O que este diagrama explica

A Aula 3 constrói um Kanban com drag & drop (`@dnd-kit`) sobre o pipeline comercial. Duas coisas acontecem quando um lead é arrastado: o `stage_id` muda, e uma `LeadActivity` é registrada como histórico. Este arquivo também mostra o bootstrap automático das etapas padrão para uma empresa nova.

---

## Diagrama 1 — Arrastar um card entre colunas (`MoveLead`)

```mermaid
sequenceDiagram
    participant UI as Kanban (client, @dnd-kit)
    participant Action as move-lead action
    participant UC as MoveLead (use-case)
    participant CrmRepo as DrizzleCrmLeadRepository
    participant ActRepo as DrizzleLeadActivityRepository
    participant DB as Neon Postgres

    UI->>UI: onDragEnd(leadId, fromStageId, toStageId)
    UI->>Action: moveLeadAction({ leadId, toStageId })
    Action->>UC: execute({ leadId, toStageId, companyId, userId })
    UC->>CrmRepo: findById(leadId, companyId)
    CrmRepo->>DB: SELECT crm_lead
    UC->>CrmRepo: updateStage(leadId, companyId, toStageId)
    CrmRepo->>DB: UPDATE crm_leads SET stage_id = ...
    UC->>ActRepo: create({ leadId, fromStageId, toStageId, createdBy: userId })
    ActRepo->>DB: INSERT INTO lead_activities
    UC-->>Action: { ok: true }
    Action-->>UI: atualiza posição do card (otimista ou revalidada)
```

---

## Diagrama 2 — Bootstrap das etapas padrão (`SeedFunnelStages`)

```mermaid
flowchart TD
    Login["Primeiro acesso ao /funil<br/>de uma empresa nova"] --> Check{"Empresa ja tem<br/>funnel_stages?"}
    Check -->|"sim"| Show["Exibe Kanban existente"]
    Check -->|"não"| Seed["SeedFunnelStages.execute(companyId)"]
    Seed --> Insert["INSERT das 8 etapas padrão<br/>(kind: normal/won/lost/triage)"]
    Insert --> Show

    style Seed fill:#312e81,color:#fff
```

---

## Como ler este diagrama

- **Duas escritas em uma ação do usuário:** mover um card não é só um `UPDATE` — é `UPDATE` (posição atual) + `INSERT` (histórico). Isso é o que permite a aba "Histórico" no `LeadDrawer` mostrar a jornada completa do lead pelo funil.
- **`fromStageId` pode ser nulo** — a primeira atividade de um lead criado direto em uma coluna (não arrastado) não tem "de onde veio".
- **O bootstrap hoje é lazy** (roda dentro de `getFunilBootstrapAction`, disparado quando a página `/funil` é acessada) — a Aula 4 (`1_Seed-Automatico-no-Cadastro.md`) move esse gatilho para o momento do cadastro/primeiro login, para que o Kanban já apareça populado sem depender do usuário abrir a página do funil primeiro.
- **`stageKind`** (`normal`, `won`, `lost`, `triage`) existe para a UI saber quais colunas são "estados finais" (won/lost) versus estágios normais do pipeline — relevante para métricas futuras de conversão.

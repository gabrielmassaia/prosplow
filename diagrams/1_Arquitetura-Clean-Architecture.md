# Arquitetura — Clean Architecture Pragmático

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Fonte: `CLAUDE.md` (seção "Arquitetura — regras inegociáveis") e `docs/SPEC.md`.

---

## O que este diagrama explica

O ProspFlow segue Clean Architecture pragmático: não é o "full enterprise" com entities isoladas, mas o suficiente para que trocar o banco ou o provider de IA não toque em lógica de negócio. A regra é simples de falar em voz alta na live: **as setas de dependência sempre apontam para dentro**. `app` depende de `use-cases`, que depende de `domain`. `infrastructure` implementa `domain`. Nunca o inverso.

---

## Diagrama 1 — As camadas e a regra de dependência

```mermaid
flowchart TB
    subgraph APP["app/ — Next.js (controllers finos)"]
        direction TB
        A1["Server Actions<br/>(app/actions/*.ts)"]
        A2["Server Components / Pages<br/>(app/(protected)/*)"]
    end

    subgraph USECASES["use-cases/ — lógica de negócio"]
        direction TB
        U1["RunCampaign, MoveLead,<br/>CreateUserWithCompany, ..."]
    end

    subgraph DOMAIN["domain/ — contratos (interfaces puras)"]
        direction TB
        D1["ICampaignRepository<br/>ILeadRepository<br/>IGeoService<br/>IAIService, ..."]
    end

    subgraph INFRA["infrastructure/ — implementações concretas"]
        direction TB
        I1["DrizzleCampaignRepository<br/>DrizzleLeadRepository"]
        I2["OverpassGeoService<br/>CloudflareAIService"]
        I3["db/schema.ts + db/index.ts<br/>(Drizzle + pool Neon)"]
    end

    A1 -->|"instancia e chama"| U1
    A2 -->|"le via repositorio"| U1
    U1 -->|"depende apenas da interface"| D1
    I1 -.->|"implementa"| D1
    I2 -.->|"implementa"| D1
    I1 --> I3

    style DOMAIN fill:#1e293b,color:#fff,stroke:#6366f1,stroke-width:2px
    style USECASES fill:#312e81,color:#fff,stroke:#818cf8
    style APP fill:#0f172a,color:#fff,stroke:#94a3b8
    style INFRA fill:#164e63,color:#fff,stroke:#22d3ee
```

---

## Diagrama 2 — Injeção de dependência na prática

Este é o exemplo do `CLAUDE.md`: a action é o **único lugar** onde a implementação concreta é escolhida. O use case nunca sabe que existe Drizzle ou Overpass.

```mermaid
sequenceDiagram
    participant UI as UI (client)
    participant Action as runCampaignAction<br/>(app/actions)
    participant UC as RunCampaign<br/>(use-cases)
    participant Repo as DrizzleCampaignRepository<br/>(infrastructure)
    participant Geo as OverpassGeoService<br/>(infrastructure)
    participant DB as Neon Postgres

    UI->>Action: runCampaignAction(campaignId)
    Action->>Action: requireUser() + requireCompany(user.id)
    Action->>Repo: new DrizzleCampaignRepository(db)
    Action->>Geo: new OverpassGeoService()
    Action->>UC: new RunCampaign(campaignRepo, leadRepo, geoService)
    Action->>UC: execute({ campaignId, companyId })
    UC->>Repo: findById(id, companyId)  [via ICampaignRepository]
    Repo->>DB: SELECT ... WHERE company_id = $1
    DB-->>Repo: campaign
    UC->>Geo: search(params)  [via IGeoService]
    Geo-->>UC: GeoResult[]
    UC->>Repo: updateStatus(...) / bulkCreate leads
    Repo->>DB: INSERT/UPDATE
    UC-->>Action: { ok: true, data }
    Action-->>UI: { ok: true, data }
```

---

## Como ler este diagrama

- **A seta tracejada (`-.->`) em "implementa"** é a inversão de dependência (DIP): `DrizzleCampaignRepository` e `OverpassGeoService` apontam *para* a interface, não o contrário — o use case (`RunCampaign`) só enxerga `ICampaignRepository`/`IGeoService`.
- **`app/` nunca fala com `db` diretamente.** Se você ver `db.query...` dentro de um arquivo em `app/actions/`, é violação de arquitetura — o `CLAUDE.md` lista isso explicitamente como "nunca deve acontecer".
- **A troca de provider é local.** Trocar Overpass por Google Places, por exemplo, significa criar `GooglePlacesGeoService implements IGeoService` em `infrastructure/services/` e mudar uma linha na action — nada em `use-cases/` muda. Isso é o OCP (Open/Closed) do SPEC.
- **`companyId` sempre explícito** — repare que `execute({ campaignId, companyId })` passa o tenant como parâmetro, nunca como contexto global. Ver `3_Multi-Tenant-Isolamento.md` para o fluxo completo disso.

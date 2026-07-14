# Multi-Tenant — Isolamento por `companyId`

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Fonte: `CLAUDE.md` (seção "Tenant safety").

---

## O que este diagrama explica

ProspFlow é um SaaS onde várias agências (empresas) compartilham o mesmo banco. A regra de ouro é: **toda query filtra por `company_id`, sem exceção.** Este diagrama mostra como o `companyId` nasce na sessão do usuário e é carregado explicitamente por todas as camadas — nunca inferido implicitamente dentro de um repositório ou use case.

---

## Diagrama

```mermaid
flowchart LR
    Session["Sessão Better Auth<br/>(cookie/token)"] --> RU["requireUser()<br/>src/lib/tenant.ts"]
    RU -->|"user.id"| RC["requireCompany(user.id)<br/>src/lib/tenant.ts"]
    RC -->|"{ companyId }"| Action["Server Action<br/>(controller fino)"]

    Action -->|"companyId explicito"| UC["Use Case<br/>execute({ ..., companyId })"]
    UC -->|"companyId explicito"| Repo["Repositorio<br/>findAllByCompany(companyId)"]
    Repo -->|"WHERE company_id = $1"| DB[("Neon Postgres")]

    subgraph Errado["❌ Nunca fazer"]
        direction TB
        E1["findAll() sem companyId"]
        E2["Action lendo companyId de variável global"]
        E3["Repositório assumindo tenant do contexto"]
    end

    style Errado fill:#450a0a,color:#fecaca,stroke:#dc2626
```

---

## Como ler este diagrama

- **`requireCompany(user.id)` é o único lugar que resolve "qual empresa é essa".** A partir daí, `companyId` vira um valor comum passado por parâmetro — não existe "contexto global de tenant" em nenhuma camada.
- **Toda assinatura de repositório recebe `companyId`.** Compare a assinatura correta com a errada do `CLAUDE.md`:
  ```typescript
  // CORRETO
  findAllByCompany(companyId: string): Promise<Niche[]>

  // ERRADO — vaza dados entre tenants
  findAll(): Promise<Niche[]>
  ```
- **Por que isso importa na prática:** se um repositório algum dia esquecer o `WHERE company_id = $1`, a query retorna leads/campanhas de *todas* as agências — um vazamento de dados entre clientes do SaaS. É o tipo de bug que não aparece em teste manual com um usuário só, por isso a regra é "sem exceção" e não "com cuidado".
- **Onde isso é reforçado no código:** toda action começa com `requireUser()` → `requireCompany(user.id)` (convenção do `CLAUDE.md`), e todo use case/repositório novo deve nascer com `companyId` no primeiro parâmetro.

# Conceitos — Por que Neon? Postgres Serverless e Connection Pooling

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Fonte: `docs/setup-next16-better-auth-neon.md` § 4.

---

## O que este diagrama explica

Postgres tradicional foi desenhado para um servidor de aplicação de longa duração, com um número previsível de conexões abertas. Ambientes serverless/edge (como o Vercel, onde o ProspFlow roda) são o oposto disso: cada requisição pode rodar em uma função efêmera, e centenas delas podem "nascer" ao mesmo tempo. Este diagrama mostra o problema e como o Neon resolve.

---

## Diagrama 1 — O problema: serverless + Postgres tradicional

```mermaid
flowchart TD
    R1["Requisição 1"] --> F1["Função serverless<br/>(instância efêmera)"]
    R2["Requisição 2"] --> F2["Função serverless<br/>(instância efêmera)"]
    R3["Requisição N..."] --> F3["Função serverless<br/>(instância efêmera)"]

    F1 --> C1["Nova conexão TCP<br/>ao Postgres"]
    F2 --> C2["Nova conexão TCP<br/>ao Postgres"]
    F3 --> C3["Nova conexão TCP<br/>ao Postgres"]

    C1 & C2 & C3 --> PG[("Postgres tradicional<br/>limite fixo de conexoes<br/>(ex: 100)")]

    PG -.->|"⚠ esgota o limite<br/>sob picos de trafego"| Error["too many connections"]

    style Error fill:#450a0a,color:#fecaca
```

---

## Diagrama 2 — A solução: Neon (serverless Postgres + pooling)

```mermaid
flowchart TD
    R1["Requisição 1"] --> F1["Função serverless"]
    R2["Requisição 2"] --> F2["Função serverless"]
    R3["Requisição N..."] --> F3["Função serverless"]

    F1 & F2 & F3 --> Pool["Pool de conexoes singleton<br/>src/infrastructure/db/index.ts"]

    Pool --> PgBouncer["Connection pooler do Neon<br/>(multiplexa conexoes)"]
    PgBouncer --> Neon[("Neon Postgres<br/>compute serverless")]

    Neon -.->|"escala para zero<br/>quando ocioso"| Scale["Sem custo em idle"]

    style Pool fill:#312e81,color:#fff
    style PgBouncer fill:#164e63,color:#fff
    style Neon fill:#052e16,color:#bbf7d0
```

---

## Como ler este diagrama

- **O pool é criado uma única vez, como singleton** (`src/infrastructure/db/index.ts`) — não uma conexão nova por requisição. É esse arquivo que os repositórios recebem por injeção no construtor, conforme a convenção do `CLAUDE.md` ("repositórios recebem `db` no construtor, nunca importam globalmente").
- **`sslmode=require` na `DATABASE_URL`** não é opcional — o Neon exige TLS na conexão, diferente de um Postgres local em Docker.
- **"Escala para zero"** é a característica que justifica o nome "serverless Postgres": em desenvolvimento (ou uma agência pequena com pouco tráfego à noite), o compute do Neon hiberna e você não paga por capacidade ociosa — ele "acorda" na próxima query, com uma pequena latência de cold start.
- **Por que não um Postgres tradicional numa VM:** funcionaria, mas você pagaria por uma instância ligada 24/7 e teria que gerenciar o limite de conexões manualmente (via PgBouncer próprio) — o Neon já entrega isso pronto, integrado ao driver.
- **Branching (mencionado no setup, não usado ativamente no projeto ainda):** o Neon permite criar um "branch" do banco (cópia copy-on-write) para testar uma migration arriscada sem tocar em produção — vale citar na live como diferencial, mesmo sem estar no fluxo atual do ProspFlow.

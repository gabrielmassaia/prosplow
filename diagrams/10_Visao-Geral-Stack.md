# Visão Geral — O Stack Completo do ProspFlow

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Use este arquivo como **slide de abertura** de qualquer aula — ele amarra todos os outros diagramas da pasta.

---

## O que este diagrama explica

Um único diagrama grande, ligando tudo que os outros arquivos explicam em detalhe: o navegador, o Next.js, as camadas internas (Clean Architecture), o banco (Neon) e as integrações externas (ViaCEP, Nominatim, Overpass, Cloudflare AI). É o "mapa-múndi" da aula — depois de mostrar este, você aponta para cada pedaço e abre o diagrama específico dele.

---

## Diagrama

```mermaid
flowchart TB
    Browser["🖥️ Navegador<br/>(React 19 + Client Components)"]

    subgraph Vercel["Next.js 16 — App Router (Vercel)"]
        direction TB
        Proxy["proxy.ts<br/>(protege rotas)"]
        RSC["Server Components / Pages<br/>(app/(protected)/*)"]
        Actions["Server Actions<br/>(app/actions/*)"]
    end

    subgraph Core["Núcleo — Clean Architecture"]
        direction TB
        UseCases["use-cases/<br/>(RunCampaign, MoveLead, ...)"]
        Domain["domain/<br/>(interfaces: IXRepository, IGeoService, IAIService)"]
        Infra["infrastructure/<br/>(Drizzle repos + services)"]
    end

    DB[("🗄️ Neon Postgres<br/>(serverless + pool)")]

    subgraph Externos["Integrações externas"]
        direction TB
        BetterAuth["Better Auth<br/>(sessão/credenciais)"]
        ViaCEP["ViaCEP<br/>(CEP → cidade/UF)"]
        Nominatim["Nominatim/OSM<br/>(endereço → lat/lon)"]
        Overpass["Overpass API<br/>(busca georreferenciada)"]
        Cloudflare["Cloudflare Workers AI<br/>(diagnostico + mensagem)"]
    end

    Browser -->|"requisição HTTP"| Proxy
    Proxy --> RSC
    Browser -->|"chamadas diretas (client-side)"| ViaCEP
    Browser -->|"chamadas diretas (client-side)"| Nominatim
    Browser -->|"Server Action"| Actions

    RSC --> UseCases
    Actions --> UseCases
    UseCases --> Domain
    Infra -.->|"implementa"| Domain
    Infra --> DB

    Actions --> BetterAuth
    Infra --> Overpass
    Infra --> Cloudflare
    BetterAuth --> DB

    style Vercel fill:#0f172a,color:#fff,stroke:#94a3b8
    style Core fill:#1e293b,color:#fff,stroke:#6366f1,stroke-width:2px
    style Externos fill:#164e63,color:#fff,stroke:#22d3ee
```

---

## Como ler este diagrama

- **Duas famílias de chamada externa:** ViaCEP e Nominatim são chamadas **direto do navegador** (client-side, no `onBlur` do formulário) — não passam pelo backend. Overpass e Cloudflare AI são chamadas **do lado do servidor**, dentro de `infrastructure/services/`, atrás de uma interface (`IGeoService`, `IAIService`).
- **Better Auth fica "ao lado" das Server Actions, não dentro do Core** — ele não é modelado como um repositório de domínio; é tratado como infraestrutura de autenticação que a camada `app/` consome diretamente (via `auth.api.*` ou `authClient`), mais próximo de uma dependência de framework do que de uma regra de negócio.
- **Todo caminho até o banco passa pelo Core** — não existe atalho de `app/` direto para `db`. Esse é o contrato mais importante do projeto, detalhado em `1_Arquitetura-Clean-Architecture.md`.
- **Para a live:** comece por este diagrama, depois desça para o específico do assunto do dia — `2_Banco-de-Dados-ERD.md` se for aula de schema, `5_Fluxo-Prospeccao-Campanha.md` se for aula de campanhas, etc.

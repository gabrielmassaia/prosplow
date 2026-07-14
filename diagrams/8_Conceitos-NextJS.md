# Conceitos — Por que Next.js? App Router, SSR/SSG/ISR

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Diagrama conceitual, ancorado nos arquivos reais do ProspFlow (`src/proxy.ts`, `app/(protected)/layout.tsx`).

---

## O que este diagrama explica

React puro só resolve "como renderizar a UI" — ele não decide onde essa renderização acontece, não tem roteamento embutido, e por padrão só roda no navegador (SPA), o que é ruim para SEO e para o primeiro carregamento. O Next.js resolve isso: é um framework em cima do React que adiciona roteamento por pastas, renderização no servidor, e a escolha de *quando* renderizar cada página.

---

## Diagrama 1 — O problema do SPA puro (Create React App / Vite sem framework)

```mermaid
sequenceDiagram
    participant Browser
    participant CDN as Servidor estatico
    participant JS as Bundle JavaScript

    Browser->>CDN: GET /prospeccao
    CDN-->>Browser: HTML quase vazio (<div id="root">)
    Browser->>JS: baixa o bundle JS inteiro
    Browser->>JS: executa React no navegador
    JS->>JS: busca dados via fetch (client-side)
    JS-->>Browser: só agora a tela aparece com conteudo

    Note over Browser: Google/crawlers veem uma pagina vazia.<br/>Usuario espera o JS baixar + rodar antes de ver algo.
```

---

## Diagrama 2 — Ciclo de vida de uma requisição no App Router (ProspFlow)

```mermaid
flowchart TD
    Req["GET /prospeccao/campanhas"] --> Proxy["src/proxy.ts<br/>(middleware)"]
    Proxy --> Check{"Rota publica<br/>(auth) ou /api/auth?"}
    Check -->|"sim"| Public["Libera direto"]
    Check -->|"não, e (protected)"| Cookie{"Tem cookie<br/>de sessao?"}
    Cookie -->|"não"| Login["redirect /login"]
    Cookie -->|"sim"| Layout["app/(protected)/layout.tsx<br/>(Server Component)"]
    Layout --> Page["app/(protected)/prospeccao/<br/>campanhas/page.tsx"]
    Page --> RSC["Renderiza no servidor:<br/>requireUser() + repositorio + HTML"]
    RSC --> Stream["HTML (+ RSC payload)<br/>enviado ao navegador"]
    Stream --> Hydrate["Navegador hidrata so<br/>os Client Components"]
    Hydrate --> Interactive["Pagina interativa"]

    style Proxy fill:#312e81,color:#fff
    style RSC fill:#0f172a,color:#fff
```

---

## Diagrama 3 — Estratégias de renderização (onde o ProspFlow se encaixa)

```mermaid
flowchart LR
    subgraph SSR["SSR — usado no ProspFlow"]
        direction TB
        SSR1["A cada requisição,<br/>renderiza no servidor"]
        SSR2["Dados sempre atuais<br/>(dashboard, leads, kanban)"]
    end

    subgraph SSG["SSG — não usado aqui"]
        direction TB
        SG1["Renderiza uma vez,<br/>no build"]
        SG2["Ideal para paginas publicas<br/>que quase nao mudam"]
    end

    subgraph ISR["ISR — não usado aqui"]
        direction TB
        I1["Renderiza estatico,<br/>mas revalida de tempo em tempo"]
        I2["Meio termo: quase estatico,<br/>quase sempre atual"]
    end

    style SSR fill:#052e16,color:#bbf7d0,stroke:#16a34a
    style SSG fill:#1e293b,color:#94a3b8
    style ISR fill:#1e293b,color:#94a3b8
```

---

## Como ler este diagrama

- **Next.js resolve dois problemas do React puro ao mesmo tempo:** roteamento (pastas em `app/` viram rotas automaticamente — sem instalar `react-router`) e onde renderizar (servidor por padrão, não só no navegador).
- **`src/proxy.ts` roda antes de qualquer coisa** — é a primeira parada de toda requisição, e é onde a proteção de rotas acontece antes mesmo do React entrar em cena.
- **Todo Server Component do ProspFlow usa SSR (renderização a cada requisição), não SSG.** Faz sentido: um dashboard de leads e um Kanban comercial mudam a cada minuto — teria pouco valor gerar essa página uma vez no build e servir sempre a mesma versão.
- **"RSC payload"** é a serialização especial que o Next.js manda junto com o HTML — permite ao navegador saber quais partes da árvore são Server Components (já prontos, sem JS) e quais são Client Components (precisam hidratar). É a peça técnica que faz `7_Conceitos-React.md` (Server vs Client Components) funcionar de verdade.
- **Por que isso importa para SEO/performance:** comparado ao Diagrama 1 (SPA puro), o usuário já vê HTML com conteúdo real na primeira resposta — não precisa esperar o bundle JS inteiro baixar e rodar para ver alguma coisa na tela.

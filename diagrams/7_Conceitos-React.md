# Conceitos — Por que React? Virtual DOM, Server vs Client Components

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Diagrama conceitual — não específico do ProspFlow, mas usa exemplos do projeto para ancorar a explicação.

---

## O que este diagrama explica

Antes de mostrar código React na live, vale explicar **o problema que ele resolve**. Este arquivo tem três diagramas: (1) o problema da manipulação imperativa do DOM que motivou o React, (2) como o Virtual DOM resolve isso, e (3) a divisão Server Components vs Client Components — que é onde React 19 + Next.js 16 mudam o jogo em relação ao React "clássico" de SPA.

---

## Diagrama 1 — O problema: manipulação imperativa do DOM (era jQuery)

```mermaid
flowchart LR
    subgraph Imperativo["Antes (jQuery / DOM manual)"]
        direction TB
        E1["Estado muda<br/>(ex: novo lead adicionado)"] --> E2["Você mesmo escreve:<br/>encontrar o elemento na tela"]
        E2 --> E3["Você mesmo escreve:<br/>criar/atualizar/remover nós do DOM"]
        E3 --> E4["Repetir isso a cada<br/>lugar que usa esse dado"]
    end

    style Imperativo fill:#450a0a,color:#fecaca,stroke:#dc2626
```

```mermaid
flowchart LR
    subgraph Declarativo["Com React"]
        direction TB
        D1["Estado muda<br/>(ex: novo lead adicionado)"] --> D2["Você descreve:<br/>'a lista de leads é isto aqui'"]
        D2 --> D3["React decide o que mudar<br/>na tela (reconciliação)"]
    end

    style Declarativo fill:#052e16,color:#bbf7d0,stroke:#16a34a
```

---

## Diagrama 2 — Virtual DOM e reconciliação

```mermaid
flowchart TD
    State["setState() / re-render"] --> NewTree["React monta uma nova<br/>arvore Virtual DOM (em memoria)"]
    NewTree --> Diff["Compara com a arvore anterior<br/>(diffing)"]
    Diff --> Patch["Calcula o menor conjunto<br/>de mudanças (patch)"]
    Patch --> RealDOM["Aplica só o patch<br/>no DOM real do navegador"]

    style NewTree fill:#1e293b,color:#fff
    style RealDOM fill:#164e63,color:#fff
```

---

## Diagrama 3 — Server Components vs Client Components (React 19 + Next.js 16)

```mermaid
flowchart TB
    subgraph Server["Renderizado no servidor (RSC)"]
        direction TB
        S1["app/(protected)/prospeccao/page.tsx<br/>(Server Component)"]
        S2["Busca dados direto<br/>(via requireUser + repositorio)"]
        S1 --> S2
    end

    subgraph Boundary["'use client' — fronteira"]
        direction TB
        C1["NichoForm.tsx<br/>(useState, onSubmit)"]
        C2["LeadsMap.tsx<br/>(Leaflet, so client)"]
        C3["KanbanBoard.tsx<br/>(@dnd-kit, drag state)"]
    end

    S2 -->|"passa dados como props"| C1
    S2 -->|"passa dados como props"| C2
    S2 -->|"passa dados como props"| C3

    Browser["Navegador"] -->|"hidrata so os<br/>Client Components"| Boundary

    style Server fill:#0f172a,color:#fff,stroke:#94a3b8
    style Boundary fill:#312e81,color:#fff,stroke:#818cf8
```

---

## Como ler este diagrama

- **O React nasceu para eliminar a manipulação manual do DOM** — no Facebook, apps grandes com muito estado compartilhado (ex: contador de notificações mudando em 5 lugares da tela ao mesmo tempo) viravam um pesadelo de sincronização manual. A ideia central: você descreve "como a UI deve ser para este estado", e a biblioteca cuida de aplicar as mudanças.
- **Virtual DOM não é mágica, é uma otimização de diffing** — manipular o DOM real é caro; comparar duas árvores em memória (JS puro) é barato. React troca "várias mudanças diretas no DOM" por "uma comparação em memória + um patch mínimo".
- **Server Components são a mudança mais recente e a mais relevante para o ProspFlow:** por padrão, todo componente em `app/` roda **no servidor**, nunca manda JavaScript para o navegador, e pode ler direto do banco (via `requireUser()`/repositório). Só vira Client Component (`"use client"`) quando precisa de interatividade real — `useState`, formulários, mapas Leaflet, drag & drop.
- **Isso explica a tabela do `CLAUDE.md`:** `"use client"` só em formulários, modais, mapas e DnD. É exatamente a linha entre "isso precisa rodar no navegador" e "isso só precisa aparecer na tela".
- **Hidratação** é o processo do navegador "religar" o JavaScript nos Client Components depois do HTML inicial chegar do servidor — por isso Leaflet precisa de `dynamic(() => import(...), { ssr: false })`: ele manipula o DOM diretamente e quebra se tentar rodar durante a renderização no servidor.

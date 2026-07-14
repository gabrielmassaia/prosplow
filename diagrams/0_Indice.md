# Diagramas — Índice

> Apoio visual para as lives do ProspFlow. Organizado por tema, não por aula — os mesmos diagramas (ERD, arquitetura) valem para várias aulas.

---

## Mapa dos arquivos

| Arquivo | O que mostra |
|---|---|
| `1_Arquitetura-Clean-Architecture.md` | Camadas (`domain`/`use-cases`/`infrastructure`/`app`), regra de dependência, exemplo de injeção de dependência (`RunCampaignAction`) |
| `2_Banco-de-Dados-ERD.md` | ERD completo do banco — todas as tabelas das Aulas 1–3, com FKs e anotação de qual fase introduziu cada uma |
| `3_Multi-Tenant-Isolamento.md` | Como o `companyId` nasce na sessão e é passado explicitamente por todas as camadas |
| `4_Fluxo-Autenticacao.md` | Sequence diagrams de signup (transação user+company), login, e proteção de rotas pelo proxy |
| `5_Fluxo-Prospeccao-Campanha.md` | Sequence diagrams: formulário com CEP (ViaCEP+Nominatim), `RunCampaign` (Overpass + score), qualificação de lead com IA |
| `6_Fluxo-Funil-Kanban.md` | Sequence diagram de `MoveLead` (drag & drop) e bootstrap de `SeedFunnelStages` |
| `7_Conceitos-React.md` | Por que o React existe (problema do DOM imperativo), Virtual DOM, Server vs Client Components |
| `8_Conceitos-NextJS.md` | Por que Next.js sobre React puro, ciclo de vida de uma requisição no App Router, SSR vs SSG vs ISR |
| `9_Conceitos-Neon-Postgres.md` | Por que Postgres serverless, o problema de conexões em ambiente serverless, connection pooling |
| `10_Visao-Geral-Stack.md` | Diagrama único ligando todo o stack — use como slide de abertura de qualquer aula |

---

## Como visualizar

**Durante a live (recomendado): VS Code.** Abra qualquer arquivo `.md` desta pasta e use o preview (`Ctrl+Shift+V` no Windows/Linux, `Cmd+Shift+V` no Mac). VS Code recente já renderiza Mermaid nativamente no preview de Markdown; se a sua versão não renderizar, instale a extensão **"Markdown Preview Mermaid Support"**.

**No GitHub:** qualquer arquivo `.md` com blocos ` ```mermaid ` renderiza automaticamente na visualização do repositório — sem configuração nenhuma.

**Tela cheia no navegador (apresentação, recomendado para a live):** abra `diagrams/html/index.html` com duplo clique. É uma versão em **HTML/CSS puro**, sem Mermaid nem lib de diagramação — fluxos, sequence diagrams e ERD desenhados como componentes CSS autorais, com tema claro/escuro e navegação entre páginas. Funciona 100% offline.

---

## Duas versões, dois propósitos

- **`diagrams/*.md`** (este nível) — versão **texto**, com diagramas em Mermaid. Rápida de editar, diff limpo no git, renderiza em qualquer preview de Markdown ou no GitHub. É a referência técnica de bolso.
- **`diagrams/html/*.html`** — versão **visual**, construída à mão em HTML/CSS (sem Mermaid, sem lib externa), pensada para ficar bonita em tela cheia durante a live. Gerada por `diagrams/html/generate.mjs`, que guarda o conteúdo de cada diagrama em estruturas de dados JS e monta o HTML a partir de componentes reutilizáveis (`flow`, `sequence`, `erd`).

## Convenção de manutenção

Sempre que um arquivo de fase (`phases/aula-N/`) mudar um fluxo ou o schema:

1. Atualize o `.md` correspondente aqui (referência rápida em Mermaid).
2. Atualize os dados equivalentes em `diagrams/html/generate.mjs` (procure o comentário `// N — Nome` no arquivo) e rode `node diagrams/html/generate.mjs` para regenerar os `.html`.

Os dois **não** são gerados automaticamente um a partir do outro — mantenha-os em sincronia manualmente quando um diagrama mudar.

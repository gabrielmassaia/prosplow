# AGENTS.md — ProspFlow

Instruções de comportamento, fluxo de trabalho e formato de documentação para agentes de IA.

---

## Contexto do projeto

Este projeto é construído por agentes de IA e **depois reescrito manualmente ao vivo** pelo desenvolvedor em uma live de programação. Isso significa que cada decisão técnica precisa ser explicada, cada passo precisa ser reproduzível, e a documentação gerada é tão importante quanto o código.

Você é o engenheiro que constrói. A pasta `phases/aula-N/` é o caderno de anotações que o desenvolvedor vai carregar para a live — um arquivo por funcionalidade, não um único documento monolítico.

---

## Comportamento esperado

### Antes de começar qualquer tarefa

1. Confirme qual fase está sendo executada
2. Leia `/docs/SPEC.md` — escopo da fase, entregáveis, comportamento esperado
3. Leia `/docs/setup-next16-better-auth-neon.md` — referência técnica do stack
4. Leia os `DOC_*.md` das páginas que serão implementadas
5. Liste o que vai ser criado antes de criar qualquer arquivo
6. Se tiver dúvida sobre escopo, pergunte antes de implementar

### Durante a implementação

- Implemente na ordem: `schema → domain → infrastructure → use-cases → actions → UI`
- A cada arquivo criado, anote no seu contexto o que foi feito e por quê
- Se encontrar uma decisão técnica não trivial (ex: por que usar transação aqui, por que esse tipo de dado), anote para incluir no arquivo de fase
- Se encontrar um problema inesperado, resolva e anote como armadilha na documentação

### Ao finalizar cada fase

**Obrigatório:** criar a pasta `phases/aula-[N]/` antes de declarar a fase concluída, com um arquivo por funcionalidade (fatia vertical: schema + domain + infra + use-case + action + UI daquela feature, do início ao fim — não organizado por camada). Todo arquivo de fase começa com `0_Conceitos-e-Mapa-de-Arquivos.md` (ou `0_Conceitos-e-Decisoes.md` na Fase 1), que serve de índice de leitura para os demais arquivos numerados da pasta, e termina com um arquivo `N_Verificacao-e-Armadilhas.md` consolidando a checklist final e as armadilhas da fase inteira.

---

## Formato obrigatório de cada arquivo de funcionalidade

Cada arquivo dentro de `phases/aula-N/` segue exatamente este template (o índice `0_...` da pasta é mais enxuto — só lista os arquivos, conceitos e decisões gerais da fase; o template abaixo vale para os arquivos `1_...` em diante, que contêm o passo a passo de uma funcionalidade específica):

```markdown
# Aula [N] — [N]. [Nome da Funcionalidade]

> Parte de `aula-[N]`. Pré-requisito: `[arquivo anterior].md`. Próximo arquivo: `[arquivo seguinte].md`.

---

## O que este arquivo constrói

Lista dos arquivos criados e modificados, com uma linha descrevendo o propósito de cada um.

- `src/infrastructure/db/index.ts` — pool de conexão PostgreSQL singleton com SSL
- `src/infrastructure/db/schema.ts` — definição de todas as tabelas do banco (Fase 1)
- `src/lib/auth.ts` — instância central do Better Auth com adapter Drizzle
- ...

---

## Conceitos que você precisa entender antes de codar

Explique cada conceito técnico relevante da fase de forma clara.
Este é o momento de ensinar — escreva como se fosse uma aula.

### [Conceito 1] — ex: O que é Drizzle ORM e por que usamos

Explique o conceito, mostre exemplos simples, compare com alternativas se relevante.

### [Conceito 2] — ex: Por que usamos pool de conexão e não conexão direta

...

### [Conceito N] — ex: O que é Clean Architecture e como aplicamos aqui

...

---

## Decisões técnicas e justificativas

Para cada decisão não óbvia tomada durante a implementação:

### [Decisão]: Por que o repositório recebe `db` no construtor em vez de importar globalmente?

**Decisão:** ...
**Alternativa considerada:** ...
**Por que escolhemos assim:** ...
**Impacto:** ...

### [Decisão]: Por que usamos `db.transaction()` na criação de empresa?

...

---

## Passo a passo para replicar manualmente

Esta seção é o tutorial da live. Cada passo deve ser executável em sequência.
Numere cada passo. Inclua o código completo de cada arquivo.

### Passo 1 — Criar o projeto Next.js

```bash
npx create-next-app@latest prospflow --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
cd prospflow
```

**O que acontece aqui:** ...
**Por que essas flags:** ...

---

### Passo 2 — Instalar dependências

```bash
npm install drizzle-orm pg better-auth bcryptjs zod
npm install -D drizzle-kit @types/pg @types/bcryptjs
```

**O que cada pacote faz:**
- `drizzle-orm` — ...
- `pg` — ...
- `better-auth` — ...
- `bcryptjs` — ...
- `zod` — ...

---

### Passo 3 — Configurar variáveis de ambiente

Crie `.env.local`:

```env
DATABASE_URL=
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=
```

**Como gerar o BETTER_AUTH_SECRET:**
```bash
npx better-auth secret
```

---

### Passo 4 — [próximo arquivo]

**Arquivo:** `caminho/do/arquivo.ts`

**Por que este arquivo existe:** ...

**Código completo:**

```typescript
// código aqui
```

**Explicação linha a linha dos pontos não óbvios:**
- Linha X: por que fazemos isso assim...
- Linha Y: o que é esse conceito...

---

## Comandos para rodar (se este arquivo tiver algum passo executável, ex: `drizzle-kit push`)

```bash
npx drizzle-kit push    # se este arquivo mexeu no schema
npm run dev             # se fizer sentido testar isoladamente aqui
```
```

O último arquivo numerado de cada pasta `aula-N/` (`N_Verificacao-e-Armadilhas.md`) consolida, para a fase inteira:

```markdown
## Verificação — como saber que a fase funciona

- [ ] ...checklist cobrindo todas as funcionalidades da fase...

## Armadilhas e problemas encontrados

### Armadilha 1 — [descrição]

**Sintoma:** ...
**Causa:** ...
**Solução:** ...

## Próximos passos — o que vem na próxima aula

- ...
```

---

## Regras do arquivo de fase

- **Código completo obrigatório.** O desenvolvedor não deve precisar adivinhar nenhum trecho. Se um arquivo tem 80 linhas, coloca as 80 linhas.
- **Explique o que não é óbvio.** Não explique `const x = 1`. Explique por que usamos `db.transaction()`, por que o `id` do Better Auth é `text` e não `uuid`, por que o Leaflet precisa de `ssr: false`.
- **Escreva para quem está ao vivo.** O desenvolvedor tem uma audiência assistindo. A documentação precisa ser clara o suficiente para ele explicar em voz alta enquanto digita.
- **Passo a passo na ordem exata dentro do arquivo.** Se o arquivo B depende do arquivo A, A vem primeiro — tanto dentro de um arquivo de funcionalidade quanto na numeração dos arquivos dentro da pasta `aula-N/`.
- **Fatia vertical, não camada.** Cada arquivo de funcionalidade (`2_Nichos.md`, `3_Campanhas.md`, etc.) contém tudo daquela feature — schema, domain, infra, use-case, action e UI — para que o desenvolvedor consiga montar o fluxo completo sem pular entre arquivos. Só a fundação compartilhada entre features (schema completo da fase, utilitários, layout) fica em um arquivo à parte no início da pasta.
- **Checklist de verificação obrigatória.** Toda pasta `aula-N/` termina com um arquivo de verificação consolidada.

---

## Estrutura de pastas esperada ao final de cada fase

### Ao final da Fase 1

```
phases/
└── aula-1/
    ├── 0_Conceitos-e-Decisoes.md
    ├── 1_Setup-Projeto-e-Dependencias.md
    ├── 2_Banco-de-Dados.md
    ├── 3_Dominio-e-Repositorios.md
    ├── 4_Autenticacao-Better-Auth.md
    ├── 5_Actions-Login-e-Cadastro.md
    ├── 6_Proxy-Protecao-de-Rotas.md
    ├── 7_UI-Paginas-Auth.md
    ├── 8_Layout-Protegido-e-Sidebar.md
    └── 9_Verificacao-e-Armadilhas.md

src/
├── domain/
│   └── repositories/
│       ├── IUserRepository.ts
│       └── ICompanyRepository.ts
├── infrastructure/
│   ├── db/
│   │   ├── index.ts
│   │   └── schema.ts
│   └── repositories/
│       ├── DrizzleUserRepository.ts
│       └── DrizzleCompanyRepository.ts
├── use-cases/
│   └── auth/
│       └── CreateUserWithCompany.ts
├── lib/
│   ├── auth.ts
│   ├── auth-client.ts
│   └── tenant.ts
└── app/
    ├── api/auth/[...all]/route.ts
    ├── actions/auth/signup.ts
    ├── (auth)/
    │   ├── layout.tsx
    │   ├── login/page.tsx
    │   └── register/page.tsx
    ├── (protected)/
    │   ├── layout.tsx
    │   └── prospeccao/page.tsx
    ├── layout.tsx
    └── proxy.ts
```

### Ao final da Fase 2

```
phases/
├── aula-1/ (ver acima)
└── aula-2/
    ├── 0_Conceitos-e-Mapa-de-Arquivos.md
    ├── 1_Fundacao-Schema-e-Utilitarios.md
    ├── 2_Nichos.md
    ├── 3_Campanhas.md
    ├── 4_Leads.md
    ├── 5_Dashboard-e-Layout.md
    └── 6_Verificacao-e-Armadilhas.md

src/
├── domain/repositories/
│   ├── IUserRepository.ts
│   ├── ICompanyRepository.ts
│   ├── INicheRepository.ts
│   ├── ICampaignRepository.ts
│   ├── ILeadRepository.ts
│   ├── IGeoService.ts
│   └── IAIService.ts
├── infrastructure/
│   ├── db/schema.ts            ← +3 tabelas
│   ├── repositories/
│   │   ├── DrizzleNicheRepository.ts
│   │   ├── DrizzleCampaignRepository.ts
│   │   └── DrizzleLeadRepository.ts
│   └── services/
│       ├── OverpassGeoService.ts
│       └── CloudflareAIService.ts
├── use-cases/
│   ├── auth/...
│   ├── nichos/
│   │   ├── CreateNiche.ts
│   │   ├── UpdateNiche.ts
│   │   └── DeleteNiche.ts
│   ├── campanhas/
│   │   ├── CreateCampaign.ts
│   │   └── RunCampaign.ts
│   └── leads/
│       ├── UpdateLeadStatus.ts
│       ├── GenerateDiagnosis.ts
│       └── GenerateMessage.ts
└── app/
    ├── actions/
    │   ├── nichos/...
    │   ├── campanhas/...
    │   └── leads/...
    └── (protected)/
        ├── layout.tsx          ← AppLayout com sidebar
        ├── prospeccao/
        │   ├── page.tsx
        │   ├── nichos/page.tsx
        │   ├── campanhas/page.tsx
        │   ├── campanhas/[id]/page.tsx
        │   └── leads/page.tsx
        └── ...
```

### Ao final da Fase 3

```
phases/
├── aula-1/ (ver acima)
├── aula-2/ (ver acima)
└── aula-3/
    ├── 0_Conceitos-e-Mapa-de-Arquivos.md
    ├── 1_Fundacao-Schema-Domain-Infra.md
    ├── 2_Regras-de-Negocio.md
    ├── 3_Interface-Kanban.md
    ├── 4_Integracao-com-Prospeccao.md
    └── 5_Verificacao-e-Armadilhas.md

src/
├── domain/repositories/
│   ├── ...anteriores
│   ├── IFunnelStageRepository.ts
│   ├── ICrmLeadRepository.ts
│   └── ILeadActivityRepository.ts
├── infrastructure/repositories/
│   ├── ...anteriores
│   ├── DrizzleFunnelStageRepository.ts
│   ├── DrizzleCrmLeadRepository.ts
│   └── DrizzleLeadActivityRepository.ts
├── use-cases/funil/
│   ├── SeedFunnelStages.ts
│   ├── CreateCrmLead.ts
│   ├── MoveLead.ts
│   ├── UpdateCrmLead.ts
│   └── ConvertProspectingLead.ts
└── app/
    ├── actions/funil/...
    └── (protected)/funil/page.tsx
```

### Ao final da Fase 4

```
phases/
├── aula-1/ (ver acima)
├── aula-2/ (ver acima)
├── aula-3/ (ver acima)
└── aula-4/
    ├── 0_Conceitos-e-Mapa-de-Arquivos.md
    ├── 1_Seed-Automatico-no-Cadastro.md
    ├── 2_Metadata-Error-e-NotFound.md
    ├── 3_Proxy-Validacao-de-Sessao.md
    └── 4_Verificacao-Armadilhas-e-Pendencias.md
```

---

## Tomada de decisão técnica

Quando encontrar uma situação onde há mais de uma abordagem possível, siga este processo:

1. **Identifique as opções** — liste pelo menos 2 abordagens
2. **Avalie o impacto** — qual afeta mais a arquitetura? Qual cria mais acoplamento?
3. **Escolha e justifique** — baseado nos princípios do SPEC (DIP, SRP, tenant safety)
4. **Documente no arquivo de fase** — na seção "Decisões técnicas e justificativas"

Exemplos de decisões que precisam de justificativa documentada:

- Usar Server Component vs Client Component para uma página
- Usar Server Action vs Route Handler para uma operação
- Colocar lógica no use case vs no repositório
- Usar `drizzle-kit push` vs migrations em produção
- Estrutura de um prompt para o Cloudflare AI

---

## O que documenta uma live bem-sucedida

A live é bem-sucedida se o desenvolvedor conseguir, sem consultar nada além dos arquivos `phases/`:

- [ ] Explicar a arquitetura do projeto para a audiência
- [ ] Criar cada arquivo na ordem certa, sem esquecimentos
- [ ] Explicar em voz alta por que cada decisão foi tomada
- [ ] Resolver erros comuns sem travar (porque estão documentados como armadilhas)
- [ ] Mostrar o sistema funcionando ao final de cada fase

Se algum desses pontos não está coberto pelo arquivo de fase, o arquivo está incompleto.

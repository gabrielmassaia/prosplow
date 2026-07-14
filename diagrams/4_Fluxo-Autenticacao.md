# Fluxo — Autenticação (Signup, Login, Proteção de Rotas)

> Parte de `diagrams/`. Ver `0_Indice.md` para o mapa completo. Fonte: `phases/aula-1/`, `docs/setup-next16-better-auth-neon.md`.

---

## O que este diagrama explica

A Aula 1 monta autenticação com Better Auth + criação automática de empresa no cadastro (transação `user + company + company_member`), e protege as rotas `(protected)` com um proxy que valida a sessão. Este arquivo tem três diagramas: cadastro, login, e proteção de rota.

---

## Diagrama 1 — Signup (`CreateUserWithCompany`)

```mermaid
sequenceDiagram
    participant UI as /register (client)
    participant Action as signup action
    participant UC as CreateUserWithCompany
    participant BA as Better Auth
    participant Repo as DrizzleCompanyRepository
    participant DB as Neon Postgres

    UI->>Action: signup({ name, email, password, companyName })
    Action->>UC: execute(input)
    UC->>BA: auth.api.signUpEmail()
    BA->>DB: INSERT INTO users
    BA-->>UC: user criado
    UC->>UC: slugify(companyName)
    UC->>Repo: create({ name, slug, ownerId })
    Note over Repo,DB: db.transaction() — atomico
    Repo->>DB: INSERT INTO companies
    Repo->>DB: INSERT INTO company_members (role: owner)
    DB-->>Repo: company criada
    Repo-->>UC: company
    UC-->>Action: { ok: true }
    Action-->>UI: redireciona para /prospeccao
```

---

## Diagrama 2 — Login

```mermaid
sequenceDiagram
    participant UI as /login (client)
    participant BA as authClient (Better Auth)
    participant API as /api/auth/[...all]
    participant DB as Neon Postgres

    UI->>BA: authClient.signIn.email({ email, password })
    BA->>API: POST /api/auth/sign-in/email
    API->>DB: valida credenciais + bcrypt.compare
    DB-->>API: usuário válido
    API-->>BA: sessão criada (cookie)
    BA-->>UI: redireciona para /prospeccao
```

---

## Diagrama 3 — Proteção de rotas (proxy)

```mermaid
flowchart TD
    Req["Requisição para (protected)/*"] --> Proxy["src/proxy.ts"]
    Proxy --> HasCookie{"Cookie de sessão<br/>presente?"}
    HasCookie -->|"não"| Redirect["redirect('/login')"]
    HasCookie -->|"sim"| Page["Server Component da página"]
    Page --> RU["requireUser()"]
    RU --> ValidSession{"Sessão válida<br/>no banco?"}
    ValidSession -->|"não"| Redirect
    ValidSession -->|"sim"| Render["Renderiza pagina"]

    style Redirect fill:#450a0a,color:#fecaca
    style Render fill:#052e16,color:#bbf7d0
```

---

## Como ler este diagrama

- **A transação no signup é o ponto mais importante da Aula 1.** Se `INSERT INTO companies` funcionar mas `INSERT INTO company_members` falhar, sem transação você teria uma empresa órfã, sem dono. `db.transaction()` garante tudo-ou-nada.
- **`usersTable.id` é `text`, não `uuid`** — Better Auth já gera o ID do jeito dele. `companiesTable.ownerId` referencia esse campo como `text`, e é por isso que o `CLAUDE.md` avisa para nunca trocar esse tipo.
- **O proxy hoje (Aula 1–3) só checa se o cookie existe** — a validação completa da sessão (bate no banco) acontece depois, dentro de `requireUser()`. O Diagrama 3 já mostra o comportamento-alvo da Aula 4 (`3_Proxy-Validacao-de-Sessao.md`), que fecha essa lacuna validando a sessão no próprio proxy.
- **`role: "owner"`** é o único valor usado hoje — o schema já suporta `member` para um fluxo futuro de convite de equipe, que está fora do escopo atual (ver `SPEC.md`, Fase 4 "Fora de escopo").

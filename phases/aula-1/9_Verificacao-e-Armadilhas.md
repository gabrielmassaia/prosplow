# Aula 1 — 9. Verificação, Armadilhas e Próximos Passos

> Parte de `aula-1`. Pré-requisito: `8_Layout-Protegido-e-Sidebar.md`. Fecha a Aula 1 — próxima pasta: `aula-2/`.

---

### Passo 17 — Aplicar schema no banco

```bash
npx drizzle-kit push
```

Este comando lê o `schema.ts`, compara com o banco atual e cria as tabelas que não existem. Durante desenvolvimento é o mais rápido. Para produção, use `drizzle-kit generate` + `drizzle-kit migrate` para ter controle sobre as migrations.

---

### Passo 18 — Testar

```bash
npm run dev
```

Acesse `http://localhost:3000/register` e crie uma conta. Depois verifique no painel do Neon que as tabelas foram criadas e o usuário foi inserido.

---

## Verificação — como saber que funcionou

- [ ] `/register` carrega o formulário sem erros no console
- [ ] Submeter o formulário cria um registro em `users`, `companies` e `company_members` no Neon
- [ ] Após cadastro, redireciona para `/prospeccao` mostrando nome do usuário e empresa
- [ ] `/login` com as credenciais criadas funciona e redireciona para `/prospeccao`
- [ ] `/login` com senha errada mostra erro inline
- [ ] Acessar `/prospeccao` em uma aba anônima (sem cookie) redireciona para `/login`
- [ ] O banco no Neon tem as 6 tabelas: `users`, `sessions`, `accounts`, `verifications`, `companies`, `company_members`

---

## Armadilhas e problemas comuns

### Armadilha 0 — Rotas não estão sendo protegidas (proxy ignorado silenciosamente)

**Sintoma:** Ao iniciar o servidor, aparece o erro: `The file "./src\proxy.ts" must export a function, either as a default export or as a named "proxy" export.`
**Causa:** O Next.js 16 renomeou `middleware.ts` → `proxy.ts`, e a função exportada deve se chamar `proxy` (não `middleware`). Se você exportar `export function middleware(...)`, o servidor sobe mas lança esse erro em cada request.
**Solução:** No arquivo `src/proxy.ts`, use `export function proxy(request: NextRequest)`. O `export const config` com o `matcher` continua igual.

### Armadilha 1 — Erro de SSL ao conectar no Neon

**Sintoma:** `Error: self signed certificate` ou `SSL SYSCALL error`
**Causa:** O Neon exige SSL e o `node-postgres` precisa do parâmetro `uselibpqcompat=true` para compatibilidade.
**Solução:** O `src/infrastructure/db/index.ts` já adiciona esse parâmetro automaticamente se não estiver na URL. Verifique se a `DATABASE_URL` termina com `?sslmode=require`.

### Armadilha 2 — `global.__drizzlePool` com erro de TypeScript

**Sintoma:** `Property '__drizzlePool' does not exist on type 'typeof globalThis'`
**Solução:** O `declare global { var __drizzlePool: Pool | undefined; }` no `db/index.ts` precisa existir. Não esqueça.

### Armadilha 3 — Better Auth retorna erro 400 no signup

**Sintoma:** `authClient.signUp.email()` retorna erro sem mensagem clara.
**Causa mais comum:** `BETTER_AUTH_URL` não está configurado ou está diferente do que o browser acessa.
**Solução:** Garanta que `.env.local` tem `BETTER_AUTH_URL=http://localhost:3000` (sem barra no final).

### Armadilha 4 — `redirect()` causa erro "NEXT_REDIRECT"

**Sintoma:** `Error: NEXT_REDIRECT` aparece nos logs do servidor.
**Causa:** Não é um erro real. O Next.js usa exceções para implementar o redirect. Se aparecer em try/catch, o catch está engolindo o redirect.
**Solução:** Nunca coloque `requireUser()` dentro de um try/catch no Server Component.

### Armadilha 5 — Signup funciona mas usuário fica deslogado após cadastro

**Sintoma:** O formulário de cadastro envia, o usuário é redirecionado para `/prospeccao`, mas é imediatamente redirecionado de volta para `/login` (a sessão não foi criada).
**Causa:** O plugin `nextCookies()` não está no `auth.ts`. Server Actions no Next.js não conseguem setar cookies sem ele.
**Solução:** Adicionar `import { nextCookies } from "better-auth/next-js"` e `plugins: [nextCookies()]` **como último item do array** em `auth.ts`.

### Armadilha 6 — Empresa criada mas membro não (dados inconsistentes)

**Sintoma:** Usuário consegue criar conta mas `/prospeccao` mostra "sem empresa".
**Causa:** Transação não está sendo usada. A inserção em `companyMembersTable` falhou silenciosamente.
**Solução:** Verificar se o `DrizzleCompanyRepository.create()` usa `db.transaction()` e se o `company_members_company_user_unique` index não está causando conflito.

---

## Passo extra — Prettier com plugin do Tailwind

### Por que Prettier + plugin?

O Prettier formata o código automaticamente no save. O plugin `prettier-plugin-tailwindcss` vai além: ele **ordena as classes Tailwind** na sequência oficial do framework (layout → spacing → typography → etc.), evitando divergência entre desenvolvedores e tornando os diffs mais limpos.

### Instalação

```bash
npm install -D prettier prettier-plugin-tailwindcss
```

### Configuração — `.prettierrc` (raiz do projeto)

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

| Opção | Valor | Por quê |
|---|---|---|
| `semi` | `true` | Ponto e vírgula obrigatório — sem ambiguidade |
| `singleQuote` | `false` | Aspas duplas — padrão JSX |
| `tabWidth` | `2` | Indentação padrão JS/TS |
| `trailingComma` | `"es5"` | Trailing comma em arrays e objetos — diffs menores |
| `printWidth` | `100` | Mais espaço que o padrão de 80; adequado para TypeScript verboso |
| `plugins` | `tailwindcss` | Ordena classes Tailwind automaticamente |

### Integração com VS Code (opcional, mas recomendado)

Instale a extensão **Prettier - Code formatter** e adicione ao `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true
}
```

### Rodar manualmente

```bash
# Formatar todos os arquivos do projeto
npx prettier --write .

# Verificar sem aplicar (útil em CI)
npx prettier --check .
```

---

## Próximos passos — Fase 2

Na próxima fase (`aula-2/`) vamos construir o módulo de prospecção completo:

- Dashboard com métricas (cards de nichos, campanhas, leads)
- CRUD de nichos com TagInput e geração por Cloudflare AI
- Lista de campanhas com execução real via Overpass API
- Detalhe de campanha com mapa Leaflet (carregamento lazy)
- Lista de leads com filtros, paginação, mapa e sheet de detalhes
- Diagnóstico e mensagem WhatsApp gerados por Cloudflare AI

Antes de começar a Fase 2, adicione as variáveis Cloudflare no `.env.local`:

```env
CLOUDFLARE_ACCOUNT_ID=seu_account_id
CLOUDFLARE_AI_TOKEN=seu_api_token
CLOUDFLARE_AI_MODEL=@cf/meta/llama-3.1-70b-instruct
```

**Onde pegar:**
- `CLOUDFLARE_ACCOUNT_ID` — [dash.cloudflare.com](https://dash.cloudflare.com) → barra lateral → Account ID
- `CLOUDFLARE_AI_TOKEN` — **My Profile → API Tokens → Create Token → template "Workers AI"**

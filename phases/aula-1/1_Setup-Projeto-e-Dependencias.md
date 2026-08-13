# Aula 1 — 1. Setup do Projeto e Dependências

> Parte de `aula-1`. Leia antes: `0_Conceitos-e-Decisoes.md`. Próximo arquivo: `2_Banco-de-Dados.md`.

---

### Passo 1 — Criar o projeto Next.js

```bash
npx create-next-app@latest prospflow \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*"

cd prospflow
```

**Flags explicadas:**
- `--typescript` → TypeScript habilitado (obrigatório para o projeto)
- `--tailwind` → Tailwind CSS v4 configurado automaticamente
- `--eslint` → linting configurado
- `--app` → usa App Router (não Pages Router — o ProspFlow usa App Router)
- `--src-dir` → coloca tudo dentro de `src/` (organização mais limpa)
- `--import-alias "@/*"` → permite `import { db } from "@/infrastructure/db"` em vez de `"../../../infrastructure/db"`

---

### Passo 2 — Instalar dependências

```bash
# Dependências de produção
npm install drizzle-orm pg better-auth bcryptjs zod

# Dependências de desenvolvimento
npm install -D drizzle-kit @types/pg @types/bcryptjs
```

**O que cada pacote faz:**
- `drizzle-orm` — o ORM em si (queries, schema, tipos)
- `pg` — driver PostgreSQL para Node.js (Drizzle precisa do driver, não inclui)
- `better-auth` — biblioteca de autenticação completa
- `bcryptjs` — hash de senhas (puro JavaScript, sem binários nativos — mais compatível com Vercel)
- `zod` — validação de schemas TypeScript em runtime
- `drizzle-kit` — CLI para migrations e push de schema (só em dev)
- `@types/pg` e `@types/bcryptjs` — tipos TypeScript das libs

---

### Passo 3 — Instalar shadcn/ui

```bash
npx shadcn@latest init
```

Quando perguntar, escolha:
- Style: base-nova
- Base color: Neutral
- CSS variables: Yes

Nessa primeira aula pessoal vamos precisar dos seguintes componentes do shadcn

```bash
npx shadcn@latest add button input label card
```

Isso cria `src/components/ui/` com os componentes base que a Fase 1 usa. `badge` só entra na Fase 2 (Task 1), quando passa a ser usado de fato — instalar antes disso deixaria um componente sem uso.

---

### Passo 4 — Criar variáveis de ambiente

Crie `.env.local` na raiz:

```env
DATABASE_URL=postgresql://user:pass@ep-xxxx.us-east-2.aws.neon.tech/neondb?sslmode=require
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=cole_aqui_o_secret
```

Gere o `BETTER_AUTH_SECRET`:
```bash
npx @better-auth/cli@latest secret
# Cole o valor gerado no .env.local
```

> **Por que `@better-auth/cli` e não `better-auth`?** O pacote `better-auth` (instalado no Passo 2) é só a lib de autenticação — ele não tem CLI (`bin`) nenhum. Quem expõe o comando `secret` é o pacote separado `@better-auth/cli`. Rodar `npx better-auth secret` faz o npx procurar um pacote chamado exatamente `better-auth` no registry, achar a lib (sem `bin`) e falhar com `npm error could not determine executable to run`.

> **Alternativa sem depender de rede**, com Node.js nativo:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> Isso gera 32 bytes aleatórios em hex — exatamente o que o Better Auth espera.

Crie também `.env.example` (sem valores reais — vai para o git):
```env
DATABASE_URL=
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=
```

**Onde pegar a `DATABASE_URL`:** acesse [neon.tech](https://neon.tech), crie um projeto, vá em "Connection string" e copie a string com `?sslmode=require`.

---

### Passo 5 — Configurar o Drizzle Kit

Crie `drizzle.config.ts` na raiz do projeto:

```typescript
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/infrastructure/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

**O que este arquivo faz:**
- Diz ao `drizzle-kit` onde está o schema (`schema.ts`)
- Diz onde gerar os arquivos de migration (`./drizzle/`)
- Diz qual banco usar (`postgresql`) e como conectar (`DATABASE_URL`)
- O `config({ path: ".env.local" })` carrega as variáveis de ambiente antes do `defineConfig` usar `process.env`

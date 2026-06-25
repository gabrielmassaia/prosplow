# Login

## Rota
Atual: `/login` → Sugerida: `/(auth)/login/page.tsx`

## Propósito
Página pública de autenticação. Exibe formulário de login com credenciais demo pré-preenchidas para facilitar testes do protótipo. O usuário clica "Entrar" e é redirecionado ao dashboard de prospecção.

---

## Componentes utilizados

- `Button` (shadcn/ui)
- `Input` (shadcn/ui)
- `Label` (shadcn/ui)
- `Target` (lucide-react, ícone do logo)
- `Link` (TanStack Router → Next.js `next/link`)

---

## Componentes — Detalhamento

A página não possui componentes filhos separados. Tudo está inline em `LoginPage`.

### `LoginPage`

**Localização:** `src/routes/login.tsx` (componente inline da rota)

**Responsabilidade:** Renderiza tela de login com identidade visual, formulário com email/senha e link para cadastro.

**Props:** Nenhuma (componente de página).

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| email | string | `"joao@acmeagencia.com.br"` | Email do usuário |
| password | string | `"demo1234"` | Senha do usuário |

**Constantes locais:**
| Nome | Valor | Descrição |
|------|-------|-----------|
| DEMO_EMAIL | `"joao@acmeagencia.com.br"` | Email mockado exibido ao usuário |
| DEMO_PASSWORD | `"demo1234"` | Senha mockada exibida ao usuário |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Submit do formulário | Previne reload, navega para `/prospeccao` (sem validação real) |

**Renderização condicional:**
- Sidebar esquerda com gradiente: visível apenas em `lg:` (hidden por padrão)
- Card de credenciais demo com estilo `indigo-50`

---

## Formato de dados (Data Shape)

A página não consome dados externos. O formulário produz:

```typescript
interface LoginCredentials {
  email: string;
  password: string;
}
```

No backend real (Better Auth), o login deve produzir uma sessão:

```typescript
interface Session {
  user: User;
  session: {
    id: string;
    expiresAt: Date;
  };
}
```

---

## Dados mockados identificados

```typescript
const DEMO_EMAIL = "joao@acmeagencia.com.br";
const DEMO_PASSWORD = "demo1234";
```

Esses dados existem apenas para facilitar testes do protótipo. No projeto real, devem ser substituídos por:
- **Autenticação real** com Better Auth (email + senha, OAuth, etc.)
- Sessão gerenciada pelo servidor

---

## Observações para migração

1. **Autenticação mock**: Substituir por Better Auth com:
   - Server action `login()` validando email/senha
   - Sessão gerenciada via cookies HTTP-only
   - Proteção de rotas via middleware Next.js
2. **Redirecionamento**: `useNavigate()` do TanStack → `useRouter()` do Next.js (`router.push()`)
3. **Link**: `<Link>` do TanStack → `next/link`
4. **Componente**: Deve ser `"use client"` (formulário interativo)
5. **SEO**: Adicionar `generateMetadata()` com título "Entrar — ProspectCRM"
6. **Layout**: Pode usar `/(auth)/layout.tsx` para layout público (sem sidebar)
7. **Validação**: Adicionar validação real com `react-hook-form` + `zod`
8. **Carregamento**: Adicionar estado de loading durante autenticação
9. **Erro**: Exibir toast de erro se credenciais inválidas

---

## Sugestão de schema de banco

A página não possui schema próprio. A autenticação será gerenciada pelo Better Auth, que cria automaticamente as tabelas `user`, `session`, `account`, `verification`.

Extensão para o modelo de negócio:

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

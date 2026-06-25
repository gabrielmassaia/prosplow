# AppLayout (Layout Autenticado)

## Rota
Atual: `/_app` (layout aninhado via TanStack Router) → Sugerida: `/(app)/layout.tsx`

## Propósito
Layout principal da aplicação autenticada. Renderiza sidebar fixa à esquerda (com logo, seletor de empresa, navegação, avatar do usuário), header com título dinâmico e breadcrumb, e área de conteúdo principal (`<Outlet />`). Envolve todas as páginas que exigem autenticação.

---

## Componentes utilizados

- `Avatar`, `AvatarFallback` (shadcn/ui)
- `Badge` (shadcn/ui)
- `Button` (shadcn/ui)
- `Target`, `Kanban`, `LayoutDashboard`, `Tag`, `Send`, `Users`, `LogOut`, `ChevronDown`, `Building2` (lucide-react)
- `Link` (TanStack Router → Next.js `next/link`)
- `Outlet` (TanStack Router → Next.js `{children}`)

---

## Componentes — Detalhamento

### `AppLayout`

**Localização:** `src/components/layout/AppLayout.tsx`

**Responsabilidade:** Componente de layout que estrutura sidebar + header + main.

**Props:** Nenhuma (usa `Outlet` do TanStack Router como conteúdo).

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| prospOpen | boolean | true | Controla expansão/recolhimento do submenu "Prospecção" |

**Contexto consumido (useApp):**
| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| user | User | Usuário logado atual |
| company | Company | Empresa ativa do workspace |

**Dados derivados:**
| Expressão | Descrição |
|-----------|-----------|
| `pathname` | Obtido via `useRouterState()` do TanStack Router → Next.js `usePathname()` |
| `title` | Mapeado de `PAGE_TITLES` com fallback para "Detalhe da Campanha" ou "ProspectCRM" |
| `subnav` | Array com 4 links do submenu de Prospecção |
| `user.name.split(" ").map(n => n[0]).join("").slice(0,2)` | Iniciais do usuário para avatar |

**Mapeamento de títulos (`PAGE_TITLES`):**
```typescript
const PAGE_TITLES: Record<string, string> = {
  "/prospeccao": "Prospecção Ativa",
  "/prospeccao/nichos": "Nichos",
  "/prospeccao/campanhas": "Campanhas",
  "/prospeccao/leads": "Leads prospectados",
  "/funil": "Funil Comercial",
};
```

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Clique no botão "Prospecção" | Alterna `prospOpen` (abre/fecha submenu) |
| Clique no ícone de sair (LogOut) | Navega para `/login` |

**Renderização condicional:**
- Submenu "Prospecção": visível apenas se `prospOpen === true`
- Sidebar `aside`: visível apenas em `md:` (hidden em mobile)
- Badge com nome da empresa: visível apenas em `sm:` (hidden abaixo)
- Destaque (active state) no link cujo pathname corresponde ao início da rota

---

## Formato de dados (Data Shape)

```typescript
interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt: string;
}

interface Company {
  id: string;
  ownerId: string;
  name: string;
  slug: string;
  createdAt: string;
}
```

---

## Dados mockados identificados

O layout consome `CURRENT_USER` e `CURRENT_COMPANY` do AppContext, que vêm de:

```typescript
// src/data/mock-users.ts
const CURRENT_USER = {
  id: "user-001",
  name: "João Silva",
  email: "joao@acmeagencia.com.br",
  avatarUrl: undefined,
  createdAt: "2024-10-01T10:00:00Z",
};

// src/data/mock-companies.ts
const CURRENT_COMPANY = {
  id: "company-001",
  ownerId: "user-001",
  name: "Acme Agência Digital",
  slug: "acme-agencia",
  createdAt: "2024-10-01T10:00:00Z",
};
```

No projeto real, esses dados virão da **sessão do Better Auth** + query ao banco.

---

## Observações para migração

1. **Must be `"use client"`**: useState para submenu, interatividade, hooks de rota
2. **Outlet → children**: TanStack `<Outlet />` vira `{children}` do layout do Next.js
3. **Sidebar**: Deve ser um layout separado no grupo `(app)` do Next.js
4. **Links**: `<Link>` do TanStack Router → `next/link` + `usePathname()` para active state
5. **Logout**: Link para `/login` → implementar server action de logout do Better Auth
6. **Avatar**: Usar `<Image>` do Next.js se houver avatar real
7. **Empresa ativa**: O seletor de empresa (mock: apenas uma) pode vir a ser um dropdown com múltiplas empresas
8. **Header dinâmico**: O título deve ser derivado da rota atual via `usePathname()`
9. **SEO**: Layout não precisa de `generateMetadata()` — as páginas filhas definem seus próprios metadados
10. **Responsividade**: Sidebar recolhível em mobile (futuro)

---

## Sugestão de schema de banco

Nenhum schema novo para este layout. Os dados de `User` e `Company` já são cobertos pelos schemas de `DOC_Login.md` e `DOC_Signup.md`.

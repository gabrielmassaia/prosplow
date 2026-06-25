# Dashboard de Prospecção Ativa

## Rota
Atual: `/prospeccao/` → Sugerida: `/(app)/prospeccao/page.tsx`

## Propósito
Página inicial do módulo de prospecção. Exibe um overview com 4 cards de métricas (nichos ativos, campanhas concluídas, leads prospectados, qualificados), lista das campanhas recentes e top leads por score. Serve como landing page pós-login.

---

## Componentes utilizados

- `Card`, `CardContent` (shadcn/ui)
- `Badge` (shadcn/ui)
- `Button` (shadcn/ui)
- `Target`, `Tag`, `Send`, `Users`, `ArrowRight`, `TrendingUp` (lucide-react)
- `Link` (TanStack Router → Next.js `next/link`)

---

## Componentes — Detalhamento

### `Dashboard`

**Localização:** `src/routes/_app.prospeccao.index.tsx` (componente inline)

**Responsabilidade:** Renderiza cards de métricas + listas de campanhas recentes e top leads.

**Props:** Nenhuma.

**Contexto consumido (useApp):**
| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| niches | ProspectingNiche[] | Todos os nichos de prospecção |
| campaigns | ProspectingCampaign[] | Todas as campanhas |
| prospectingLeads | ProspectingLead[] | Todos os leads prospectados |

**Dados derivados:**
| Expressão | Descrição |
|-----------|-----------|
| `activeNiches` | niches.filter(n ⇒ n.isActive).length |
| `totalLeads` | prospectingLeads.length |
| `qualified` | prospectingLeads.filter(l ⇒ l.score >= 70).length |
| `completedCampaigns` | campaigns.filter(c ⇒ c.status === "completed").length |
| `topLeads` | prospectingLeads ordenados por score (decrescente), top 5 |

**Card de estatísticas (stats):**
| Label | Ícone | Cor |
|-------|-------|-----|
| Nichos ativos | Tag | text-indigo-600 bg-indigo-50 |
| Campanhas concluídas | Send | text-violet-600 bg-violet-50 |
| Leads prospectados | Users | text-amber-600 bg-amber-50 |
| Qualificados (score 70+) | TrendingUp | text-emerald-600 bg-emerald-50 |

**Renderização condicional:**
- Nenhuma condicional explícita (assume que sempre há dados)

---

## Formato de dados (Data Shape)

```typescript
interface ProspectingNiche {
  id: string;
  companyId: string;
  name: string;
  description: string;
  keywords: string[];
  targetServices: string[];
  commonPains: string[];
  baseMessageTemplate: string;
  isActive: boolean;
  createdAt: string;
}

interface ProspectingCampaign {
  id: string;
  companyId: string;
  nicheId: string;
  name: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  maxResults: number;
  additionalKeywords: string[];
  status: 'draft' | 'running' | 'completed' | 'failed';
  totalFound: number;
  lastRunAt: string | null;
  createdAt: string;
}

interface ProspectingLead {
  id: string;
  companyId: string;
  campaignId: string;
  nicheId: string;
  source: string;
  name: string;
  phone: string | null;
  phoneNormalized: string | null;
  email: string | null;
  websiteUrl: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  score: number;
  status: LeadStatus;
  whatsappStatus: WhatsAppStatus;
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasWhatsapp: boolean;
  rating: number | null;
  reviewCount: number | null;
  aiOverview: string | null;
  suggestedOffer: string | null;
  createdAt: string;
}
```

---

## Dados mockados identificados

A página não tem dados mockados próprios. Consome do `AppContext` que é populado com:
- `MOCK_NICHES` (3 nichos)
- `MOCK_CAMPAIGNS` (3 campanhas)
- `MOCK_PROSPECTING_LEADS` (7 leads)

---

## Observações para migração

1. **Pode ser Server Component**: Se os dados vierem via fetch no servidor, esta página pode ser um Server Component puro.
2. **Links de navegação**: `<Link to="/prospeccao/campanhas">` → `<Link href="/prospeccao/campanhas">` (next/link)
3. **Links com parâmetros**: `<Link to="/prospeccao/campanhas/$id" params={{ id }}>` → `<Link href={"/prospeccao/campanhas/"+id}>`
4. **Dados**: Substituir `useApp()` por `async function Page()` consultando Drizzle
5. **Métricas**: Podem ser cacheadas com `cacheTag` / `cacheLife` do Next.js 16
6. **SEO**: `generateMetadata()` com título "Dashboard — Prospecção Ativa — ProspectCRM"
7. **Formatação**: `CAMPAIGN_STATUS_CLASSES` e `CAMPAIGN_STATUS_LABEL` continuam iguais em lib/format

---

## Sugestão de schema de banco

Tabelas já cobertas em `DOC_Nichos.md`, `DOC_Campanhas.md`, `DOC_Leads.md`. O dashboard apenas consolida dados dessas entidades.

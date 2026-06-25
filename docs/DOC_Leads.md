# Leads Prospectados

## Rota
Atual: `/prospeccao/leads` → Sugerida: `/(app)/prospeccao/leads/page.tsx`

## Propósito
Página de visualização e gerenciamento de leads prospectados. Oferece duas visualizações (lista em tabela e mapa interativo), filtros por campanha, status, score mínimo e presença de WhatsApp. Cada lead pode ser inspecionado em um sheet lateral com diagnóstico IA (simulado), geração de mensagem WhatsApp e ação de abrir WhatsApp.

---

## Componentes utilizados

- `Button` (shadcn/ui)
- `Badge` (shadcn/ui)
- `Card`, `CardContent` (shadcn/ui)
- `Slider` (shadcn/ui)
- `Checkbox` (shadcn/ui)
- `Label` (shadcn/ui)
- `Textarea` (shadcn/ui)
- `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` (shadcn/ui)
- `Table`, `TableBody`, `TableCell`, `TableHead`, `TableHeader`, `TableRow` (shadcn/ui)
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle` (shadcn/ui)
- `List`, `Map`, `Globe`, `Instagram`, `Phone`, `Sparkles`, `MessageCircle`, `Loader2`, `Star`, `Users` (lucide-react)
- `LeadsMap` (lazy, `@/components/LeadsMap`)
- `ClientOnly` (guarda de hidratação)
- `toast` (sonner)

---

## Componentes — Detalhamento

### `LeadsPage`

**Localização:** `src/routes/_app.prospeccao.leads.tsx`

**Responsabilidade:** Página principal com filtros, toggle lista/mapa, tabela paginada, sheet de detalhes.

**Props:** Nenhuma.

**Estado interno (useState):**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| view | "list" \| "map" | "list" | Visualização atual |
| campaignId | string | "all" | Filtro por campanha |
| status | string | "all" | Filtro por status do lead |
| minScore | number | 0 | Score mínimo |
| onlyWa | boolean | false | Apenas leads com WhatsApp |
| page | number | 1 | Página atual da tabela |
| selected | ProspectingLead \| null | null | Lead selecionado para o sheet |
| generatingAI | boolean | false | Gerando diagnóstico IA |
| generatingMsg | boolean | false | Gerando mensagem WhatsApp |
| generatedMessage | string | "" | Mensagem gerada para WhatsApp |

**Constantes:**
```typescript
const PER_PAGE = 10;
const STATUS_OPTIONS: LeadStatus[] = ["new", "qualified", "not_qualified", "whatsapp_opened", "message_sent", "responded", "lost", "do_not_contact"];
```

**Contexto consumido (useApp):**
| Propriedade | Descrição |
|-------------|-----------|
| prospectingLeads | Lista completa de leads |
| setProspectingLeads | Atualiza leads (após diagnóstico ou mudança de status) |
| campaigns | Para dropdown de filtro por campanha |
| niches | Para gerar mensagem baseada no template do nicho |

**Dados filtrados (`useMemo`):**
```typescript
const filtered = prospectingLeads.filter(l => {
  if (campaignId !== "all" && l.campaignId !== campaignId) return false;
  if (status !== "all" && l.status !== status) return false;
  if (l.score < minScore) return false;
  if (onlyWa && !l.hasWhatsapp) return false;
  return true;
});
```

**Dados paginados:**
| Expressão | Descrição |
|-----------|-----------|
| `totalPages` | `Math.max(1, Math.ceil(filtered.length / PER_PAGE))` |
| `pageLeads` | `filtered.slice((page-1) * PER_PAGE, page * PER_PAGE)` |

**Função `updateLead`:**
```typescript
const updateLead = (id: string, patch: Partial<ProspectingLead>) => {
  setProspectingLeads(arr => arr.map(l => l.id === id ? { ...l, ...patch } : l));
  setSelected(curr => curr?.id === id ? { ...curr, ...patch } : curr);
};
```

**Geração IA simulada (`generateDiagnosis`):**
- Delay de 1500ms
- Analisa sinais digitais (website, Instagram, WhatsApp)
- Gera `aiOverview` e `suggestedOffer` mockados
- Atualiza o lead no estado

**Geração de mensagem (`generateMessage`):**
- Delay de 1000ms
- Usa template do nicho ou template fallback
- Substitui `{nome}` e `{cidade}`
- Armazena em `generatedMessage`

**Ação WhatsApp (`openWhatsApp`):**
- Constrói URL `https://wa.me/${phoneNormalized}?text=${msg}`
- Abre em nova aba
- Se status é "new" ou "qualified", atualiza para "whatsapp_opened"

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Toggle Lista/Mapa | Altera `view` |
| Select de campanha | Filtra por campanha |
| Select de status | Filtra por status |
| Slider de score | Filtra por score mínimo |
| Checkbox WhatsApp | Filtra apenas com WhatsApp |
| Clique na linha da tabela | Abre sheet com detalhes do lead |
| Clique "Gerar" (diagnóstico) | Chama `generateDiagnosis` |
| Clique "Gerar" (mensagem) | Chama `generateMessage` |
| Clique "Abrir WhatsApp" | Chama `openWhatsApp` |
| Paginação | Navega entre páginas |

**Renderização condicional:**
- `view === "list"` → renderiza tabela; `view === "map"` → renderiza mapa
- Se filtered.length > PER_PAGE: exibe controles de paginação
- Se pageLeads.length === 0: exibe "Nenhum lead corresponde aos filtros"
- Sheet: aberto apenas se `selected !== null`
- Diagnóstico: exibe overview ou "Nenhum diagnóstico gerado ainda"
- Oferta: exibe apenas se `selected.suggestedOffer` existe

---

### `Signal`

**Localização:** `src/routes/_app.prospeccao.leads.tsx` (componente inline)

**Responsabilidade:** Indicador visual de presença digital (Website, Instagram, WhatsApp).

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| active | boolean | ✅ | Se o sinal está presente |
| icon | React.ElementType | ✅ | Componente ícone (lucide) |
| label | string | ✅ | Nome do sinal |

**Renderização condicional:**
- `active === true`: borda verde (`border-emerald-200`), fundo verde claro
- `active === false`: borda cinza, texto cinza claro

---

### `LeadsMap` (lazy)

**Localização:** `src/components/LeadsMap.tsx`

**Responsabilidade:** Mapa Leaflet com CircleMarkers coloridos conforme score do lead.

**Importação lazy:**
```typescript
const LeadsMap = lazy(() => import("@/components/LeadsMap"));
```

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| leads | ProspectingLead[] | ✅ | Leads para exibir no mapa |
| center | [number, number] | ❌ | Centro do mapa (default: primeiro lead ou Florianópolis) |
| zoom | number | ❌ (default 13) | Zoom inicial |
| height | number \| string | ❌ (default 520) | Altura do container |
| renderPopup | (l: ProspectingLead) ⇒ ReactNode | ❌ | Função para renderizar popup |
| centerMarker | { lat, lng, label } | ❌ | Marcador opcional de centro |

**Estado interno:** Nenhum (componente puro).

**Detalhes de renderização:**
- Usa `MapContainer` do react-leaflet com tiles CartoDB light
- `CircleMarker` para cada lead: raio proporcional ao score (10-22px), cor conforme scoreColor
- Popup customizado via `renderPopup` prop
- Fixa ícone default do Leaflet (patching via `L.Icon.Default.mergeOptions`)

**Efeitos:** Nenhum (componente puro de renderização).

**Nota:** Leaflet requer browser APIs (`window`, `document`), portanto:
- Deve ser carregado com `dynamic(() => import(...), { ssr: false })`
- Envolto em `<ClientOnly>` para evitar erros de SSR

---

## Formato de dados (Data Shape)

```typescript
interface ProspectingLead {
  id: string;
  companyId: string;
  campaignId: string;
  nicheId: string;
  source: string;                       // ex: "overpass"
  name: string;
  phone: string | null;
  phoneNormalized: string | null;      // Código de área completo (ex: 5548...)
  email: string | null;
  websiteUrl: string | null;
  address: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  score: number;                        // 0-100
  status: LeadStatus;
  whatsappStatus: WhatsAppStatus;
  hasWebsite: boolean;
  hasInstagram: boolean;
  hasWhatsapp: boolean;
  rating: number | null;               // 0-5 estrelas
  reviewCount: number | null;
  aiOverview: string | null;
  suggestedOffer: string | null;
  createdAt: string;
}

type LeadStatus =
  | "new" | "qualified" | "not_qualified"
  | "whatsapp_opened" | "message_sent" | "responded"
  | "lost" | "do_not_contact";

type WhatsAppStatus = "unknown" | "probable" | "confirmed" | "invalid";
```

---

## Dados mockados identificados

```typescript
// src/data/mock-prospecting-leads.ts — 7 leads completos
// Cada lead tem dados detalhados de contato, sinais digitais, score, status
// Exemplo do primeiro lead:
{
  id: "plead-001",
  companyId: "company-001",
  campaignId: "campaign-001",
  nicheId: "niche-001",
  source: "overpass",
  name: "Restaurante Sabor do Mar",
  phone: "(48) 3322-1100",
  phoneNormalized: "5548332211000",
  email: null,
  websiteUrl: null,
  address: "Rua Felipe Schmidt, 120 - Centro",
  city: "Florianópolis",
  state: "SC",
  latitude: -27.5967,
  longitude: -48.5494,
  score: 82,
  status: "qualified",
  whatsappStatus: "probable",
  hasWebsite: false,
  hasInstagram: true,
  hasWhatsapp: true,
  rating: 4.5,
  reviewCount: 87,
  aiOverview: "Restaurante local com boa avaliação...",
  suggestedOffer: "Site profissional + cardápio digital + Google Meu Negócio otimizado",
  createdAt: "2024-11-15T14:35:00Z",
}
```

No projeto real, esses dados devem vir de:
- **API externa** (Google Places / Overpass / scraping) durante execução da campanha
- **Banco de dados** (tabela `prospecting_leads`) após persistência

---

## Observações para migração

1. **Must be `"use client"`**: Toda a página é interativa (filtros, sheet, mapa, geração de conteúdo)
2. **Mapa Leaflet**: Importar com `dynamic(() => import(...), { ssr: false })` — substitui a necessidade de `ClientOnly`
3. **Geração IA mock**: Substituir por chamada real a API de IA (OpenAI, Anthropic) via Server Action
4. **Geração de mensagem**: Usar template real do nicho + IA para personalização
5. **Status update**: Mutação local via `updateLead` deve ser substituída por Server Action
6. **Ação WhatsApp**: `window.open` funciona no client — manter
7. **Paginação**: Pode ser convertida para Server Component com search params (`?page=1&status=...`)
8. **Filtros**: Podem virar search params para URLs compartilháveis
9. **Sheet**: Componente `Sheet` shadcn funciona como `"use client"`

---

## Sugestão de schema de banco

```sql
CREATE TABLE prospecting_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES prospecting_campaigns(id) ON DELETE CASCADE,
  niche_id UUID NOT NULL REFERENCES prospecting_niches(id) ON DELETE RESTRICT,
  source VARCHAR(50) NOT NULL DEFAULT 'overpass',
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  phone_normalized VARCHAR(30),
  email VARCHAR(255),
  website_url TEXT,
  address TEXT NOT NULL,
  city VARCHAR(255) NOT NULL,
  state VARCHAR(2) NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  status VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN ('new','qualified','not_qualified','whatsapp_opened','message_sent','responded','lost','do_not_contact')),
  whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (whatsapp_status IN ('unknown','probable','confirmed','invalid')),
  has_website BOOLEAN NOT NULL DEFAULT FALSE,
  has_instagram BOOLEAN NOT NULL DEFAULT FALSE,
  has_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  rating REAL CHECK (rating >= 0 AND rating <= 5),
  review_count INTEGER,
  ai_overview TEXT,
  suggested_offer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_company_id ON prospecting_leads(company_id);
CREATE INDEX idx_leads_campaign_id ON prospecting_leads(campaign_id);
CREATE INDEX idx_leads_niche_id ON prospecting_leads(niche_id);
CREATE INDEX idx_leads_status ON prospecting_leads(status);
CREATE INDEX idx_leads_score ON prospecting_leads(score DESC);
```

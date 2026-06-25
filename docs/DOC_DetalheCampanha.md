# Detalhe da Campanha

## Rota
Atual: `/prospeccao/campanhas/$id` → Sugerida: `/(app)/prospeccao/campanhas/[id]/page.tsx`

## Propósito
Página de detalhamento de uma campanha específica. Exibe o nome, nicho, localização, status, 4 métricas (total encontrados, qualificados, WhatsApp provável, abordados) e um mapa interativo com os leads geolocalizados. Permite reexecutar a busca e navegar para a lista de leads.

---

## Componentes utilizados

- `Card`, `CardContent` (shadcn/ui)
- `Button` (shadcn/ui)
- `Badge` (shadcn/ui)
- `ArrowLeft`, `Play`, `Users`, `MapPin`, `Loader2`, `Target`, `CheckCircle2`, `MessageCircle`, `Send` (lucide-react)
- `Link` (TanStack Router → Next.js `next/link`)
- `ClientOnly` (componente de guarda de hidratação)
- `CampaignMap` (componente lazy de mapa)
- `toast` (sonner)

---

## Componentes — Detalhamento

### `CampanhaDetailPage`

**Localização:** `src/routes/_app.prospeccao.campanhas.$id.tsx`

**Responsabilidade:** Página de detalhe que carrega a campanha pelo ID, calcula métricas e renderiza o mapa.

**Props:** Nenhuma.

**Parâmetros de rota:**
| Parâmetro | Fonte | Descrição |
|-----------|-------|-----------|
| id | `Route.useParams()` | ID da campanha |

**Contexto consumido (useApp):**
| Propriedade | Descrição |
|-------------|-----------|
| campaigns | Array de campanhas (busca por id) |
| setCampaigns | Atualiza campanha (para reexecutar busca) |
| niches | Para exibir nome do nicho |
| prospectingLeads | Para filtrar leads da campanha |

**Dados derivados:**
| Expressão | Descrição |
|-----------|-----------|
| `campaign` | `campaigns.find(c ⇒ c.id === id)` — gera `notFound()` se não achar |
| `niche` | `niches.find(n ⇒ n.id === campaign.nicheId)` |
| `leads` | `prospectingLeads.filter(l ⇒ l.campaignId === campaign.id)` |
| `qualified` | leads com score >= 70 |
| `whatsappLikely` | leads com whatsappStatus diferente de "unknown" e "invalid" |
| `reached` | leads com status de abordagem (whatsapp_opened, message_sent, responded) |

**Eventos / Callbacks:**
| Evento | Ação |
|--------|------|
| Clique "Executar busca" | Muda status para "running", após 2s adiciona 10-35 leads aleatórios, muda para "completed" |
| Clique "Ver leads" | Navega para `/prospeccao/leads` |

**Renderização condicional:**
- Se campanha não encontrada: `throw notFound()`
- Badge de status com `Loader2` animado quando running
- Botão "Executar" desabilitado durante execução

---

### `Metric`

**Localização:** `src/routes/_app.prospeccao.campanhas.$id.tsx` (componente inline)

**Responsabilidade:** Card de métrica individual.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| label | string | ✅ | Nome da métrica |
| value | number | ✅ | Valor numérico |
| icon | React.ReactNode | ✅ | Ícone decorativo |
| color | string | ✅ | Classes Tailwind para cor de fundo/texto |

---

### `CampaignMap` (lazy)

**Localização:** `src/components/CampaignMap.tsx`

**Responsabilidade:** Componente de mapa Leaflet com círculos para cada lead da campanha. Ver detalhes completos em `DOC_Leads.md` (seção LeadsMap).

**Importação lazy:**
```typescript
const CampaignMap = lazy(() => import("@/components/CampaignMap"));
```

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| campaign | ProspectingCampaign | ✅ | Dados da campanha (centro do mapa) |
| leads | ProspectingLead[] | ✅ | Leads para exibir como CircleMarkers |

---

### `ClientOnly`

**Localização:** `src/components/ClientOnly.tsx`

**Responsabilidade:** Evita hidratação incorreta de componentes que dependem do browser (como Leaflet). Renderiza `fallback` até o componente montar no cliente.

**Props:**
| Prop | Tipo | Obrigatório | Descrição |
|------|------|-------------|-----------|
| children | ReactNode | ✅ | Conteúdo a ser renderizado apenas no cliente |
| fallback | ReactNode | ❌ (default null) | Placeholder durante SSR |

**Estado interno:**
| Estado | Tipo | Valor inicial | Descrição |
|--------|------|---------------|-----------|
| mounted | boolean | false | Alterna para true no primeiro `useEffect` |

**Efeitos:**
| Efeito | Quando roda | O que faz |
|--------|-------------|-----------|
| `useEffect(() ⇒ setMounted(true), [])` | 1x após montagem | Marca como mounted, permitindo renderização do children |

---

## Formato de dados (Data Shape)

Mesmos tipos de `ProspectingCampaign` e `ProspectingLead` já documentados em `DOC_Campanhas.md` e `DOC_Leads.md`.

---

## Dados mockados identificados

A página consome do AppContext (`MOCK_CAMPAIGNS`, `MOCK_NICHES`, `MOCK_PROSPECTING_LEADS`). Nenhum dado mockado extra.

---

## Observações para migração

1. **Parâmetro de rota**: `Route.useParams().id` → `params.id` do Next.js (`export default async function Page({ params }: { params: Promise<{ id: string }> })`)
2. **Not Found**: `throw notFound()` do TanStack → `notFound()` do Next.js (`next/navigation`)
3. **Mapa**: 
   - `CampaignMap` deve ser importado com `dynamic(() => import(...), { ssr: false })`
   - `ClientOnly` pode ser substituído pelo `ssr: false` do `dynamic`
4. **Must be `"use client"`**: Página inteira precisa de client component devido ao mapa + interações
5. **Execução real**: Substituir `setTimeout` por Server Action real de busca
6. **SEO**: `generateMetadata()` com nome da campanha como título
7. **Navegação**: Voltar para campanhas com `next/link` + `useRouter().back()`

---

## Sugestão de schema de banco

Nenhuma tabela nova. A página usa `prospecting_campaigns` e `prospecting_leads`.

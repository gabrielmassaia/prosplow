# Aula 3 — 4. Integração com a Prospecção

> Parte de `aula-3`. Pré-requisito: `3_Interface-Kanban.md`. Próximo arquivo: `5_Verificacao-e-Armadilhas.md`.

## Task 10: Integração — botão "Converter para CRM" em `LeadsContent`

No sheet de detalhe já existente na página de Leads (Fase 2), foi adicionado um botão "Converter para CRM" (ícone `Kanban`), desabilitado quando o lead já foi convertido (checagem via `convertedProspectingLeadIds`, vindo do bootstrap). Ao converter com sucesso, um toast com ação "Ver no funil" navega para `/funil`.

- [x] **Modificar `src/app/(protected)/prospeccao/leads/_components/LeadsContent.tsx`**

```diff
 import {
   Camera,
   Globe,
+  Kanban,
   List,
   Loader2,
   Map,
@@
 import type { Campaign } from "@/domain/repositories/ICampaignRepository";
 import type { Lead, LeadStatus } from "@/domain/repositories/ILeadRepository";
+import { convertProspectingLeadAction } from "@/app/actions/leads/convert-prospecting-lead";
 import { generateDiagnosisAction } from "@/app/actions/leads/generate-diagnosis";
 import { generateMessageAction } from "@/app/actions/leads/generate-message";
 import { updateLeadStatusAction } from "@/app/actions/leads/update-lead-status";
@@
 interface LeadsContentProps {
   initialLeads: Lead[];
   initialCampaigns: Campaign[];
+  initialConvertedProspectingLeadIds?: string[];
 }

-export function LeadsContent({ initialLeads, initialCampaigns }: LeadsContentProps) {
+export function LeadsContent({
+  initialLeads,
+  initialCampaigns,
+  initialConvertedProspectingLeadIds = [],
+}: LeadsContentProps) {
   const [leads, setLeads] = useState<Lead[]>(initialLeads);
   const [campaigns] = useState<Campaign[]>(initialCampaigns);
+  const [convertedIds, setConvertedIds] = useState<Set<string>>(
+    new Set(initialConvertedProspectingLeadIds)
+  );
   const [view, setView] = useState<"list" | "map">("list");
   const [campaignId, setCampaignId] = useState("all");
   const [status, setStatus] = useState("all");
@@
   const [generatedMessage, setGeneratedMessage] = useState("");
+  const [converting, setConverting] = useState(false);
@@
+  async function handleConvert() {
+    if (!selected) return;
+    setConverting(true);
+    const result = await convertProspectingLeadAction(selected.id);
+    setConverting(false);
+    if (!result.ok) {
+      toast.error(result.error);
+      return;
+    }
+    setConvertedIds((prev) => new Set(prev).add(selected.id));
+    toast.success("Lead convertido para o CRM", {
+      action: { label: "Ver no funil", onClick: () => window.location.assign("/funil") },
+    });
+  }
+
   function openWhatsApp() {
     ...
   }
```

E, dentro do sheet de detalhe (JSX), logo antes do bloco "Mudar status":

```tsx
{/* Converter para CRM */}
<div>
  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
    Funil comercial
  </p>
  <Button
    variant="outline"
    className="w-full"
    disabled={converting || convertedIds.has(selected.id)}
    onClick={handleConvert}
  >
    {converting ? (
      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
    ) : (
      <Kanban className="mr-1.5 h-4 w-4" />
    )}
    {convertedIds.has(selected.id) ? "Já convertido" : "Converter para CRM"}
  </Button>
</div>
```

- [x] **Modificar `src/app/(protected)/prospeccao/leads/page.tsx`** — repassar `convertedProspectingLeadIds`:

```diff
 async function LeadsDataLoader() {
-  const { leads, campaigns } = await getLeadsBootstrapAction();
-  return <LeadsContent initialLeads={leads} initialCampaigns={campaigns} />;
+  const { leads, campaigns, convertedProspectingLeadIds } = await getLeadsBootstrapAction();
+  return (
+    <LeadsContent
+      initialLeads={leads}
+      initialCampaigns={campaigns}
+      initialConvertedProspectingLeadIds={convertedProspectingLeadIds}
+    />
+  );
 }
```

---

## Task 11: Sidebar — novo item de navegação

Em `src/components/layout/Sidebar.tsx`, adicionado `{ href: "/funil", label: "Funil", icon: Kanban, exact: false }` logo após "Leads" em `navItems` — reflete o fluxo conceitual prospecção → funil.

```diff
-import { BarChart2, Crosshair, LogOut, Map, Tag, Users } from "lucide-react";
+import { BarChart2, Crosshair, Kanban, LogOut, Map, Tag, Users } from "lucide-react";
@@
   { href: "/prospeccao/nichos", label: "Nichos", icon: Tag, exact: false },
   { href: "/prospeccao/campanhas", label: "Campanhas", icon: Map, exact: false },
   { href: "/prospeccao/leads", label: "Leads", icon: Users, exact: false },
+  { href: "/funil", label: "Funil", icon: Kanban, exact: false },
 ];
```

---

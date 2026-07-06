import { Target } from "lucide-react";

import { requireCompany, requireUser } from "@/lib/tenant";

export default async function ProspeccaoPage() {
  const user = await requireUser();
  const { company } = await requireCompany(user.id);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="flex flex-1 flex-col p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Prospecção</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Olá, {firstName}. Bem-vindo de volta à{" "}
          <span className="font-medium text-foreground">{company.name}</span>.
        </p>
      </div>

      {/* Empty state */}
      <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Target className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">Nenhuma campanha ainda</h2>
        <p className="mt-1.5 max-w-sm text-center text-sm text-muted-foreground">
          Na Fase 2 vamos criar campanhas de prospecção com busca geolocalizada e geração de leads
          automática via Cloudflare AI.
        </p>
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Play,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import type { Lead } from "@/domain/repositories/ILeadRepository";
import type { Niche } from "@/domain/repositories/INicheRepository";
import { runCampaignAction } from "@/app/actions/campanhas/run-campaign";
import { CAMPAIGN_STATUS_CLASSES, CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const CampaignMap = dynamic(() => import("@/components/CampaignMap"), { ssr: false });

function Metric({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function CampanhaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [niche, setNiche] = useState<Niche | null>(null);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/campanhas/${id}`).then((r) => r.json()),
      fetch(`/api/campanhas/${id}/leads`).then((r) => r.json()),
    ])
      .then(([c, l]) => {
        if (!c || c.error) {
          router.replace("/prospeccao/campanhas");
          return;
        }
        setCampaign(c.campaign);
        setNiche(c.niche);
        setLeads(l);
      })
      .finally(() => setLoading(false));
  }, [id, router]);

  // Polling enquanto campanha está em execução background (next/server after())
  useEffect(() => {
    if (campaign?.status !== "running") return;
    const timer = setInterval(async () => {
      const data = await fetch(`/api/campanhas/${id}`).then((r) => r.json());
      if (!data?.campaign) return;
      const fresh: Campaign = data.campaign;
      if (fresh.status === "completed") {
        clearInterval(timer);
        setCampaign(fresh);
        const updatedLeads = await fetch(`/api/campanhas/${id}/leads`).then((r) => r.json());
        setLeads(updatedLeads);
        setTimeout(() => toast.success(`${fresh.totalFound} leads encontrados`), 0);
      } else if (fresh.status === "failed") {
        clearInterval(timer);
        setCampaign(fresh);
        setTimeout(() => toast.error("Campanha falhou ao buscar leads"), 0);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [campaign?.status, id]);

  async function handleRun() {
    if (!campaign) return;
    setRunning(true);
    setCampaign((c) => (c ? { ...c, status: "running" } : c));
    // action retorna imediatamente — AI + Overpass rodam em background via after()
    await runCampaignAction(campaign.id);
    setRunning(false);
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!campaign) return null;

  const qualified = leads.filter((l) => l.score >= 70).length;
  const whatsappLikely = leads.filter(
    (l) => l.whatsappStatus === "probable" || l.whatsappStatus === "confirmed"
  ).length;
  const reached = leads.filter((l) =>
    ["whatsapp_opened", "message_sent", "responded"].includes(l.status)
  ).length;

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-6 flex items-center gap-4">
        <Link
          href="/prospeccao/campanhas"
          className={cn(
            "inline-flex h-8 w-8 items-center justify-center rounded-lg border-transparent text-sm font-medium transition-all hover:bg-muted hover:text-foreground"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">{campaign.name}</h1>
          <p className="text-sm text-muted-foreground">
            {niche?.name} · {campaign.city}, {campaign.state}
            {campaign.cep ? ` (${campaign.cep.slice(0, 5)}-${campaign.cep.slice(5)})` : ""} · raio {campaign.radiusKm}km · máx {campaign.maxResults} resultados
          </p>
        </div>
        <Badge className={CAMPAIGN_STATUS_CLASSES[campaign.status]}>
          {CAMPAIGN_STATUS_LABEL[campaign.status]}
        </Badge>
        <Button onClick={handleRun} disabled={running || campaign.status === "running"} size="sm">
          {running || campaign.status === "running" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-4 w-4" />
          )}
          Executar busca
        </Button>
      </div>

      {/* Métricas */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Total encontrados"
          value={campaign.totalFound}
          icon={<Users className="h-4 w-4" />}
          color="text-primary bg-primary/10"
        />
        <Metric
          label="Qualificados (70+)"
          value={qualified}
          icon={<Target className="h-4 w-4" />}
          color="text-emerald-600 bg-emerald-50"
        />
        <Metric
          label="WhatsApp provável"
          value={whatsappLikely}
          icon={<MessageCircle className="h-4 w-4" />}
          color="text-green-600 bg-green-50"
        />
        <Metric
          label="Abordados"
          value={reached}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="text-violet-600 bg-violet-50"
        />
      </div>

      {/* Parâmetros */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Parâmetros da busca</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <span className="text-muted-foreground">Localização</span>
            <p className="font-medium">
              {campaign.city}, {campaign.state}
              {campaign.cep ? ` · ${campaign.cep.slice(0, 5)}-${campaign.cep.slice(5)}` : ""}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Coordenadas</span>
            <p className="font-medium tabular-nums">
              {campaign.latitude.toFixed(4)}, {campaign.longitude.toFixed(4)}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Raio / Máximo</span>
            <p className="font-medium">{campaign.radiusKm}km · {campaign.maxResults} leads</p>
          </div>
        </div>
      </div>

      {/* Mapa */}
      {leads.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border">
          <CampaignMap campaign={campaign} leads={leads} />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border py-20 text-sm text-muted-foreground">
          Execute a campanha para visualizar os leads no mapa
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Link
            href="/prospeccao/leads"
            className="inline-flex h-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium transition-all hover:bg-muted hover:text-foreground"
          >
            Ver todos os leads
          </Link>
        </div>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCampanhaDetailBootstrapAction } from "@/app/actions/campanhas/get-campanha-detail-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { CampanhaDetailContent } from "./_components/CampanhaDetailContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Detalhe da campanha" };
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CampanhaDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <BasePageLayout>
      <Suspense
        fallback={<LoadingContent title="Carregando campanha..." withHeader={false} rows={4} />}
      >
        <CampanhaDetailDataLoader campaignId={id} />
      </Suspense>
    </BasePageLayout>
  );
}

async function CampanhaDetailDataLoader({ campaignId }: { campaignId: string }) {
  const result = await getCampanhaDetailBootstrapAction(campaignId);
  if (!result.ok) redirect("/prospeccao/campanhas");

  return (
    <CampanhaDetailContent
      initialCampaign={result.campaign}
      initialNiche={result.niche}
      initialLeads={result.leads}
    />
  );
}

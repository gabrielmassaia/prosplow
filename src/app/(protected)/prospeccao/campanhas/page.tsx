import type { Metadata } from "next";
import { Suspense } from "react";

import { getCampanhasBootstrapAction } from "@/app/actions/campanhas/get-campanhas-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { CampanhasContent } from "./_components/CampanhasContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Campanhas" };
}

export default function CampanhasPage() {
  return (
    <BasePageLayout title="Campanhas" description="Buscas georreferenciadas por nicho">
      <Suspense
        fallback={<LoadingContent title="Carregando campanhas..." withHeader={false} rows={5} />}
      >
        <CampanhasDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function CampanhasDataLoader() {
  const { campaigns, niches } = await getCampanhasBootstrapAction();
  return <CampanhasContent initialCampaigns={campaigns} initialNiches={niches} />;
}

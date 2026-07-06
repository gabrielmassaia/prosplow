import type { Metadata } from "next";
import { Suspense } from "react";

import { getNichosBootstrapAction } from "@/app/actions/nichos/get-nichos-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { NichosContent } from "./_components/NichosContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Nichos" };
}

export default function NichosPage() {
  return (
    <BasePageLayout title="Nichos" description="Segmentos de mercado que você prospecta">
      <Suspense fallback={<LoadingContent title="Carregando nichos..." withHeader={false} rows={4} />}>
        <NichosDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function NichosDataLoader() {
  const { niches } = await getNichosBootstrapAction();
  return <NichosContent initialNiches={niches} />;
}

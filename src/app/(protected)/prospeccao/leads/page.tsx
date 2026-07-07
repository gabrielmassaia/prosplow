import type { Metadata } from "next";
import { Suspense } from "react";

import { getLeadsBootstrapAction } from "@/app/actions/leads/get-leads-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { LeadsContent } from "./_components/LeadsContent";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Leads" };
}

export default function LeadsPage() {
  return (
    <BasePageLayout>
      <Suspense
        fallback={<LoadingContent title="Carregando leads..." withHeader={false} rows={6} />}
      >
        <LeadsDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function LeadsDataLoader() {
  const { leads, campaigns, convertedProspectingLeadIds } = await getLeadsBootstrapAction();
  return (
    <LeadsContent
      initialLeads={leads}
      initialCampaigns={campaigns}
      initialConvertedProspectingLeadIds={convertedProspectingLeadIds}
    />
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";

import { getFunilBootstrapAction } from "@/app/actions/funil/get-funil-bootstrap";
import { BasePageLayout } from "@/components/BasePageLayout/BasePageLayout";
import { LoadingContent } from "@/components/shared/loading-content";

import { FunilContent } from "./_components/FunilContentLoader";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Funil" };
}

export default function FunilPage() {
  return (
    <BasePageLayout>
      <Suspense
        fallback={<LoadingContent title="Carregando funil..." withHeader={false} rows={6} />}
      >
        <FunilDataLoader />
      </Suspense>
    </BasePageLayout>
  );
}

async function FunilDataLoader() {
  const { stages, leads } = await getFunilBootstrapAction();
  return <FunilContent initialStages={stages} initialLeads={leads} />;
}

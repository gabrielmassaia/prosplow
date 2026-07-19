"use server";

import type { Campaign } from "@/domain/repositories/ICampaignRepository";
import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleCampaignRepository } from "@/infrastructure/repositories/DrizzleCampaignRepository";

// Leitura sob demanda chamada do CLIENTE (polling enquanto uma campanha está "running").
// A carga inicial da página é feita direto no Server Component (ver campanhas/page.tsx);
// esta action existe porque o navegador não fala com o banco — todo read client-side
// precisa passar por uma Server Action.
export async function listCampaignsAction(): Promise<Campaign[]> {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const campaignRepo = new DrizzleCampaignRepository(db);
  return campaignRepo.findAllByCompany(companyId);
}

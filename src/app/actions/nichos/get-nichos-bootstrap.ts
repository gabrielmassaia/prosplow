"use server";

import { requireCompany, requireUser } from "@/lib/tenant";
import { db } from "@/infrastructure/db";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function getNichosBootstrapAction() {
  const user = await requireUser();
  const { companyId } = await requireCompany(user.id);

  const repo = new DrizzleNicheRepository(db);
  const niches = await repo.findAllByCompany(companyId);
  return { niches };
}

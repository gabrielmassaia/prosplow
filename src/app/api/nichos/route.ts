import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { db } from "@/infrastructure/db";
import { DrizzleCompanyRepository } from "@/infrastructure/repositories/DrizzleCompanyRepository";
import { DrizzleNicheRepository } from "@/infrastructure/repositories/DrizzleNicheRepository";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const companyRepo = new DrizzleCompanyRepository(db);
  const company = await companyRepo.findByUserId(session.user.id);
  if (!company) return NextResponse.json([], { status: 403 });

  const nicheRepo = new DrizzleNicheRepository(db);
  const niches = await nicheRepo.findAllByCompany(company.id);
  return NextResponse.json(niches);
}

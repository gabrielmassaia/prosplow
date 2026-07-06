import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/infrastructure/db";
import { companiesTable, companyMembersTable } from "@/infrastructure/db/schema";
import { auth } from "@/lib/auth";

export async function requireUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    redirect("/login");
  }

  return session.user;
}

export async function redirectIfAuthenticated(destination = "/prospeccao") {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect(destination);
  }
}

export async function requireCompany(userId: string) {
  const result = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      slug: companiesTable.slug,
    })
    .from(companyMembersTable)
    .innerJoin(companiesTable, eq(companyMembersTable.companyId, companiesTable.id))
    .where(eq(companyMembersTable.userId, userId))
    .limit(1);

  if (!result[0]) {
    redirect("/login");
  }

  return { companyId: result[0].id, company: result[0] };
}

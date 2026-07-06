"use server";

import { z } from "zod";

import { auth } from "@/lib/auth";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

export async function login(formData: {
  email: string;
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = loginSchema.safeParse(formData);

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const response = await auth.api.signInEmail({ body: parsed.data, asResponse: true });

  if (!response.ok) {
    const err = (await response.json()) as { message?: string };
    return { ok: false, error: err.message ?? "Credenciais inválidas" };
  }

  return { ok: true };
}

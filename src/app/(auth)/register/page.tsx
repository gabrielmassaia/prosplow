"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { signup } from "@/app/actions/auth/signup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = form.get("name") as string;
    const email = form.get("email") as string;
    const password = form.get("password") as string;
    const companyName = form.get("companyName") as string;

    const result = await signup({ name, email, password, companyName });

    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }

    const { error: signInErr } = await authClient.signIn.email({ email, password });

    setLoading(false);

    if (signInErr) {
      setError("Conta criada. Tente fazer login.");
      return;
    }

    router.push("/prospeccao");
  }

  return (
    <div className="w-full">
      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Criar conta</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Comece a prospectar clientes hoje mesmo
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error */}
        {error && (
          <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3.5 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Nome */}
        <div className="space-y-1.5">
          <Label htmlFor="name">Seu nome</Label>
          <Input id="name" name="name" required placeholder="João Silva" className="h-10" />
        </div>

        {/* Agência */}
        <div className="space-y-1.5">
          <Label htmlFor="companyName">Nome da agência</Label>
          <Input
            id="companyName"
            name="companyName"
            required
            placeholder="Acme Marketing"
            className="h-10"
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            placeholder="voce@empresa.com"
            className="h-10"
          />
        </div>

        {/* Senha */}
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              placeholder="Mínimo 8 caracteres"
              className="h-10 pr-10"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? "Criando conta..." : "Criar conta grátis"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem conta?{" "}
        <Link
          href="/login"
          className="font-medium text-primary transition-colors hover:text-primary/75"
        >
          Entrar
        </Link>
      </p>
    </div>
  );
}

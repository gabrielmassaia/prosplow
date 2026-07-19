"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Error boundary do segmento protegido: um erro em qualquer página dentro de (protected)
// é capturado aqui, mantendo a sidebar/shell no lugar. O error.tsx global só entra se o
// próprio layout protegido falhar.
export default function ProtectedError({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Card className="max-w-sm text-center">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Algo deu errado</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Ocorreu um erro ao carregar esta página. Tente novamente.
            </p>
          </div>
          <Button variant="outline" onClick={reset}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

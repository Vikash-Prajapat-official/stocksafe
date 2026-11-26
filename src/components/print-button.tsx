"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function PrintButton({ label }: { label?: string }) {
  const tc = useTranslations("common");
  return (
    <Button variant="outline" onClick={() => window.print()}>
      {label ?? tc("print")}
    </Button>
  );
}

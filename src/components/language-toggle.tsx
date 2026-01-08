"use client";

import * as React from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRouter } from "next/navigation"; // Note: next-intl usually recommends its own router, but we are doing client-side switch for simple app

export function LanguageToggle() {
  // In a real next-intl app with routing, we'd use usePathname and useRouter from next-intl/client
  // But since we set static locale in i18n.ts for now, we need to implement cookie switching or route switching.
  // For this MVP, let's just stick to the default locale being German as requested.
  // To enable dynamic switching, we'd need to restructure to [locale]/layout.tsx.
  
  // However, we can use a cookie approach if we update i18n.ts to read from cookies.
  
  const switchLanguage = (locale: string) => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/`;
    window.location.reload();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="border-border">
          <Languages className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Switch Language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => switchLanguage("de")}>
          Deutsch
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => switchLanguage("en")}>
          English
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Menu, BarChart3, Database, Settings, Bot, FileText, Sun, Moon, Languages, Check } from "lucide-react";
import { useTheme } from "next-themes";

export function HeaderMenu() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  // Get current locale from cookie
  const getCurrentLocale = () => {
    if (typeof document !== 'undefined') {
      const match = document.cookie.match(/NEXT_LOCALE=([^;]+)/);
      return match ? match[1] : 'de'; // Default to German
    }
    return 'de';
  };

  const currentLocale = getCurrentLocale();

  const handleItemClick = (eventName: string) => {
    setOpen(false);
    // Small delay to allow dropdown to close before dialog opens
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(eventName));
    }, 50);
  };

  const switchLanguage = (locale: string) => {
    document.cookie = `NEXT_LOCALE=${locale}; path=/`;
    window.location.reload();
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Menu className="h-4 w-4" />
          <span className="hidden sm:inline">Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => handleItemClick('openStatistics')} className="gap-2 cursor-pointer">
          <BarChart3 className="h-4 w-4" />
          Statistics
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleItemClick('openDatabaseManager')} className="gap-2 cursor-pointer">
          <Database className="h-4 w-4" />
          Database Manager
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleItemClick('openFiltrationConditions')} className="gap-2 cursor-pointer">
          <Settings className="h-4 w-4" />
          Filtration Conditions
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleItemClick('openAIConfig')} className="gap-2 cursor-pointer">
          <Bot className="h-4 w-4" />
          AI Configuration
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleItemClick('openDocumentation')} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4" />
          Documentation
        </DropdownMenuItem>
        
        <DropdownMenuSeparator />
        
        <DropdownMenuItem 
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} 
          className="gap-2 cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-4 w-4" />
              Light Mode
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              Dark Mode
            </>
          )}
        </DropdownMenuItem>
        
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 cursor-pointer">
            <Languages className="h-4 w-4" />
            Language
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuItem 
                onClick={() => switchLanguage('en')} 
                className="gap-2 cursor-pointer"
              >
                {currentLocale === 'en' && <Check className="h-4 w-4" />}
                {currentLocale !== 'en' && <span className="w-4" />}
                English
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => switchLanguage('de')} 
                className="gap-2 cursor-pointer"
              >
                {currentLocale === 'de' && <Check className="h-4 w-4" />}
                {currentLocale !== 'de' && <span className="w-4" />}
                Deutsch
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

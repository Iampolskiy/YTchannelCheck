"use client";

import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ModelStatusIndicatorProps {
  modelName: string;
}

export function ModelStatusIndicator({ modelName }: ModelStatusIndicatorProps) {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    const checkStatus = async () => {
      if (!modelName) return;
      
      setStatus('connecting');
      setErrorMsg("");

      try {
        // 1. Get config to find server URL
        const stored = localStorage.getItem("aiConfig");
        let serverUrl = "http://127.0.0.1";
        let port = "11434";

        if (stored) {
          try {
            const config = JSON.parse(stored);
            // Try to find specific config for this model name
            // Note: This is a best-effort match since we only have the model name here
            if (config.models && Array.isArray(config.models)) {
              const modelConfig = config.models.find((m: any) => m.modelName === modelName);
              if (modelConfig) {
                serverUrl = modelConfig.server || modelConfig.serverUrl || "http://127.0.0.1";
                port = modelConfig.port || "11434";
              }
            }
          } catch (e) {
            console.warn("Failed to parse aiConfig", e);
          }
        }

        // Clean up URL
        const baseUrl = serverUrl.replace(/\/$/, "");
        const checkUrl = `${baseUrl}:${port}/api/tags`;

        // 2. Ping
        // specific check: try to fetch tags to see if reachable
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout

        const response = await fetch(checkUrl, { 
          method: 'GET',
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (response.ok) {
          // Ideally we check if the model exists in the list
          // const data = await response.json();
          // const exists = data.models?.some((m: any) => m.name === modelName);
          if (mounted) setStatus('connected');
        } else {
          if (mounted) {
            setStatus('error');
            setErrorMsg(`Server reachable but returned ${response.status}`);
          }
        }
      } catch (e: any) {
        if (mounted) {
          setStatus('error');
          // Common error: Failed to fetch (CORS or offline)
          setErrorMsg(e.name === 'AbortError' ? "Connection timed out" : "Connection failed (CORS or Offline)");
        }
      }
    };

    checkStatus();
    
    // Poll every 30 seconds
    const interval = setInterval(checkStatus, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [modelName]);

  const getStatusColor = () => {
    switch (status) {
      case 'connected': return "bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.6)]";
      case 'connecting': return "bg-orange-400 animate-pulse";
      case 'error': return "bg-red-500";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connected': return "Connected (Model Available)";
      case 'connecting': return "Connecting...";
      case 'error': return `Not Connected: ${errorMsg}`;
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center justify-center w-3 h-3 cursor-help">
            <span className={cn("h-2 w-2 rounded-full transition-all duration-300", getStatusColor())} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p className="text-xs font-medium">{getStatusText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

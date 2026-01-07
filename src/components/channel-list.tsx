"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useChannels, useStats } from "@/lib/hooks";
import { useState } from "react";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface ChannelListProps {
  status: 'unchecked' | 'prefiltered' | 'positive' | 'negative';
  title: string;
  badgeVariant?: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info";
  actionButton?: React.ReactNode;
  showExport?: boolean;
}

export function ChannelList({ status, title, badgeVariant = "secondary", actionButton, showExport }: ChannelListProps) {
  // Default to 20 per user request
  const [limit, setLimit] = useState(20);
  const { channels, isLoading } = useChannels(status, limit);
  const { stats } = useStats();

  const count = stats ? stats[status as keyof typeof stats] : 0;
  
  // Auto-expand if channels exist, otherwise collapse
  const defaultOpen = count > 0 ? "list" : undefined;

  const handleExport = async () => {
    const toastId = toast.loading("Exporting...");
    try {
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          status,
          format: 'csv', // Default to CSV for now
          sources: {
            includeSocialBlade: true,
            campaignIds: [], // All campaigns
            matchAll: false
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the filename from headers or default
      const disposition = response.headers.get('Content-Disposition');
      let filename = `youtube-channels-${status}.csv`;
      if (disposition && disposition.indexOf('attachment') !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1]) { 
          filename = matches[1].replace(/['"]/g, '');
        }
      }

      // Convert to blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast.success('Export downloaded successfully!', { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error('Export failed', { id: toastId });
    }
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <Accordion type="single" collapsible defaultValue={defaultOpen} className="w-full h-full flex flex-col">
        <AccordionItem value="list" className="border-none flex flex-col h-full overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between shrink-0 py-4">
            <div className="flex items-center gap-2 flex-1">
              <AccordionTrigger className="hover:no-underline py-0 flex-1 justify-start gap-2 text-lg">
                <CardTitle className="text-lg">{title}</CardTitle>
                <Badge variant={badgeVariant} className="ml-2">{count}</Badge>
              </AccordionTrigger>
            </div>
            
            <div className="flex gap-2 items-center">
              {(showExport || status === 'negative' || status === 'positive') && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">Limit:</span>
                    <Input 
                      type="number" 
                      min="1" 
                      className="w-16 h-8 text-xs" 
                      value={limit}
                      onChange={(e) => setLimit(Number(e.target.value))}
                    />
                  </div>
                  <Button variant="outline" onClick={handleExport} size="sm" className="h-8 text-xs">📤 Export</Button>
                </>
              )}
              {actionButton}
            </div>
          </CardHeader>
          
          <AccordionContent className="flex-1 overflow-hidden p-0 data-[state=closed]:flex-0">
            <CardContent className="h-full p-0 flex flex-col">
              {isLoading ? (
                <div className="flex-1 flex items-center justify-center text-muted-foreground">
                  Loading channels...
                </div>
              ) : channels && channels.length > 0 ? (
                <div className="flex-1 overflow-y-auto divide-y border-t scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                  {channels.map((ch) => (
                    <div key={ch._id} className="p-4 flex items-center gap-4 hover:bg-accent/50 transition-colors">
                      <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground font-bold shrink-0">
                        {(ch.channelInfo?.title || ch.youtubeId)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">
                          <a href={ch.youtubeUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
                            {ch.channelInfo?.title || ch.youtubeId}
                          </a>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {ch.channelInfo?.country || '?'} · {ch.channelInfo?.handle || ''}
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {ch.prefilterCheck?.failedRule && (
                          <Badge variant="destructive" className="text-xs">
                            Fail: {ch.prefilterCheck.failedRule}
                          </Badge>
                        )}
                        {ch.sources?.socialBlade && (
                          <Badge variant="info" className="text-xs">SB</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground border-t bg-muted/5">
                  <div className="text-4xl mb-3 opacity-30">📭</div>
                  <p className="font-medium">No channels found</p>
                  <p className="text-xs mt-1 max-w-xs mx-auto opacity-70">
                    {status === 'unchecked' && "Import channels via Manual Import or SocialBlade to see them here."}
                    {status === 'prefiltered' && "Run the Prefilter Pipeline on unchecked channels to populate this list."}
                    {status === 'positive' && "Channels that pass all filters will appear here."}
                    {status === 'negative' && "Channels that fail checks will appear here."}
                  </p>
                </div>
              )}
            </CardContent>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

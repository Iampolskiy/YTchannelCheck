"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SocialBladeImport } from "@/components/social-blade-import";
import { ManualImport } from "@/components/manual-import";
import { ChannelList } from "@/components/channel-list";
import { useStats } from "@/lib/hooks";
import { api } from "@/lib/api-client";
import { toast } from "sonner";

export default function Home() {
  const [activeTab, setActiveTab] = useState("socialblade");
  const { stats } = useStats();

  const runPipeline = async (endpoint: string) => {
    const toastId = toast.loading("Starting job...");
    try {
      const res = await api<{ ok: true; jobId: string }>(endpoint, { method: 'POST', body: '{}' });
      toast.success(`Job started: ${res.jobId}`, { id: toastId });
      toast.info("Processing in background (SSE coming soon)");
    } catch (error) {
      toast.error('Failed to start job', { id: toastId });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* Header */}
      <header className="bg-white border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center text-xl shadow-md">
              GW
            </div>
            <div>
              <h1 className="text-xl font-bold text-primary tracking-tight">YouTube Channel Filter</h1>
              <p className="text-xs text-muted-foreground font-medium">Powered by Goldweiss</p>
            </div>
          </div>
          <div className="flex gap-2">
             <Button variant="outline" size="sm" className="hidden sm:flex">
               Documentation
             </Button>
          </div>
        </div>
      </header>

      <div className="container py-8 flex-1">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatsCard label="Unchecked" value={stats?.unchecked} />
          <StatsCard label="Prefiltered" value={stats?.prefiltered} />
          <StatsCard label="Positive" value={stats?.positive} className="text-green-600" />
          <StatsCard label="Negative" value={stats?.negative} className="text-destructive" />
          <StatsCard label="Total" value={stats?.total} className="text-secondary" />
        </div>

        <main className="flex flex-col gap-6">
          {/* Navigation Tabs */}
          <div className="flex overflow-x-auto border-b border-border gap-1 pb-px scrollbar-none">
            {[
              { id: "socialblade", label: "SocialBlade Import" },
              { id: "manual", label: "Manual Import" },
              { id: "unchecked", label: "Unchecked", count: stats?.unchecked },
              { id: "prefiltered", label: "Prefiltered", count: stats?.prefiltered },
              { id: "negative", label: "Negative", count: stats?.negative },
              { id: "positive", label: "Positive", count: stats?.positive },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-5 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 flex items-center gap-2 rounded-t-md hover:bg-accent
                  ${activeTab === tab.id 
                    ? "border-secondary text-primary bg-white shadow-sm" 
                    : "border-transparent text-muted-foreground hover:text-foreground"}
                `}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span 
                    className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activeTab === tab.id ? "bg-secondary text-secondary-foreground" : "bg-muted text-muted-foreground"}`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {activeTab === "socialblade" && <SocialBladeImport />}
            
            {activeTab === "manual" && <ManualImport />}

            {activeTab === "unchecked" && (
              <ChannelList 
                status="unchecked" 
                title="Unchecked Channels" 
                badgeVariant="secondary"
                actionButton={
                  <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm" onClick={() => runPipeline('/process/prefilter')}>
                    🔬 Run Prefilter Pipeline
                  </Button>
                }
              />
            )}

            {activeTab === "prefiltered" && (
              <ChannelList 
                status="prefiltered" 
                title="Prefiltered Channels" 
                badgeVariant="info"
                actionButton={
                  <Button variant="primary" onClick={() => runPipeline('/process/ai-filter')}>
                    🤖 Run AI Filter
                  </Button>
                }
              />
            )}

            {activeTab === "negative" && (
              <ChannelList 
                status="negative" 
                title="Negative Channels" 
                badgeVariant="destructive"
                showExport
              />
            )}

            {activeTab === "positive" && (
              <ChannelList 
                status="positive" 
                title="Positive Channels" 
                badgeVariant="success"
                showExport
              />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function StatsCard({ label, value, className = "" }: { label: string, value?: number, className?: string }) {
  return (
    <Card className="p-4 text-center shadow-sm hover:shadow-md transition-all border-l-4 border-l-transparent hover:border-l-secondary">
      <div className={`text-3xl font-bold font-mono tracking-tighter ${className}`}>
        {value !== undefined ? value : '-'}
      </div>
      <div className="text-sm text-muted-foreground mt-1 font-medium uppercase tracking-wide text-[10px]">{label}</div>
    </Card>
  );
}

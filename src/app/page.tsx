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
import { FiltrationConditions } from "@/components/filtration-conditions";
import { Documentation } from "@/components/documentation";
import { DatabaseManager } from "@/components/database-manager";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageToggle } from "@/components/language-toggle";
import { useTranslations } from "next-intl";

export default function Home() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState("socialblade");
  const { stats } = useStats();

  const runPipeline = async (endpoint: string) => {
    const toastId = toast.loading(t("common.loading"));
    try {
      const res = await api<{ ok: true; jobId: string }>(endpoint, { method: 'POST', body: '{}' });
      toast.success(`Job started: ${res.jobId}`, { id: toastId });
      toast.info("Processing in background");
    } catch (error) {
      toast.error('Failed to start job', { id: toastId });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background font-sans">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-50 shadow-sm">
        <div className="container py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-primary text-primary-foreground rounded-lg flex items-center justify-center text-xl shadow-md">
              GW
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">{t("header.title")}</h1>
              <p className="text-xs text-muted-foreground font-medium">{t("header.subtitle")}</p>
            </div>
          </div>
          <div className="flex gap-2">
             <DatabaseManager />
             <FiltrationConditions />
             <Documentation />
             <ThemeToggle />
             <LanguageToggle />
          </div>
        </div>
      </header>

      <div className="container py-8 flex-1">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <StatsCard label={t("stats.unchecked")} value={stats?.unchecked} />
          <StatsCard label={t("stats.prefiltered")} value={stats?.prefiltered} />
          <StatsCard label={t("stats.positive")} value={stats?.positive} className="text-green-600 dark:text-green-400" />
          <StatsCard label={t("stats.negative")} value={stats?.negative} className="text-destructive dark:text-red-400" />
          <StatsCard label={t("stats.total")} value={stats?.total} className="text-secondary dark:text-yellow-400" />
        </div>

        <main className="flex flex-col gap-6">
          {/* Navigation Tabs */}
          <div className="flex overflow-x-auto border-b border-border gap-1 pb-px scrollbar-none">
            {[
              { id: "socialblade", label: t("tabs.socialBlade") },
              { id: "manual", label: t("tabs.manual") },
              { id: "unchecked", label: t("tabs.unchecked"), count: stats?.unchecked },
              { id: "prefiltered", label: t("tabs.prefiltered"), count: stats?.prefiltered },
              { id: "negative", label: t("tabs.negative"), count: stats?.negative },
              { id: "positive", label: t("tabs.positive"), count: stats?.positive },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-5 py-3 text-sm font-medium transition-all whitespace-nowrap border-b-2 flex items-center gap-2 rounded-t-md hover:bg-accent hover:text-accent-foreground
                  ${activeTab === tab.id 
                    ? "border-secondary text-foreground bg-card shadow-sm" 
                    : "border-transparent text-muted-foreground"}
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
                title={t("tabs.unchecked")} 
                badgeVariant="secondary"
                actionButton={
                  <Button className="bg-secondary text-secondary-foreground hover:bg-secondary/90 shadow-sm" onClick={() => runPipeline('/process/prefilter')}>
                    🔬 {t("actions.runPrefilter")}
                  </Button>
                }
              />
            )}

            {activeTab === "prefiltered" && (
              <ChannelList 
                status="prefiltered" 
                title={t("tabs.prefiltered")} 
                badgeVariant="info"
                actionButton={
                  <Button variant="primary" onClick={() => runPipeline('/process/ai-filter')}>
                    🤖 {t("actions.runAiFilter")}
                  </Button>
                }
              />
            )}

            {activeTab === "negative" && (
              <ChannelList 
                status="negative" 
                title={t("tabs.negative")} 
                badgeVariant="destructive"
                showExport
              />
            )}

            {activeTab === "positive" && (
              <ChannelList 
                status="positive" 
                title={t("tabs.positive")} 
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
    <Card className="p-4 text-center shadow-sm hover:shadow-md transition-all border-l-4 border-l-transparent hover:border-l-secondary dark:bg-card">
      <div className={`text-3xl font-bold font-mono tracking-tighter ${className}`}>
        {value !== undefined ? value : '-'}
      </div>
      <div className="text-sm text-muted-foreground mt-1 font-medium uppercase tracking-wide text-[10px]">{label}</div>
    </Card>
  );
}

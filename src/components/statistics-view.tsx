"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useStats } from "@/lib/hooks";
import { BarChart3, TrendingUp, TrendingDown, Filter, Bot, AlertCircle } from "lucide-react";

export function StatisticsView() {
  const [open, setOpen] = useState(false);
  const { stats, isLoading } = useStats();

  // Listen for custom event to open this dialog
  useEffect(() => {
    const handleOpen = () => setOpen(true);
    window.addEventListener('openStatistics', handleOpen);
    return () => window.removeEventListener('openStatistics', handleOpen);
  }, []);

  // Calculate percentages
  const total = stats?.total || 0;
  const getPercent = (value: number) => total > 0 ? ((value / total) * 100).toFixed(1) : "0";

  // Get rejection reasons sorted by count
  const rejectionReasons = stats?.rejectionReasons || {};
  const sortedReasons = Object.entries(rejectionReasons)
    .sort(([, a], [, b]) => b - a);

  const totalNegative = stats?.negative || 0;
  const getReasonPercent = (count: number) => totalNegative > 0 ? ((count / totalNegative) * 100).toFixed(1) : "0";

  // Determine which stage has the most impact
  const prefilterRejects = sortedReasons
    .filter(([reason]) => !reason.toLowerCase().includes('ai') && reason !== 'Unknown')
    .reduce((sum, [, count]) => sum + count, 0);
  
  const aiRejects = sortedReasons
    .filter(([reason]) => reason.toLowerCase().includes('ai') || reason === 'AI Filter')
    .reduce((sum, [, count]) => sum + count, 0);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary">
          <BarChart3 className="h-4 w-4 mr-2" />
          Statistics
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Filtration Statistics
          </DialogTitle>
          <DialogDescription>
            Overview and analysis of channel filtration results.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-muted-foreground">Loading statistics...</div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Overview Stats */}
            <div className="grid grid-cols-5 gap-3">
              <StatCard label="Total" value={stats?.total} />
              <StatCard label="Unchecked" value={stats?.unchecked} color="text-muted-foreground" />
              <StatCard label="Prefiltered" value={stats?.prefiltered} color="text-blue-500" />
              <StatCard label="Positive" value={stats?.positive} color="text-green-500" icon={<TrendingUp className="h-3 w-3" />} />
              <StatCard label="Negative" value={stats?.negative} color="text-red-500" icon={<TrendingDown className="h-3 w-3" />} />
            </div>

            {/* Funnel Visualization */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Filtration Funnel
              </h3>
              <div className="space-y-2">
                <FunnelBar label="Total Imported" value={total} percent={100} color="bg-zinc-500" />
                <FunnelBar 
                  label="Passed Prefilter" 
                  value={(stats?.prefiltered || 0) + (stats?.positive || 0) + (stats?.negative || 0) - prefilterRejects} 
                  percent={total > 0 ? (((stats?.prefiltered || 0) + (stats?.positive || 0) + (stats?.negative || 0) - prefilterRejects) / total) * 100 : 0} 
                  color="bg-blue-500" 
                />
                <FunnelBar 
                  label="Positive (Final)" 
                  value={stats?.positive || 0} 
                  percent={parseFloat(getPercent(stats?.positive || 0))} 
                  color="bg-green-500" 
                />
              </div>
            </Card>

            {/* Rejection Reasons Breakdown */}
            {sortedReasons.length > 0 && (
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Rejection Reasons Breakdown
                  <Badge variant="secondary" className="ml-auto">{totalNegative} total</Badge>
                </h3>
                <div className="space-y-3">
                  {sortedReasons.map(([reason, count]) => (
                    <div key={reason} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          {reason.toLowerCase().includes('ai') || reason === 'AI Filter' ? (
                            <Bot className="h-3.5 w-3.5 text-purple-500" />
                          ) : (
                            <Filter className="h-3.5 w-3.5 text-orange-500" />
                          )}
                          {reason}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {count} ({getReasonPercent(count)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all duration-500 ${
                            reason.toLowerCase().includes('ai') ? 'bg-purple-500' : 'bg-orange-500'
                          }`}
                          style={{ width: `${getReasonPercent(count)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary */}
                <div className="mt-4 pt-4 border-t flex gap-4 text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-orange-500 rounded" />
                    <span>Prefilter: {prefilterRejects}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 bg-purple-500 rounded" />
                    <span>AI Filter: {aiRejects}</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Quick Insights */}
            <Card className="p-4 bg-muted/30">
              <h3 className="font-semibold mb-2 text-sm">Quick Insights</h3>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• <strong>{getPercent(stats?.positive || 0)}%</strong> of channels passed all filters (Positive)</li>
                <li>• <strong>{getPercent(stats?.negative || 0)}%</strong> of channels were rejected (Negative)</li>
                {sortedReasons.length > 0 && (
                  <li>• Top rejection reason: <strong>{sortedReasons[0]?.[0]}</strong> ({sortedReasons[0]?.[1]} channels)</li>
                )}
                {stats?.unchecked && stats.unchecked > 0 && (
                  <li>• <strong>{stats.unchecked}</strong> channels still waiting to be processed</li>
                )}
              </ul>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ 
  label, 
  value, 
  color = "text-foreground",
  icon 
}: { 
  label: string; 
  value?: number; 
  color?: string;
  icon?: React.ReactNode;
}) {
  return (
    <Card className="p-3 text-center">
      <div className={`text-2xl font-bold font-mono ${color} flex items-center justify-center gap-1`}>
        {icon}
        {value !== undefined ? value.toLocaleString() : '-'}
      </div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-1">{label}</div>
    </Card>
  );
}

function FunnelBar({ 
  label, 
  value, 
  percent, 
  color 
}: { 
  label: string; 
  value: number; 
  percent: number; 
  color: string; 
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span>{label}</span>
        <span className="font-mono">{value.toLocaleString()} ({percent.toFixed(1)}%)</span>
      </div>
      <div className="h-3 bg-muted rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-700`} 
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
    </div>
  );
}

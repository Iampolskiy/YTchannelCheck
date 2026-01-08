"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { useCampaigns, useStats } from "@/lib/hooks";
import { toast } from "sonner";
import { AlertCircle, FileSpreadsheet, Keyboard } from "lucide-react";

export function ManualImport() {
  const { campaigns, mutate: mutateCampaigns } = useCampaigns();
  const { mutate: mutateStats } = useStats();
  
  // State
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [urlsText, setUrlsText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignType, setNewCampaignType] = useState("channel");
  
  // CSV State
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isCsvUploading, setIsCsvUploading] = useState(false);

  // Handlers
  const handleCreateCampaign = async () => {
    if (!newCampaignName.trim()) return;
    
    try {
      const res = await api<{ ok: true; campaign: { _id: string } }>('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ name: newCampaignName, type: newCampaignType }),
      });
      
      await mutateCampaigns();
      setSelectedCampaign(res.campaign._id);
      setShowNewCampaign(false);
      setNewCampaignName("");
      toast.success("Campaign created successfully");
    } catch (error) {
      toast.error('Failed to create campaign');
    }
  };

  const handleTextImport = async () => {
    if (!selectedCampaign || !urlsText.trim()) return;
    
    setIsImporting(true);
    const toastId = toast.loading("Importing channels...");
    
    try {
      const res = await api<{ ok: true; results: any }>('/import/channels/textarea', {
        method: 'POST',
        body: JSON.stringify({ text: urlsText, campaignId: selectedCampaign }),
      });
      
      toast.success(`Imported: ${res.results.imported}, Skipped: ${res.results.skipped}`, { id: toastId });
      setUrlsText("");
      mutateStats();
    } catch (error) {
      toast.error('Import failed', { id: toastId });
    } finally {
      setIsImporting(false);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile || !selectedCampaign) return;

    setIsCsvUploading(true);
    const toastId = toast.loading("Uploading CSV...");
    
    const formData = new FormData();
    formData.append('file', csvFile);
    formData.append('campaignId', selectedCampaign);

    try {
      const res = await fetch('/api/import/channels/csv', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.ok) {
        const errorCount = data.results.errors?.length || 0;
        const msg = `Imported: ${data.results.imported}, Skipped: ${data.results.skipped}` + 
          (errorCount > 0 ? `, Errors: ${errorCount}` : '');
        
        if (errorCount > 0 && data.results.imported === 0 && data.results.skipped === 0) {
           toast.error(`Import failed: ${errorCount} errors (check format)`, { id: toastId });
        } else {
           toast.success(msg, { id: toastId });
        }

        if (errorCount > 0) {
          console.error('Import errors:', data.results.errors);
        }

        setCsvFile(null);
        mutateStats();
      } else {
        toast.error('Import failed: ' + data.error, { id: toastId });
      }
    } catch (error) {
      toast.error('Upload error', { id: toastId });
    } finally {
      setIsCsvUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 1. Campaign Selection */}
      <Card>
        <CardHeader>
          <CardTitle>1. Select Target Campaign</CardTitle>
          <CardDescription>
            Choose where the imported channels should be added.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <select 
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                  value={selectedCampaign}
                  onChange={(e) => setSelectedCampaign(e.target.value)}
                >
                  <option value="">Select a campaign...</option>
                  {campaigns?.map(c => (
                    <option key={c._id} value={c._id}>{c.name} ({c.type})</option>
                  ))}
                </select>
              </div>
              <Button variant="outline" onClick={() => setShowNewCampaign(!showNewCampaign)}>
                {showNewCampaign ? 'Cancel' : '+ New'}
              </Button>
            </div>

            {showNewCampaign && (
              <div className="p-4 bg-muted/50 rounded-lg space-y-3 border animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">New Campaign Details</label>
                  <Input 
                    placeholder="Campaign Name" 
                    value={newCampaignName}
                    onChange={(e) => setNewCampaignName(e.target.value)}
                  />
                  <div className="relative">
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      value={newCampaignType}
                      onChange={(e) => setNewCampaignType(e.target.value)}
                    >
                      <option value="channel">Channel List</option>
                      <option value="video">Video List</option>
                    </select>
                  </div>
                  <Button className="w-full" onClick={handleCreateCampaign} disabled={!newCampaignName.trim()}>
                    Create & Select
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Import Method */}
      <Card className={!selectedCampaign ? "opacity-60 pointer-events-none" : ""}>
        <CardHeader>
          <CardTitle>2. Import Data</CardTitle>
          <CardDescription>
            Choose how you want to import your channels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selectedCampaign && (
            <div className="flex items-center gap-2 p-3 mb-4 text-amber-600 bg-amber-50 rounded-md border border-amber-200">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Please select a campaign above to unlock import.</span>
            </div>
          )}
          
          <Tabs defaultValue="text" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="text" className="flex gap-2">
                <Keyboard className="h-4 w-4" />
                Paste URLs
              </TabsTrigger>
              <TabsTrigger value="csv" className="flex gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Upload CSV
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="text" className="space-y-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">YouTube URLs (One per line)</label>
                <Textarea 
                  rows={8} 
                  placeholder="https://www.youtube.com/@Channel&#10;https://youtu.be/VideoID"
                  value={urlsText}
                  onChange={(e) => setUrlsText(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Supported formats: Channel URL, Video URL, or Handle.
                </p>
              </div>
              
              <Button 
                className="w-full" 
                onClick={handleTextImport}
                disabled={!selectedCampaign || !urlsText.trim() || isImporting}
              >
                {isImporting ? 'Importing...' : 'Import Channels'}
              </Button>
            </TabsContent>
            
            <TabsContent value="csv" className="space-y-4 mt-4">
              <div 
                className={`
                  border-2 border-dashed rounded-lg p-10 text-center transition-all cursor-pointer
                  ${csvFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'}
                `}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-primary'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-primary'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-primary');
                  if (e.dataTransfer.files?.[0]?.name.endsWith('.csv')) {
                    setCsvFile(e.dataTransfer.files[0]);
                    toast.info(`Selected ${e.dataTransfer.files[0].name}`);
                  } else {
                    toast.error('Only CSV files are allowed');
                  }
                }}
                onClick={() => document.getElementById('csv-upload')?.click()}
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="p-3 bg-background rounded-full border shadow-sm">
                    <FileSpreadsheet className="h-8 w-8 text-primary" />
                  </div>
                  {csvFile ? (
                    <div className="space-y-1">
                      <p className="font-medium text-primary break-all">{csvFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(csvFile.size / 1024).toFixed(1)} KB</p>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-destructive mt-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCsvFile(null);
                        }}
                      >
                        Remove file
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-1">
                        <p className="font-medium">Click to upload CSV</p>
                        <p className="text-sm text-muted-foreground">or drag and drop here</p>
                      </div>
                      <Input 
                        type="file" 
                        accept=".csv" 
                        className="hidden" 
                        id="csv-upload"
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            setCsvFile(e.target.files[0]);
                            toast.info(`Selected ${e.target.files[0].name}`);
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  className="w-full" 
                  disabled={!csvFile || !selectedCampaign || isCsvUploading}
                  onClick={handleCsvUpload}
                >
                  {isCsvUploading ? 'Uploading...' : 'Upload CSV'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  The CSV should contain YouTube URLs in the first column or any recognizable column.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

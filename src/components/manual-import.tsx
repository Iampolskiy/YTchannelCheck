"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { useCampaigns, useStats } from "@/lib/hooks";
import { toast } from "sonner";

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
        toast.success(`Imported: ${data.results.imported}, Skipped: ${data.results.skipped}`, { id: toastId });
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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left: Input */}
      <Card>
        <CardHeader>
          <CardTitle>📝 Paste URLs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Campaign (Required)</label>
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
          </div>

          {showNewCampaign && (
            <div className="p-4 bg-muted/50 rounded-lg space-y-3 border">
              <h4 className="font-semibold text-sm">New Campaign</h4>
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
              <Button className="w-full" onClick={handleCreateCampaign}>Create Campaign</Button>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">YouTube URLs (One per line)</label>
            <Textarea 
              rows={8} 
              placeholder="https://www.youtube.com/@Channel&#10;https://youtu.be/VideoID"
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
            />
          </div>
          
          <Button 
            className="w-full" 
            onClick={handleTextImport}
            disabled={!selectedCampaign || !urlsText.trim() || isImporting}
          >
            {isImporting ? 'Importing...' : 'Import Channels'}
          </Button>
        </CardContent>
      </Card>

      {/* Right: CSV Upload */}
      <Card>
        <CardHeader>
          <CardTitle>📄 Upload CSV</CardTitle>
        </CardHeader>
        <CardContent>
          <div 
            className={`
              border-2 border-dashed rounded-lg p-12 text-center transition-colors
              ${csvFile ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
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
          >
            <div className="flex flex-col items-center gap-2">
              <div className="text-4xl opacity-50">📊</div>
              {csvFile ? (
                <>
                  <p className="font-medium text-primary">{csvFile.name}</p>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setCsvFile(null)}
                  >
                    Change File
                  </Button>
                </>
              ) : (
                <>
                  <p className="font-medium">Drag & Drop CSV file here</p>
                  <p className="text-sm text-muted-foreground">or click to browse</p>
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
                  <Button 
                    variant="outline" 
                    onClick={() => document.getElementById('csv-upload')?.click()}
                  >
                    Select File
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="mt-4">
            <Button 
              className="w-full" 
              disabled={!csvFile || !selectedCampaign || isCsvUploading}
              onClick={handleCsvUpload}
            >
              {isCsvUploading ? 'Uploading...' : 'Upload CSV'}
            </Button>
            {!selectedCampaign && (
              <p className="text-xs text-destructive text-center mt-2">
                Please select a campaign first
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

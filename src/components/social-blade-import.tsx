"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { useStats } from "@/lib/hooks";
import { toast } from "sonner";

declare module "react" {
  interface InputHTMLAttributes<T> extends React.HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

export function SocialBladeImport() {
  const { mutate: mutateStats } = useStats();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploadResult, setUploadResult] = useState<{ imported: number; skipped: number } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files).filter(f => f.name.endsWith('.html'));
      setSelectedFiles(files);
      setUploadResult(null);
      toast.info(`Selected ${files.length} HTML files`);
    }
  };

  const handleImport = async () => {
    if (selectedFiles.length === 0) return;

    setIsUploading(true);
    const toastId = toast.loading("Uploading files...");
    
    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const res = await fetch('/api/import/folder/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.ok) {
        setUploadResult({
          imported: data.results.imported,
          skipped: data.results.skipped
        });
        setSelectedFiles([]);
        mutateStats();
        toast.success(`Imported ${data.results.imported} channels`, { id: toastId });
      } else {
        toast.error('Import failed: ' + data.error, { id: toastId });
      }
    } catch (error) {
      console.error(error);
      toast.error('Upload error occurred', { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>🕷️ SocialBlade Scraper</CardTitle>
          <Badge variant="info">Browser Automation</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Scraper Section */}
        <div className="text-center p-8 border rounded-lg bg-muted/20">
          <div className="text-4xl mb-4">🖥️</div>
          <h3 className="text-lg font-semibold">Start Browser Automation</h3>
          <p className="text-muted-foreground mb-4">This will open a Chrome browser to scrape SocialBlade lists.</p>
          <Button variant="secondary" disabled>Start Scraper (Coming Soon)</Button>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or Import HTML Files</span>
          </div>
        </div>

        {/* File Import Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-4 max-w-xl mx-auto">
            <div className="relative flex-1">
              <Input
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                className="hidden"
                id="folder-upload"
                onChange={handleFileSelect}
              />
              <Button 
                variant="outline" 
                className="w-full" 
                onClick={() => document.getElementById('folder-upload')?.click()}
              >
                📁 Choose Folder...
              </Button>
            </div>
            
            {selectedFiles.length > 0 && (
              <Button 
                onClick={handleImport} 
                disabled={isUploading}
              >
                {isUploading ? 'Uploading...' : '📥 Import Now'}
              </Button>
            )}
          </div>

          {selectedFiles.length > 0 && (
            <div className="text-center text-sm text-muted-foreground bg-accent/50 p-4 rounded-md">
              <p>Ready to import <strong>{selectedFiles.length}</strong> HTML files.</p>
              <div className="mt-2 text-xs font-mono max-h-20 overflow-y-auto">
                {selectedFiles.slice(0, 5).map(f => f.name).join(', ')}
                {selectedFiles.length > 5 && '...'}
              </div>
            </div>
          )}

          {uploadResult && (
            <div className="text-center text-sm p-4 bg-green-50 text-green-700 rounded-md border border-green-200">
              ✅ Successfully imported <strong>{uploadResult.imported}</strong> channels.
              <br />
              <span className="text-xs opacity-80">(Skipped {uploadResult.skipped} duplicates)</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

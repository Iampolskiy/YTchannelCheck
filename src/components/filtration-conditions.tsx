"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

// Default settings
const DEFAULT_SETTINGS = {
  prefilter: {
    location: {
      enabled: true,
      allowedCountries: "Deutschland, Germany, DE, Österreich, Austria, AT, Schweiz, Switzerland, CH",
    },
    language: {
      enabled: true,
      minGermanWords: 5,
    },
    topics: {
      enabled: true,
      threshold: 3,
      kidsKeywords: "kinder, kids, baby, spielzeug, toys, cartoon",
      gamingKeywords: "gaming, gameplay, let's play, zocken, minecraft, roblox, fortnite",
    }
  },
  ai: {
    model: "llama3:8b",
    prompts: [
      {
        id: "kids",
        name: "Kids Content Check",
        prompt: `Is this channel primarily targeting children (under 13 years old)?
Analyze the title, description, and video titles.
Look for:
- Cartoons, nursery rhymes, toys
- "Kids", "Kinder", "Baby", "Spielzeug"
- Content that is clearly "Made for Kids"

Input Data:
Title: {title}
Description: {description}
Latest Videos: {videoTitles}

Answer with "suitable": false if it IS for kids.
Answer with "suitable": true if it is NOT for kids (adult/general audience).`
      },
      {
        id: "gaming",
        name: "Gaming Content Check",
        prompt: `Is this channel primarily about Gaming (Let's Plays, Walkthroughs, Stream highlights)?
Input Data:
Title: {title}
Description: {description}
Latest Videos: {videoTitles}

Answer with "suitable": false if it IS gaming content.
Answer with "suitable": true if it is NOT gaming content.`
      }
    ]
  }
};

export function FiltrationConditions() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  // Load settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("filterSettings");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        
        // Migration: If model is the old default "llama3", update to "llama3:8b"
        if (parsed.ai && parsed.ai.model === "llama3") {
          parsed.ai.model = "llama3:8b";
        }
        
        setSettings(parsed);
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("filterSettings", JSON.stringify(settings));
    toast.success("Filtration conditions saved");
    setOpen(false);
  };

  const updatePrefilter = (section: string, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      prefilter: {
        ...prev.prefilter,
        [section]: {
          // @ts-ignore
          ...prev.prefilter[section],
          [key]: value
        }
      }
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex bg-secondary/10 border-secondary/20 hover:bg-secondary/20 text-secondary-foreground">
          ⚙️ Filtration Conditions
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Filtration Conditions</DialogTitle>
          <DialogDescription>
            Configure the rules for Prefilter and AI analysis. Changes are saved locally.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="prefilter" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="prefilter">Rule-Based Prefilter</TabsTrigger>
            <TabsTrigger value="ai">AI Prompts</TabsTrigger>
          </TabsList>

          {/* Prefilter Settings */}
          <TabsContent value="prefilter" className="space-y-6 py-4">
            
            {/* Location */}
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Location Filter (DACH)</Label>
                <Switch 
                  checked={settings.prefilter.location.enabled}
                  onCheckedChange={(checked) => updatePrefilter('location', 'enabled', checked)}
                />
              </div>
              <div className="space-y-2">
                <Label>Allowed Countries (Comma separated)</Label>
                <Textarea 
                  value={settings.prefilter.location.allowedCountries}
                  onChange={(e) => updatePrefilter('location', 'allowedCountries', e.target.value)}
                  className="h-20"
                />
              </div>
            </div>

            {/* Language */}
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Language Check</Label>
                <Switch 
                  checked={settings.prefilter.language.enabled}
                  onCheckedChange={(checked) => updatePrefilter('language', 'enabled', checked)}
                />
              </div>
              <div className="space-y-2">
                <Label>Minimum German Words Required</Label>
                <Input 
                  type="number"
                  value={settings.prefilter.language.minGermanWords}
                  onChange={(e) => updatePrefilter('language', 'minGermanWords', parseInt(e.target.value))}
                />
              </div>
            </div>

            {/* Topics */}
            <div className="space-y-4 border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Topic Filters (Negative)</Label>
                <Switch 
                  checked={settings.prefilter.topics.enabled}
                  onCheckedChange={(checked) => updatePrefilter('topics', 'enabled', checked)}
                />
              </div>
              <div className="space-y-2">
                <Label>Keyword Threshold (Hits to fail)</Label>
                <Input 
                  type="number"
                  value={settings.prefilter.topics.threshold}
                  onChange={(e) => updatePrefilter('topics', 'threshold', parseInt(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Kids Keywords</Label>
                <Textarea 
                  value={settings.prefilter.topics.kidsKeywords}
                  onChange={(e) => updatePrefilter('topics', 'kidsKeywords', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Gaming Keywords</Label>
                <Textarea 
                  value={settings.prefilter.topics.gamingKeywords}
                  onChange={(e) => updatePrefilter('topics', 'gamingKeywords', e.target.value)}
                />
              </div>
            </div>

          </TabsContent>

          {/* AI Settings */}
          <TabsContent value="ai" className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Ollama Model</Label>
              <Input 
                value={settings.ai.model}
                onChange={(e) => setSettings(prev => ({ ...prev, ai: { ...prev.ai, model: e.target.value } }))}
              />
            </div>

            <div className="space-y-4">
              <Label className="text-base font-semibold">Prompts</Label>
              {settings.ai.prompts.map((prompt, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3">
                  <div className="font-medium">{prompt.name}</div>
                  <Textarea 
                    value={prompt.prompt}
                    onChange={(e) => {
                      const newPrompts = [...settings.ai.prompts];
                      newPrompts[idx] = { ...newPrompts[idx], prompt: e.target.value };
                      setSettings(prev => ({ ...prev, ai: { ...prev.ai, prompts: newPrompts } }));
                    }}
                    className="min-h-[150px] font-mono text-xs"
                  />
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


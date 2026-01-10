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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Info } from "lucide-react";
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
      allowedLanguages: "German, Deutsch, de",
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

// Sortable Item Component
function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* Drag Handle Indicator Strip */}
      <div 
        {...attributes}
        {...listeners}
        className="absolute left-0 top-0 bottom-0 w-1.5 bg-border rounded-l-lg cursor-grab hover:bg-primary/50 transition-colors group-hover:bg-primary/30 z-10 flex flex-col justify-center items-center"
        title="Drag to reorder"
      >
        <div className="h-4 w-0.5 bg-background/50 rounded-full" />
        <div className="h-4 w-0.5 bg-background/50 rounded-full mt-1" />
      </div>
      
      <div className="pl-4">
        {children}
      </div>
    </div>
  );
}

export function FiltrationConditions() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Default order: location, language, topics
  const [filterOrder, setFilterOrder] = useState(["location", "language", "topics"]);

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
        // Load order if saved, otherwise default
        if (parsed.filterOrder) {
          setFilterOrder(parsed.filterOrder);
        }
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem("filterSettings", JSON.stringify({ ...settings, filterOrder }));
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setFilterOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over?.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const renderFilterSection = (id: string) => {
    switch (id) {
      case "location":
        return (
          <div className="space-y-4 border rounded-lg p-4 bg-card">
            <Collapsible
              open={settings.prefilter.location.enabled}
              onOpenChange={(open) => updatePrefilter('location', 'enabled', open)}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">Location Filter (DACH)</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>When enabled, only channels from Germany, Austria, or Switzerland are allowed. If disabled, all locations are accepted.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Switch 
                          checked={settings.prefilter.location.enabled}
                          onCheckedChange={(checked) => updatePrefilter('location', 'enabled', checked)}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{settings.prefilter.location.enabled ? 'Active' : 'Inactive'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <CollapsibleContent className="space-y-2">
                <Label>Allowed Countries (Comma separated)</Label>
                <Textarea 
                  value={settings.prefilter.location.allowedCountries}
                  onChange={(e) => updatePrefilter('location', 'allowedCountries', e.target.value)}
                  className="h-20"
                />
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      case "language":
        return (
          <div className="border rounded-lg p-4 bg-card">
            <Collapsible
              open={settings.prefilter.language.enabled}
              onOpenChange={(open) => updatePrefilter('language', 'enabled', open)}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">Language Check</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>When enabled, checks if channel description/titles contain words from the allowed languages. If disabled, all languages are accepted.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Switch
                          checked={settings.prefilter.language.enabled}
                          onCheckedChange={(checked) => updatePrefilter('language', 'enabled', checked)}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{settings.prefilter.language.enabled ? 'Active' : 'Inactive'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <CollapsibleContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Allowed Languages (e.g. German, Deutsch)</Label>
                  <Textarea 
                    value={settings.prefilter.language.allowedLanguages}
                    onChange={(e) => updatePrefilter('language', 'allowedLanguages', e.target.value)}
                    className="h-20"
                    placeholder="Enter allowed language names or codes..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Minimum Required Words</Label>
                  <Input 
                    type="number"
                    value={settings.prefilter.language.minGermanWords}
                    onChange={(e) => updatePrefilter('language', 'minGermanWords', parseInt(e.target.value))}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      case "topics":
        return (
          <div className="space-y-4 border rounded-lg p-4 bg-card">
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
        );
      default:
        return null;
    }
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
          <div className="flex items-center gap-2">
            <DialogTitle>Filtration Conditions</DialogTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p>Configure the rules for channel filtering. <br/>
                  - <strong>Prefilter:</strong> Fast, rule-based checks.<br/>
                  - <strong>AI Prompts:</strong> Advanced content analysis.<br/>
                  Channels must pass all enabled checks to be marked 'Positive'.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DialogDescription>
            Configure the rules for Prefilter and AI analysis.
            <div className="flex items-center gap-2 mt-2 text-primary font-medium text-xs bg-primary/5 p-2 rounded-md border border-primary/10">
              <GripVertical className="h-3 w-3" />
              <span>Drag sections to prioritize the order of checks</span>
            </div>
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="prefilter" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="prefilter">Rule-Based Prefilter</TabsTrigger>
            <TabsTrigger value="ai">AI Prompts</TabsTrigger>
          </TabsList>

          {/* Prefilter Settings */}
          <TabsContent value="prefilter" className="space-y-6 py-4">
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={filterOrder}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {filterOrder.map((id) => (
                    <SortableItem key={id} id={id}>
                      {renderFilterSection(id)}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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


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
import { GripVertical, Info, Plus, Trash2 } from "lucide-react";
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
      // Single list of keywords
      keywords: "kinder, kids, baby, spielzeug, toys, cartoon, gaming, gameplay, let's play, zocken, minecraft, roblox, fortnite",
      // Array of dynamic conditions: { minWords: number, maxChars: number }
      // Start with 1 default condition
      conditions: [{ minWords: 3, maxChars: 1000 }],
      // Dynamic topic filter groups (optional advanced feature)
      // If we wanted completely separate groups like the user asked ("add new Topic Filters (Negative) dynamically"),
      // we'd need a structure like: groups: [{ name: "Kids", keywords: "...", conditions: [...] }]
      // But the current request seemed to be about the *conditions* within the topic filter.
      // If the user meant adding entirely NEW Topic Filter SECTIONS (e.g. "Gambling Filter", "Crypto Filter"),
      // we would need to restructure the 'prefilter' object to be an array or dynamic map.
      // Given the "Topic Filters (Negative)" header, I'll assume they want to add new *groups* of topic filters.
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
        // Default order: location, language, then all topic filters
        const defaultOrder = ["location", "language", "default-topics"];
        
        // If loaded data has new structure, use it
        if (parsed.prefilter?.topicFilters) {
           const topicIds = parsed.prefilter.topicFilters.map((t: any) => t.id);
           // Merge standard filters with dynamic topic filters for ordering
           const mergedOrder = ["location", "language", ...topicIds];
           
           // Use saved order if valid, ensuring all current IDs are present
           if (parsed.filterOrder) {
             // Keep saved order but append any new IDs that might not be in it
             const existing = parsed.filterOrder.filter((id: string) => mergedOrder.includes(id));
             const missing = mergedOrder.filter(id => !parsed.filterOrder.includes(id));
             setFilterOrder([...existing, ...missing]);
           } else {
             setFilterOrder(mergedOrder);
           }
        } else {
           // Migration from old structure to new
           // Convert old 'topics' object to first item in 'topicFilters' array
           if (parsed.prefilter?.topics && !parsed.prefilter.topicFilters) {
              const oldTopics = parsed.prefilter.topics;
              // Map old single threshold/keywords to new structure if needed, or just default
              // Simplest migration: Create default topic filter with old keywords
              parsed.prefilter.topicFilters = [{
                id: "default-topics",
                name: "Topic Filters (Negative)",
                enabled: oldTopics.enabled ?? true,
                keywords: oldTopics.keywords || oldTopics.kidsKeywords + ", " + oldTopics.gamingKeywords || "",
                conditions: oldTopics.conditions || [{ minWords: 3, maxChars: 1000 }]
              }];
              delete parsed.prefilter.topics;
              
              setSettings(parsed);
              setFilterOrder(["location", "language", "default-topics"]);
           } else {
              setFilterOrder(defaultOrder);
           }
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
    // Check if it's a dynamic topic filter
    if (id.startsWith('topic-') || id === 'default-topics') {
      const topicFilter = settings.prefilter.topicFilters?.find((t: any) => t.id === id);
      if (!topicFilter) return null; // Should not happen if state is consistent

      const updateTopicFilter = (key: string, value: any) => {
        const newFilters = settings.prefilter.topicFilters.map((t: any) => 
          t.id === id ? { ...t, [key]: value } : t
        );
        updatePrefilter('topicFilters', null, newFilters); // special handling in updatePrefilter needed or just direct set
      };

      // Helper since updatePrefilter logic was for simple keys. We'll update settings directly here.
      const handleTopicUpdate = (key: string, value: any) => {
         setSettings(prev => ({
            ...prev,
            prefilter: {
              ...prev.prefilter,
              topicFilters: prev.prefilter.topicFilters.map((t: any) => 
                t.id === id ? { ...t, [key]: value } : t
              )
            }
         }));
      };

      return (
        <div className="border rounded-lg p-4 bg-card group/card relative">
          <Collapsible
            open={topicFilter.enabled}
            onOpenChange={(open) => handleTopicUpdate('enabled', open)}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 max-w-[200px]">
                   <Input 
                      value={topicFilter.name}
                      onChange={(e) => handleTopicUpdate('name', e.target.value)}
                      className="font-semibold text-base border-none shadow-none p-0 h-auto focus-visible:ring-0 bg-transparent"
                   />
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <p>Configure negative keyword rules. A channel is rejected if it matches ANY of the rules below.<br/>
                      For each rule: "If <strong>X</strong> words from the list appear within the first <strong>Y</strong> characters."<br/>
                      This helps filter out channels that mention keywords too frequently early in their content.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div>
                        <Switch 
                          checked={topicFilter.enabled}
                          onCheckedChange={(checked) => handleTopicUpdate('enabled', checked)}
                        />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{topicFilter.enabled ? 'Active' : 'Inactive'}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                
                {/* Delete button for dynamic filters (not the first one if we want to enforce at least one, but allow flexibility) */}
                {settings.prefilter.topicFilters.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setSettings(prev => ({
                        ...prev,
                        prefilter: {
                          ...prev.prefilter,
                          topicFilters: prev.prefilter.topicFilters.filter((t: any) => t.id !== id)
                        }
                      }));
                      setFilterOrder(prev => prev.filter(oid => oid !== id));
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <CollapsibleContent className="space-y-6">
              
              {/* 1. Keyword Input (Shared) */}
              <div className="space-y-2">
                <Label>Negative Keywords (Shared List)</Label>
                <Textarea 
                  className="h-32 resize-none"
                  placeholder="e.g. gaming, minecraft, roblox, fortnite..."
                  value={topicFilter.keywords}
                  onChange={(e) => handleTopicUpdate('keywords', e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Define the full list of words to check against.
                </p>
              </div>

              {/* 2. Rules Grid */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Matching Rules (OR Logic)</Label>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs gap-1"
                    onClick={() => {
                      const newConditions = [...(topicFilter.conditions || [])];
                      newConditions.push({ minWords: 3, maxChars: 1000 });
                      handleTopicUpdate('conditions', newConditions);
                    }}
                  >
                    <Plus className="h-3 w-3" /> Add Condition
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(topicFilter.conditions || [{ minWords: 3, maxChars: 1000 }]).map((cond: any, idx: number) => (
                    <div key={idx} className="p-3 border rounded-md bg-muted/30 flex flex-col gap-2 relative group">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                          Condition {idx + 1}
                        </div>
                        {(topicFilter.conditions?.length > 1) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              const newConditions = [...topicFilter.conditions];
                              newConditions.splice(idx, 1);
                              handleTopicUpdate('conditions', newConditions);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-xs mb-1 block">Min Words</Label>
                          <Input 
                            type="number" 
                            min="1"
                            className="h-8"
                            value={cond.minWords}
                            onChange={(e) => {
                              const newConditions = [...(topicFilter.conditions || [])];
                              newConditions[idx] = { ...newConditions[idx], minWords: parseInt(e.target.value) || 0 };
                              handleTopicUpdate('conditions', newConditions);
                            }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground pt-5">in</span>
                        <div className="flex-1">
                          <Label className="text-xs mb-1 block">First Chars</Label>
                          <Input 
                            type="number" 
                            min="10"
                            className="h-8"
                            value={cond.maxChars}
                            onChange={(e) => {
                              const newConditions = [...(topicFilter.conditions || [])];
                              newConditions[idx] = { ...newConditions[idx], maxChars: parseInt(e.target.value) || 0 };
                              handleTopicUpdate('conditions', newConditions);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {topicFilter.conditions?.length === 0 && (
                  <div className="text-center p-4 border border-dashed rounded-md text-sm text-muted-foreground">
                    No conditions defined. Channels will likely pass this filter unless configured.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  The channel is rejected if ANY of the above conditions are met using the keyword list.
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    }

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
        // Fallback for backward compatibility or direct ID match failure
        return null;
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
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => {
                  const newTopicFilter = {
                    id: `topic-${Date.now()}`,
                    name: "New Topic Filter",
                    enabled: true,
                    keywords: "",
                    conditions: [{ minWords: 3, maxChars: 1000 }]
                  };
                  // We need to update settings AND the order array to include the new ID
                  setSettings(prev => ({
                    ...prev,
                    prefilter: {
                      ...prev.prefilter,
                      topicFilters: [...(prev.prefilter.topicFilters || []), newTopicFilter]
                    }
                  }));
                  setFilterOrder(prev => [...prev, newTopicFilter.id]);
                }}
              >
                <Plus className="h-3 w-3" /> Add Topic Filter
              </Button>
            </div>

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
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Prompts</Label>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    const newPrompts = [...settings.ai.prompts, { id: `custom-${Date.now()}`, name: "New Prompt", prompt: "Prompt text..." }];
                    setSettings(prev => ({ ...prev, ai: { ...prev.ai, prompts: newPrompts } }));
                  }}
                >
                  <Plus className="h-3 w-3" /> Add Prompt
                </Button>
              </div>
              
              {settings.ai.prompts.map((prompt, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3 relative group">
                  <div className="flex items-center justify-between">
                    <Input 
                      value={prompt.name}
                      onChange={(e) => {
                        const newPrompts = [...settings.ai.prompts];
                        newPrompts[idx] = { ...newPrompts[idx], name: e.target.value };
                        setSettings(prev => ({ ...prev, ai: { ...prev.ai, prompts: newPrompts } }));
                      }}
                      className="font-medium border-none shadow-none p-0 h-auto focus-visible:ring-0 w-full max-w-[200px]"
                    />
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => {
                        const newPrompts = [...settings.ai.prompts];
                        newPrompts.splice(idx, 1);
                        setSettings(prev => ({ ...prev, ai: { ...prev.ai, prompts: newPrompts } }));
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
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


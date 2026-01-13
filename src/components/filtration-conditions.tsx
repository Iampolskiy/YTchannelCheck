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
import { GripVertical, Info, Plus, Trash2, Check, ChevronsUpDown, Settings } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AIConfiguration } from "@/components/ai-configuration";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

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
    topicFilters: [
      {
        id: "default-topics",
        name: "Topic Filters (Negative)",
        enabled: true,
        keywords: "kinder, kids, baby, spielzeug, toys, cartoon, gaming, gameplay, let's play, zocken, minecraft, roblox, fortnite",
        conditions: [{ minWords: 3, maxChars: 1000 }]
      }
    ]
  },
  ai: {
    model: "llama3:8b",
    masterPrompt: `You are an expert content moderator for a German advertising agency. 
Your task is to analyze YouTube channel data to determine if it is suitable for a specific advertising campaign.
You must be strict, objective, and ignore any personal bias.
The output must be a valid JSON object with the following structure:
{
  "suitable": boolean,
  "reason": "string (short explanation in German)"
}
Do not output any markdown formatting, just the raw JSON string.`,
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

// Helper component for model selector
function ModelSelector({
  value,
  onChange,
  placeholder = "Select model..."
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<any[]>([]);

  useEffect(() => {
    // Load models from aiConfig in localStorage
    const storedConfig = localStorage.getItem("aiConfig");
    if (storedConfig) {
      try {
        const config = JSON.parse(storedConfig);
        if (config.models && Array.isArray(config.models)) {
          setAvailableModels(config.models);
        }
      } catch (e) {
        console.error("Failed to load AI models", e);
      }
    }
  }, [open]); // Refresh when opened

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal text-muted-foreground hover:text-foreground"
        >
          {value ? (
            <span className="text-foreground">{value}</span>
          ) : (
            placeholder
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Search models..." />
          <CommandList>
            <CommandEmpty>
              <div className="p-2 text-center text-sm">
                <p className="text-muted-foreground mb-2">No models found.</p>
                {/* We can't directly open the other dialog easily from here without lifting state,
                    so we provide a hint or a simple link */}
                <p className="text-xs">Use the AI Config button in the header to add models.</p>
              </div>
            </CommandEmpty>
            <CommandGroup heading="Available Models">
              {availableModels.map((model) => (
                <CommandItem
                  key={model.id}
                  value={model.modelName} // Use modelName for search
                  onSelect={() => {
                    onChange(model.modelName); // Pass the actual model string (e.g. "llama3:8b")
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === model.modelName ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span>{model.name}</span>
                    <span className="text-xs text-muted-foreground">{model.modelName}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            {/* Fallback for default/hardcoded commonly used models if no config exists */}
            {availableModels.length === 0 && (
              <CommandGroup heading="Common Models">
                {["llama3:8b", "llama2:7b", "mistral", "gemma:7b"].map((m) => (
                  <CommandItem
                    key={m}
                    value={m}
                    onSelect={() => {
                      onChange(m);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === m ? "opacity-100" : "opacity-0"
                      )}
                    />
                    {m}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
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
                      <p>Configure negative keyword rules. A channel is rejected if it matches ANY of the rules below.<br />
                        For each rule: "If <strong>X</strong> words from the list appear within the first <strong>Y</strong> characters."<br />
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
                  <p>Configure the rules for channel filtering. <br />
                    - <strong>Prefilter:</strong> Fast, rule-based checks.<br />
                    - <strong>AI Prompts:</strong> Advanced content analysis.<br />
                    Channels must pass all enabled checks to be marked 'Positive'.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <DialogDescription>
            Configure the rules for Prefilter and AI analysis.
          </DialogDescription>
          <div className="flex items-center gap-2 mt-2 text-primary font-medium text-xs bg-primary/5 p-2 rounded-md border border-primary/10">
            <GripVertical className="h-3 w-3" />
            <span>Drag sections to prioritize the order of checks</span>
          </div>
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
            <div className="space-y-4 border rounded-lg p-4 bg-card">
              <div className="flex items-center gap-2">
                <Label className="text-base font-semibold">Consensus Mechanism</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <p>Run analysis with multiple models to improve accuracy.<br />
                        - <strong>Single Model:</strong> Faster, relies on one model's decision.<br />
                        - <strong>Consensus (2 out of 3):</strong> Runs 3 models. Requires 2 models to agree for a Positive/Negative decision. If split (e.g. 1 positive, 2 negative), the majority wins.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex gap-4 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Array.isArray(settings.ai.model) && settings.ai.model.length > 1}
                    onCheckedChange={(checked) => {
                      // Toggle between single model (string) and multi-model (array)
                      if (checked) {
                        setSettings(prev => ({
                          ...prev,
                          ai: {
                            ...prev.ai,
                            model: ["llama3:8b", "llama3:8b", "llama3:8b"] // Default to 3 same models or user choice
                          }
                        }));
                      } else {
                        setSettings(prev => ({
                          ...prev,
                          ai: {
                            ...prev.ai,
                            model: Array.isArray(prev.ai.model) ? prev.ai.model[0] : prev.ai.model
                          }
                        }));
                      }
                    }}
                  />
                  <Label>Enable Multi-Model Consensus</Label>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  onClick={() => {
                    // Close this dialog and open AI Config
                    setOpen(false);
                    // Dispatch a custom event to open AI Config dialog
                    window.dispatchEvent(new CustomEvent('openAIConfig'));
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add New Model
                </Button>
              </div>

              {Array.isArray(settings.ai.model) ? (
                <div className="grid gap-3 pl-4 border-l-2 border-muted mt-2">
                  <Label className="text-xs text-muted-foreground">Select 3 Models for Consensus (2/3 Vote):</Label>
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="flex-1 flex flex-col gap-1">
                        <Label className="text-xs font-mono text-muted-foreground">Model #{i + 1}</Label>
                        <ModelSelector
                          value={(settings.ai.model as string[])[i]}
                          onChange={(val) => {
                            const newModels = [...(settings.ai.model as string[])];
                            newModels[i] = val;
                            setSettings(prev => ({ ...prev, ai: { ...prev.ai, model: newModels } }));
                          }}
                          placeholder="Select model..."
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>Ollama Model</Label>
                  <ModelSelector
                    value={settings.ai.model as string}
                    onChange={(val) => setSettings((prev: any) => ({ ...prev, ai: { ...prev.ai, model: val } }))}
                    placeholder="Select model..."
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Master System Prompt (Fixed)</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-md">
                      <p>This is the <strong>System Instruction</strong> sent to the AI. It defines the AI's role and the required output format (JSON). <br /><br />
                        <strong>Do not change the JSON structure instructions</strong> unless you update the backend parser too.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="relative">
                <Textarea
                  value={settings.ai.masterPrompt}
                  onChange={(e) => setSettings(prev => ({ ...prev, ai: { ...prev.ai, masterPrompt: e.target.value } }))}
                  className="min-h-[150px] font-mono text-xs"
                  placeholder={DEFAULT_SETTINGS.ai.masterPrompt}
                />
                {settings.ai.masterPrompt !== DEFAULT_SETTINGS.ai.masterPrompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-6 text-xs text-muted-foreground hover:text-primary"
                    onClick={() => setSettings(prev => ({ ...prev, ai: { ...prev.ai, masterPrompt: DEFAULT_SETTINGS.ai.masterPrompt } }))}
                  >
                    Reset to Default
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                This prompt is sent as the "System" message for every check. It defines the persona and output format.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-base font-semibold">Prompts (Variable)</Label>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      {/* Using portal to break out of overflow:hidden containers */}
                      <TooltipContent
                        className="max-w-xs bg-popover text-popover-foreground shadow-md border z-[9999]"
                        side="right"
                        align="start"
                      >
                        <div className="space-y-2 text-xs">
                          <p>Specific questions for each check (e.g. "Is this for kids?").</p>
                          <p className="font-semibold text-destructive">Required placeholders:</p>
                          <ul className="list-disc pl-4 space-y-1 font-mono">
                            <li>Title: &#123;title&#125;</li>
                            <li>Description: &#123;description&#125;</li>
                            <li>Latest Videos: &#123;videoTitles&#125;</li>
                          </ul>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
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

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={(event) => {
                  const { active, over } = event;
                  if (active.id !== over?.id) {
                    setSettings(prev => {
                      const oldIndex = prev.ai.prompts.findIndex(p => p.id === active.id);
                      const newIndex = prev.ai.prompts.findIndex(p => p.id === over?.id);
                      return {
                        ...prev,
                        ai: {
                          ...prev.ai,
                          prompts: arrayMove(prev.ai.prompts, oldIndex, newIndex)
                        }
                      };
                    });
                  }
                }}
              >
                <SortableContext
                  items={settings.ai.prompts.map(p => p.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-4">
                    {settings.ai.prompts.map((prompt, idx) => (
                      <SortableItem key={prompt.id} id={prompt.id}>
                        <div className="border rounded-lg p-4 space-y-3 relative group">
                          <div className="flex items-center justify-between">
                            <Input
                              value={prompt.name}
                              onChange={(e) => {
                                const newPrompts = [...settings.ai.prompts];
                                newPrompts[idx] = { ...newPrompts[idx], name: e.target.value };
                                setSettings(prev => ({ ...prev, ai: { ...prev.ai, prompts: newPrompts } }));
                              }}
                              className="font-medium border-none shadow-none p-0 h-auto focus-visible:ring-0 w-full max-w-[200px] bg-transparent"
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
                      </SortableItem>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
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


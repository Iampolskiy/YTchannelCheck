"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bot, Plus, Trash2 } from "lucide-react";

// Default AI Configuration
const DEFAULT_AI_CONFIG = {
  models: [
    { id: "default-llama3", name: "Llama 3 (8b)", server: "http://127.0.0.1", port: "11434", modelName: "llama3:8b", isDefault: true }
  ]
};

export function AIConfiguration() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState(DEFAULT_AI_CONFIG);
  const [newModel, setNewModel] = useState({ name: "", server: "http://127.0.0.1", port: "11434", modelName: "" });
  const [isAdding, setIsAdding] = useState(false);

  // Load config from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("aiConfig");
    if (stored) {
      try {
        setConfig(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse AI config", e);
      }
    }
  }, []);

  // Listen for custom event to open this dialog from other components
  useEffect(() => {
    const handleOpenAIConfig = () => {
      setOpen(true);
      setIsAdding(true); // Automatically show the "Add Model" form
    };

    window.addEventListener('openAIConfig', handleOpenAIConfig);
    return () => window.removeEventListener('openAIConfig', handleOpenAIConfig);
  }, []);

  const handleSave = () => {
    localStorage.setItem("aiConfig", JSON.stringify(config));
    toast.success("AI Configuration saved");
    setOpen(false);
  };

  const handleAddModel = () => {
    if (!newModel.name || !newModel.server || !newModel.port || !newModel.modelName) {
      toast.error("Please fill in all fields");
      return;
    }

    setConfig(prev => ({
      ...prev,
      models: [...prev.models, { ...newModel, id: `model-${Date.now()}`, isDefault: false }]
    }));
    setNewModel({ name: "", server: "http://127.0.0.1", port: "11434", modelName: "" });
    setIsAdding(false);
  };

  const handleDeleteModel = (id: string) => {
    setConfig(prev => ({
      ...prev,
      models: prev.models.filter(m => m.id !== id)
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary">
          <Bot className="h-4 w-4 mr-2" />
          AI Config
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>AI Configuration</DialogTitle>
          <DialogDescription>
            Configure AI models and server connections.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Configured Models</Label>
              <Button variant="outline" size="sm" onClick={() => setIsAdding(!isAdding)}>
                <Plus className="h-4 w-4 mr-1" /> Add Model
              </Button>
            </div>

            {isAdding && (
              <div className="p-4 border rounded-lg bg-muted/30 space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input 
                    value={newModel.name} 
                    onChange={e => setNewModel({...newModel, name: e.target.value})}
                    placeholder="e.g. My Local Llama"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Server URL</Label>
                    <Input 
                      value={newModel.server} 
                      onChange={e => setNewModel({...newModel, server: e.target.value})}
                      placeholder="http://127.0.0.1"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Port</Label>
                    <Input 
                      value={newModel.port} 
                      onChange={e => setNewModel({...newModel, port: e.target.value})}
                      placeholder="11434"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Model Name (Ollama)</Label>
                  <Input 
                    value={newModel.modelName} 
                    onChange={e => setNewModel({...newModel, modelName: e.target.value})}
                    placeholder="e.g. llama3:8b"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Cancel</Button>
                  <Button size="sm" onClick={handleAddModel}>Add</Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {config.models.map((model) => (
                <div key={model.id} className="flex items-center justify-between p-3 border rounded-md bg-card">
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {model.name}
                      {model.isDefault && <Badge variant="secondary" className="text-[10px] h-5">Default</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-1">
                      {model.server}:{model.port} ({model.modelName})
                    </div>
                  </div>
                  {!model.isDefault && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteModel(model.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export function Documentation() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex">
          📚 User Guide
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <span>📚 User Guide</span>
            <Badge variant="secondary" className="text-xs font-normal">v1.0</Badge>
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 p-6">
          <div className="space-y-8 pb-8">
            {/* Introduction */}
            <section className="space-y-4">
              <h3 className="text-xl font-semibold text-primary">Overview</h3>
              <p className="text-muted-foreground leading-relaxed">
                The <strong>YouTube Channel Filter</strong> is a tool designed to help you create precise exclusion lists for Google Ads. 
                It filters YouTube channels through a multi-stage pipeline to identify content that is suitable (Positive) or unsuitable (Negative) for your campaigns.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                <div className="p-4 border rounded-lg bg-secondary/5">
                  <div className="font-bold text-secondary mb-1">1. Import</div>
                  <div className="text-sm text-muted-foreground">Gather channels from SocialBlade, CSVs, or manual entry.</div>
                </div>
                <div className="p-4 border rounded-lg bg-primary/5">
                  <div className="font-bold text-primary mb-1">2. Filter</div>
                  <div className="text-sm text-muted-foreground">Apply rules (Location, Language) and AI analysis.</div>
                </div>
                <div className="p-4 border rounded-lg bg-destructive/5">
                  <div className="font-bold text-destructive mb-1">3. Export</div>
                  <div className="text-sm text-muted-foreground">Download Negative lists for Google Ads exclusion.</div>
                </div>
              </div>
            </section>

            {/* Workflow Steps */}
            <section>
              <h3 className="text-xl font-semibold text-primary mb-4">Workflow Steps</h3>
              <Accordion type="single" collapsible className="w-full">
                
                <AccordionItem value="item-1">
                  <AccordionTrigger className="text-lg">📥 1. Importing Channels</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-4 pt-2">
                    <p>
                      Start by adding channels to the <strong>"Unchecked"</strong> pool.
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>
                        <strong>SocialBlade Import:</strong> Select a folder containing HTML files saved from SocialBlade lists. The system extracts channel IDs automatically.
                      </li>
                      <li>
                        <strong>Manual Import:</strong> Paste YouTube channel or video URLs directly. You must select or create a <strong>Campaign</strong> to tag these imports.
                      </li>
                      <li>
                        <strong>CSV Upload:</strong> Upload a CSV file containing a list of URLs.
                      </li>
                    </ul>
                    <div className="bg-muted p-3 rounded text-sm mt-2 border-l-4 border-primary">
                      💡 <strong>Note:</strong> All imported channels start with the status <code>Unchecked</code>.
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-2">
                  <AccordionTrigger className="text-lg">🔬 2. Prefilter (Rule-Based)</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-4 pt-2">
                    <p>
                      Go to the <strong>Unchecked</strong> tab and click <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Run Prefilter Pipeline</span>.
                    </p>
                    <p>This runs fast, rule-based checks on all unchecked channels:</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Location:</strong> Must be in DACH region (Germany, Austria, Switzerland).</li>
                      <li><strong>Language:</strong> Must contain German words.</li>
                      <li><strong>Alphabet:</strong> Must use Latin characters.</li>
                      <li><strong>Topics:</strong> Checks for "Kids" or "Gaming" keywords.</li>
                    </ul>
                    <p className="mt-2">
                      Channels that <strong>fail</strong> move to <span className="text-destructive font-medium">Negative</span>.<br/>
                      Channels that <strong>pass</strong> move to <span className="text-blue-600 font-medium">Prefiltered</span>.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-3">
                  <AccordionTrigger className="text-lg">🤖 3. AI Filter (Deep Analysis)</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-4 pt-2">
                    <p>
                      Go to the <strong>Prefiltered</strong> tab and click <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">Run AI Filter</span>.
                    </p>
                    <p>
                      This sends channel data (Title, Description, Video Titles) to a local AI model (Ollama/Llama 3:8b) for deep semantic analysis.
                    </p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li>It asks: "Is this content made for kids?"</li>
                      <li>It asks: "Is this gaming content?"</li>
                    </ul>
                    <p className="mt-2">
                      If the AI answers <strong>Yes</strong> to either, the channel moves to <span className="text-destructive font-medium">Negative</span>.<br/>
                      If the AI answers <strong>No</strong> (it's safe), the channel finally moves to <span className="text-green-600 font-medium">Positive</span>.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="item-4">
                  <AccordionTrigger className="text-lg">📤 4. Exporting</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground space-y-4 pt-2">
                    <p>
                      You can export lists from the <strong>Negative</strong> or <strong>Positive</strong> tabs.
                    </p>
                    <ol className="list-decimal pl-5 space-y-2">
                      <li>Select the tab (e.g., Negative).</li>
                      <li>(Optional) Set a limit on how many rows to export.</li>
                      <li>Click the <strong>Export</strong> button.</li>
                    </ol>
                    <p>
                      This will download a <code>.csv</code> file formatted for Google Ads Placement Exclusion lists.
                    </p>
                  </AccordionContent>
                </AccordionItem>

              </Accordion>
            </section>

            {/* FAQ / Troubleshooting */}
            <section className="space-y-4">
              <h3 className="text-xl font-semibold text-primary">Troubleshooting</h3>
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Why is my channel "Negative"?</h4>
                  <p className="text-sm text-muted-foreground">
                    Check the "Negative" list. Each channel has a red badge explaining the failure reason, e.g., <code>Fail: location</code> (not in DE/AT/CH) or <code>Fail: topic</code> (detected as Kids/Gaming).
                  </p>
                </div>
                <div className="border rounded-lg p-4">
                  <h4 className="font-semibold mb-2">AI Filter is failing?</h4>
                  <p className="text-sm text-muted-foreground">
                    Ensure <strong>Ollama</strong> is running on your machine (<code>ollama serve</code>) and you have pulled the model (<code>ollama pull llama3:8b</code>).
                  </p>
                </div>
              </div>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}


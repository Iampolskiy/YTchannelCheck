"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useStats } from "@/lib/hooks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, RotateCcw, Trash2, Power } from "lucide-react";
import useSWR from "swr";
import { Select } from "@/components/ui/select";

export function DatabaseManager() {
  const [open, setOpen] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sorting, setSorting] = useState({ column: "createdAt", direction: "desc" });
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 20 });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAllMode, setSelectAllMode] = useState(false);
  const { mutate: mutateStats } = useStats();

  // Fetch channels with sorting, filtering, and pagination
  const { data, isLoading, mutate } = useSWR(
    `/channels?limit=${pagination.pageSize}&skip=${pagination.pageIndex * pagination.pageSize}&sortBy=${sorting.column}&sortDir=${sorting.direction}&q=${searchQuery}`,
    (url) => api<{ channels: any[], total: number }>(url)
  );

  const channels = data?.channels || [];
  const total = data?.total || 0;

  // Handle single delete
  const handleDelete = async (youtubeId: string) => {
    try {
      await api<{ ok: true }>(`/channels/${youtubeId}`, { method: 'DELETE' });
      toast.success("Channel deleted");
      mutate();
      mutateStats();
    } catch (error) {
      toast.error("Failed to delete channel");
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (!selectAllMode && selectedIds.length === 0) return;
    
    try {
      if (selectAllMode) {
        await api<{ ok: true, deletedCount: number }>('/channels/bulk-delete', { 
          method: 'POST', 
          body: JSON.stringify({ 
            q: searchQuery,
            deleteAllMatching: true 
          }) 
        });
        toast.success(`Deleted all matching channels`);
      } else {
        await api<{ ok: true, deletedCount: number }>('/channels/bulk-delete', { 
          method: 'POST', 
          body: JSON.stringify({ youtubeIds: selectedIds }) 
        });
        toast.success(`Deleted ${selectedIds.length} channels`);
      }
      
      setSelectedIds([]);
      setSelectAllMode(false);
      mutate();
      mutateStats();
    } catch (error) {
      toast.error("Failed to delete channels");
    }
  };

  // Handle Global Reset
  const handleGlobalReset = async () => {
    const toastId = toast.loading("Resetting database...");
    try {
      // Assuming endpoint is POST /api/channels/reset with body { target: 'all' | 'negative' ... }
      // Since that endpoint is not implemented in the current turn, we should add it.
      // But for now, let's use the mass delete logic if 'all' is selected?
      // No, let's call the proper endpoint which we will implement.
      
      const res = await api<{ ok: true, deletedCount: number }>('/channels/reset', {
        method: 'POST',
        body: JSON.stringify({ target: resetTarget })
      });
      
      toast.success(`Reset complete. Deleted ${res.deletedCount} channels.`, { id: toastId });
      setResetDialogOpen(false);
      mutate();
      mutateStats();
    } catch (error) {
      toast.error("Failed to reset database", { id: toastId });
    }
  };

  // Handle status update
  const handleUpdateStatus = async (youtubeId: string, newStatus: string) => {
    try {
      await api(`/channels/${youtubeId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      toast.success(`Status updated to ${newStatus}`);
      mutate();
      mutateStats();
    } catch (error) {
      toast.error("Failed to update status");
    }
  };

  // Sort handler
  const handleSort = (column: string) => {
    setSorting(prev => ({
      column,
      direction: prev.column === column && prev.direction === "asc" ? "desc" : "asc"
    }));
    setPagination({ ...pagination, pageIndex: 0 }); // Reset to page 1 on sort change
  };

  // Selection handlers
  const handleSelectAllPage = (checked: boolean) => {
    if (checked) {
      const pageIds = channels.map((c: any) => c.youtubeId);
      const newIds = [...new Set([...selectedIds, ...pageIds])];
      setSelectedIds(newIds);
    } else {
      const pageIds = channels.map((c: any) => c.youtubeId);
      setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
      setSelectAllMode(false);
    }
  };

  const handleSelectOne = (youtubeId: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, youtubeId]);
    } else {
      setSelectedIds(prev => prev.filter(id => id !== youtubeId));
      setSelectAllMode(false); 
    }
  };

  const handleSelectAllMatching = () => {
    setSelectAllMode(true);
    const pageIds = channels.map((c: any) => c.youtubeId);
    setSelectedIds([...new Set([...selectedIds, ...pageIds])]);
  };

  const isPageSelected = channels.length > 0 && channels.every((c: any) => selectedIds.includes(c.youtubeId));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="hidden sm:flex bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary">
          🗄️ Database Manager
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b shrink-0 flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <DialogTitle className="text-2xl font-bold flex items-center gap-2">
              <span>🗄️ Database Manager</span>
              <Badge variant="outline" className="ml-2 font-normal text-xs">{total} Total</Badge>
            </DialogTitle>
            <DialogDescription>
              View, search, sort, and manage all stored channels.
            </DialogDescription>
          </div>
          
          <div className="flex items-center gap-2">
            {(selectedIds.length > 0 || selectAllMode) && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="flex items-center gap-2 mr-2">
                    <Trash2 className="h-4 w-4" />
                    {selectAllMode ? `Delete All Matching (${total})` : `Delete Selected (${selectedIds.length})`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Channels?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/10">
                  <Power className="h-4 w-4 mr-2" />
                  Reset Database
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reset Database</DialogTitle>
                  <DialogDescription>
                    Select which data you want to permanently delete.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="py-4">
                  <div className="mb-4">
                    <label className="text-sm font-medium mb-2 block">Target to Delete</label>
                    <select 
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                      value={resetTarget}
                      onChange={(e) => setResetTarget(e.target.value)}
                    >
                      <option value="all">Everything (Factory Reset)</option>
                      <option value="negative">Negative Channels Only</option>
                      <option value="positive">Positive Channels Only</option>
                      <option value="unchecked">Unchecked Channels Only</option>
                    </select>
                  </div>
                  
                  {resetTarget === 'all' && (
                    <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-md border border-destructive/20">
                      ⚠️ Warning: This will delete <strong>ALL {total} channels</strong> and cannot be undone.
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setResetDialogOpen(false)}>Cancel</Button>
                  <Button variant="destructive" onClick={handleGlobalReset}>
                    Confirm Reset
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </DialogHeader>

        <div className="p-4 border-b bg-muted/20 flex gap-4 items-center">
          <Input 
            placeholder="Search by ID, Title, or URL..." 
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPagination({ ...pagination, pageIndex: 0 }); setSelectedIds([]); setSelectAllMode(false); }}
            className="flex-1 max-w-md"
          />
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Page {pagination.pageIndex + 1} of {Math.ceil(total / pagination.pageSize) || 1}</span>
            <div className="flex gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPagination(p => ({ ...p, pageIndex: Math.max(0, p.pageIndex - 1) }))}
                disabled={pagination.pageIndex === 0}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPagination(p => ({ ...p, pageIndex: p.pageIndex + 1 }))}
                disabled={(pagination.pageIndex + 1) * pagination.pageSize >= total}
              >
                Next
              </Button>
            </div>
          </div>
        </div>

        {/* Select All Banner */}
        {selectedIds.length > 0 && !selectAllMode && total > channels.length && (
          <div className="bg-primary/5 p-2 text-center text-sm border-b">
            <span className="text-muted-foreground">You have selected <strong>{selectedIds.length}</strong> items on this page. </span>
            <button 
              className="text-primary font-medium hover:underline ml-2"
              onClick={handleSelectAllMatching}
            >
              Select all <strong>{total}</strong> matching channels
            </button>
          </div>
        )}

        {selectAllMode && (
          <div className="bg-primary/10 p-2 text-center text-sm border-b">
            <span className="text-primary font-medium">All <strong>{total}</strong> matching channels are selected. </span>
            <button 
              className="text-muted-foreground hover:underline ml-2"
              onClick={() => { setSelectAllMode(false); setSelectedIds([]); }}
            >
              Clear selection
            </button>
          </div>
        )}
        
        <div className="flex-1 overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
              <TableRow>
                <TableHead className="w-[40px] px-4">
                  <Checkbox 
                    checked={isPageSelected}
                    onCheckedChange={(checked) => handleSelectAllPage(!!checked)}
                  />
                </TableHead>
                <TableHead className="w-[300px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('channelInfo.title')}>
                  Channel <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
                </TableHead>
                <TableHead className="w-[150px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('youtubeId')}>
                  ID <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
                </TableHead>
                <TableHead className="w-[100px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('channelInfo.country')}>
                  Country <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
                </TableHead>
                <TableHead className="w-[100px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('status')}>
                  Status <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
                </TableHead>
                <TableHead className="w-[150px] cursor-pointer hover:bg-muted/50" onClick={() => handleSort('createdAt')}>
                  Imported <ArrowUpDown className="ml-2 h-4 w-4 inline-block" />
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">Loading data...</TableCell>
                </TableRow>
              ) : channels.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">No channels found.</TableCell>
                </TableRow>
              ) : (
                channels.map((channel: any) => (
                  <TableRow key={channel.youtubeId} data-state={selectedIds.includes(channel.youtubeId) ? "selected" : undefined}>
                    <TableCell className="px-4">
                      <Checkbox 
                        checked={selectedIds.includes(channel.youtubeId) || selectAllMode}
                        onCheckedChange={(checked) => handleSelectOne(channel.youtubeId, !!checked)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded bg-secondary/20 flex items-center justify-center text-secondary-foreground font-bold shrink-0">
                          {channel.channelInfo?.title?.[0] || "?"}
                        </div>
                        <div className="flex flex-col">
                          <span>{channel.channelInfo?.title || "Unknown Title"}</span>
                          <a href={channel.youtubeUrl} target="_blank" className="text-xs text-muted-foreground hover:underline">
                            Open on YouTube
                          </a>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{channel.youtubeId}</TableCell>
                    <TableCell>{channel.channelInfo?.country || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={
                        channel.status === 'positive' ? 'success' : 
                        channel.status === 'negative' ? 'destructive' : 
                        channel.status === 'prefiltered' ? 'info' : 'secondary'
                      }>
                        {channel.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(channel.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          title="Reset to Unchecked"
                          onClick={() => handleUpdateStatus(channel.youtubeId, "unchecked")}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Channel?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove <strong>{channel.channelInfo?.title || channel.youtubeId}</strong> from the database.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(channel.youtubeId)}>Delete</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

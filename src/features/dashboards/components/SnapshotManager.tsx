import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Badge } from "@/shared/components/ui/badge";
import { ScrollArea } from "@/shared/components/ui/scroll-area";
import { Camera, History, Trash2, RotateCcw, Save, CheckCircle2 } from "lucide-react";
import { useSnapshotStore } from "../store/snapshotStore";
import { useDashboardStore } from "../store/dashboardStore";

interface SnapshotManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SnapshotManager({ isOpen, onClose }: SnapshotManagerProps) {
  const snapshots = useSnapshotStore((state) => state.snapshots);
  const addSnapshot = useSnapshotStore((state) => state.addSnapshot);
  const deleteSnapshot = useSnapshotStore((state) => state.deleteSnapshot);
  const restoreSnapshot = useSnapshotStore((state) => state.restoreSnapshot);

  const past = useDashboardStore((state) => state.past);
  const future = useDashboardStore((state) => state.future);
  const undo = useDashboardStore((state) => state.undo);
  const redo = useDashboardStore((state) => state.redo);
  const restoreSnapshotState = useDashboardStore((state) => state.restoreSnapshotState);

  const [activeTab, setActiveTab] = useState<"snapshots" | "history">("snapshots");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSaveSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = addSnapshot(name, description);
    if (created) {
      setName("");
      setDescription("");
    }
  };

  const handleRestoreSnapshot = (id: string) => {
    restoreSnapshot(id);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col glass border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Camera className="h-5 w-5 text-primary" />
            Workspace Snapshot & History Recovery
          </DialogTitle>
          <DialogDescription>
            Save named snapshots of your workspace or jump back to any point in your layout and filter history.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Headers */}
        <div className="flex border-b border-border mb-4">
          <button
            type="button"
            className={`flex items-center gap-2 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "snapshots"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("snapshots")}
          >
            <Camera className="h-4 w-4" />
            Named Snapshots ({snapshots.length})
          </button>
          <button
            type="button"
            className={`flex items-center gap-2 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("history")}
          >
            <History className="h-4 w-4" />
            Undo History Timeline ({past.length} past / {future.length} future)
          </button>
        </div>

        {/* Tab Contents */}
        {activeTab === "snapshots" ? (
          <div className="flex-1 flex flex-col min-h-0 space-y-4">
            {/* Create Snapshot Form */}
            <form onSubmit={handleSaveSnapshot} className="p-4 rounded-lg border border-border/60 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold flex items-center gap-1.5">
                  <Save className="h-4 w-4 text-primary" /> Save Workspace Snapshot
                </h4>
                <Badge variant="outline" className="text-xs">
                  Persisted to browser storage
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="snapshot-name" className="text-xs">
                    Snapshot Name *
                  </Label>
                  <Input
                    id="snapshot-name"
                    placeholder="e.g. Q3 Sales Layout V1"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-8 text-sm"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="snapshot-desc" className="text-xs">
                    Description (optional)
                  </Label>
                  <Input
                    id="snapshot-desc"
                    placeholder="e.g. Added revenue breakdown & KPI cards"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" size="sm" className="gap-1.5">
                  <Save className="h-3.5 w-3.5" /> Save Snapshot
                </Button>
              </div>
            </form>

            {/* Saved Snapshots List */}
            <ScrollArea className="flex-1 max-h-[300px] pr-2">
              {snapshots.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground space-y-2 border border-dashed rounded-lg">
                  <Camera className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p className="text-sm">No workspace snapshots saved yet.</p>
                  <p className="text-xs">Create a snapshot above to capture your current dashboards & dataset state.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {snapshots.map((snap) => (
                    <div
                      key={snap.id}
                      className="p-3 rounded-lg border border-border/60 bg-card hover:bg-accent/5 transition-colors flex items-center justify-between gap-4"
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm truncate">{snap.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {new Date(snap.timestamp).toLocaleString()}
                          </Badge>
                        </div>
                        {snap.description && (
                          <p className="text-xs text-muted-foreground truncate">{snap.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          <span>
                            {snap.dashboardState?.dashboards?.length || 0} dashboard(s)
                          </span>
                          <span>•</span>
                          <span>
                            {snap.dashboardState?.activeGlobalFilters?.length || 0} active filter(s)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => handleRestoreSnapshot(snap.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteSnapshot(snap.id)}
                          title="Delete Snapshot"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          /* History Timeline Tab */
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="flex items-center justify-between bg-muted/20 p-3 rounded-lg border border-border/50">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => undo()}
                  disabled={past.length === 0}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Step Backward (Undo)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => redo()}
                  disabled={future.length === 0}
                  className="gap-1.5 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5 scale-x-[-1]" /> Step Forward (Redo)
                </Button>
              </div>
              <Badge variant="outline" className="text-xs">
                History Stack: {past.length} / 25 Max
              </Badge>
            </div>

            <ScrollArea className="flex-1 max-h-[320px] pr-2">
              <div className="space-y-2">
                {past.length === 0 && future.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground space-y-1 border border-dashed rounded-lg">
                    <p className="text-sm">No history steps recorded yet.</p>
                    <p className="text-xs">Make changes to your dashboard or filters to create history states.</p>
                  </div>
                ) : (
                  <>
                    {/* Future states (if any, ready to redo) */}
                    {future.map((step, idx) => (
                      <div
                        key={`future-${idx}`}
                        className="p-2.5 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/10 opacity-70 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Future Step +{future.length - idx}
                          </Badge>
                          <span>
                            {step.dashboards?.length || 0} dashboard(s), {step.activeGlobalFilters?.length || 0} filter(s)
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            restoreSnapshotState(step);
                            onClose();
                          }}
                        >
                          Jump To
                        </Button>
                      </div>
                    ))}

                    {/* Present active state */}
                    <div className="p-3 rounded-lg border-2 border-primary bg-primary/5 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold text-primary">Current Active State</span>
                      </div>
                      <Badge variant="default" className="text-[10px]">
                        Active Now
                      </Badge>
                    </div>

                    {/* Past states (undoable) */}
                    {[...past].reverse().map((step, idx) => {
                      const stepNum = past.length - idx;
                      return (
                        <div
                          key={`past-${idx}`}
                          className="p-2.5 rounded-lg border border-border/60 bg-card hover:bg-accent/5 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Badge variant="secondary" className="text-[10px]">
                              Step -{idx + 1} (History #{stepNum})
                            </Badge>
                            <span className="truncate text-muted-foreground">
                              {step.dashboards?.length || 0} dashboard(s), {step.activeGlobalFilters?.length || 0} filter(s)
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-primary/20 hover:bg-primary/10 text-primary"
                            onClick={() => {
                              restoreSnapshotState(step);
                              onClose();
                            }}
                          >
                            Revert To
                          </Button>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ShieldCheck, Trash2 } from "lucide-react";
import { useUiStore } from "@/store/uiStore";
import { CLEARED_ITEMS, clearAllLocalData } from "@/shared/services/clearLocalData";
import { toast } from "@/shared/hooks/use-toast";

/** Where the data lives, and "Clear all local data" with a confirm step listing what goes. */
export function DataPrivacyDialog() {
  const open = useUiStore((s) => s.isPrivacyOpen);
  const setOpen = useUiStore((s) => s.setIsPrivacyOpen);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const onOpenChange = (next: boolean) => {
    if (clearing) return;
    setOpen(next);
    if (!next) setConfirming(false);
  };

  const clear = async () => {
    setClearing(true);
    try {
      await clearAllLocalData();
    } catch (e) {
      console.error("Clearing local data failed:", e);
      setClearing(false);
      toast({
        title: "Local data could not be cleared",
        description: `${String(e)}. Some data may remain; close other DataVista tabs and try again.`,
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" data-testid="privacy-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Data &amp; privacy
          </DialogTitle>
          <DialogDescription>
            Files you import are read and stored in this browser only (IndexedDB and localStorage). They stay here until
            you delete them: a dataset from its menu in the sidebar, or everything below. Nothing is uploaded to a server,
            except what AI features send to the AI provider when you add your own API key (see AI settings).
          </DialogDescription>
        </DialogHeader>

        {!confirming ? (
          <Button variant="outline" className="gap-2 text-destructive" onClick={() => setConfirming(true)} data-testid="clear-local-data">
            <Trash2 className="h-4 w-4" /> Clear all local data…
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-destructive/40 p-3" role="alertdialog" aria-label="Confirm clearing all local data">
            <p className="text-sm font-semibold">This permanently deletes, from this browser:</p>
            <ul className="list-disc pl-5 text-sm space-y-1">
              {CLEARED_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">It can't be undone. The page reloads afterwards.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={clearing}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" onClick={clear} disabled={clearing} data-testid="clear-local-data-confirm">
                {clearing ? "Deleting…" : "Delete everything"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

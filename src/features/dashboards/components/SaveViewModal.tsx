import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Bookmark } from "lucide-react";

interface SaveViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function SaveViewModal({ isOpen, onClose, onSave }: SaveViewModalProps) {
  const [name, setName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name.trim());
    setName("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md glass border-white/20 shadow-2xl p-6">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Bookmark className="h-5 w-5 text-primary" />
            Bookmark Current View
          </DialogTitle>
          <DialogDescription>
            Save the volatile interactive state (global filters and active drill depths) as a quick-load bookmark.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="view-name">View Name</Label>
            <Input
              id="view-name"
              placeholder="e.g. Q3 Sales & Region Focus"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="bg-background/50"
            />
          </div>

          <DialogFooter className="mt-6 flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="premium" disabled={!name.trim()}>
              Save View
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

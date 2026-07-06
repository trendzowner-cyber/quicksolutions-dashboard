"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DiffViewer, DiffViewerHTML } from "@/components/shared/diff-viewer";
import { Loader2, Check, X, Edit3 } from "lucide-react";

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  original: string;
  suggested: string;
  label: string;
  type?: "text" | "html";
  onApprove: (finalText: string) => Promise<void>;
}

export function ReviewModal({
  open,
  onClose,
  original,
  suggested,
  label,
  type = "text",
  onApprove,
}: ReviewModalProps) {
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState(suggested);
  const [saving, setSaving] = useState(false);

  const finalText = editing ? editedText : suggested;

  async function handleApprove() {
    setSaving(true);
    try {
      await onApprove(finalText);
      onClose();
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  }

  function handleStartEdit() {
    setEditedText(suggested);
    setEditing(true);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label} Verbeteren</DialogTitle>
          <DialogDescription>
            Bekijk de AI suggestie en pas toe of wijzig handmatig.
          </DialogDescription>
        </DialogHeader>

        {editing ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Bewerk de suggestie naar wens:
            </p>
            <Textarea
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              rows={type === "html" ? 12 : 4}
              className="font-mono text-sm"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Annuleren
            </Button>
          </div>
        ) : type === "html" ? (
          <DiffViewerHTML
            original={original}
            suggested={suggested}
            label={label}
          />
        ) : (
          <DiffViewer
            original={original}
            suggested={suggested}
            label={label}
          />
        )}

        <DialogFooter className="flex flex-row gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            <X className="mr-1 h-4 w-4" />
            Annuleren
          </Button>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={handleStartEdit}>
              <Edit3 className="mr-1 h-4 w-4" />
              Handmatig Bewerken
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={saving || !finalText}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-1 h-4 w-4" />
            )}
            Toepassen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

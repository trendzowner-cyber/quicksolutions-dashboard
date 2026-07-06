"use client";

interface DiffViewerProps {
  original: string;
  suggested: string;
  label: string;
}

export function DiffViewer({ original, suggested, label }: DiffViewerProps) {
  return (
    <div className="space-y-3">
      {/* Current */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
          Huidige {label}
        </p>
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {original || "(geen inhoud)"}
          </p>
        </div>
      </div>

      {/* Suggested */}
      <div>
        <p className="text-xs font-medium text-emerald-400 mb-1.5 uppercase tracking-wider">
          AI Suggestie
        </p>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm whitespace-pre-wrap">{suggested}</p>
        </div>
      </div>
    </div>
  );
}

export function DiffViewerHTML({
  original,
  suggested,
  label,
}: DiffViewerProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Current */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
          Huidige {label}
        </p>
        <div className="rounded-lg border border-border bg-muted/30 p-4 max-h-96 overflow-y-auto">
          {original ? (
            <div
              className="prose prose-sm prose-invert max-w-none"
              dangerouslySetInnerHTML={{ __html: original }}
            />
          ) : (
            <p className="text-sm text-muted-foreground">(geen inhoud)</p>
          )}
        </div>
      </div>

      {/* Suggested */}
      <div>
        <p className="text-xs font-medium text-emerald-400 mb-1.5 uppercase tracking-wider">
          AI Suggestie
        </p>
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 max-h-96 overflow-y-auto">
          <div
            className="prose prose-sm prose-invert max-w-none"
            dangerouslySetInnerHTML={{ __html: suggested }}
          />
        </div>
      </div>
    </div>
  );
}

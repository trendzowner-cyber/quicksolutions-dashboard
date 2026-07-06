"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface PostEditorProps {
  title: string;
  content: string;
  excerpt: string;
  onTitleChange: (val: string) => void;
  onContentChange: (val: string) => void;
  onExcerptChange: (val: string) => void;
  readOnly?: boolean;
}

export function PostEditor({
  title,
  content,
  excerpt,
  onTitleChange,
  onContentChange,
  onExcerptChange,
  readOnly,
}: PostEditorProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={readOnly}
          className="text-lg font-semibold"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="excerpt">Samenvatting</Label>
        <Input
          id="excerpt"
          value={excerpt}
          onChange={(e) => onExcerptChange(e.target.value)}
          disabled={readOnly}
          placeholder="Korte samenvatting voor de blog lijst..."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="content">Inhoud (HTML)</Label>
        {readOnly ? (
          <div
            className="prose prose-sm prose-invert max-w-none rounded-lg border border-border bg-muted/30 p-4 min-h-[300px]"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        ) : (
          <Textarea
            id="content"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={20}
            className="font-mono text-sm min-h-[300px]"
            placeholder="Blog inhoud in HTML..."
          />
        )}
      </div>
    </div>
  );
}

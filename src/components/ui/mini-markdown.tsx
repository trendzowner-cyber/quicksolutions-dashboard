"use client";

// Minimal, safe Markdown renderer for AI-generated Dutch text.
// Supports: ## / ### headings, **bold**, numbered and bullet lists, paragraphs.
// Renders via React elements only — no dangerouslySetInnerHTML, no HTML passthrough.

import React from "react";

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

export function MiniMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split("\n");
  let listItems: { n: number; text: string }[] = [];
  let listType: "ol" | "ul" | null = null;
  let key = 0;

  function flushList() {
    if (!listType || !listItems.length) { listItems = []; listType = null; return; }
    if (listType === "ol") {
      blocks.push(
        <ol key={key++} className="list-decimal pl-5 space-y-1 my-2">
          {listItems.map((li, i) => <li key={i}>{renderInline(li.text)}</li>)}
        </ol>
      );
    } else {
      blocks.push(
        <ul key={key++} className="list-disc pl-5 space-y-1 my-2">
          {listItems.map((li, i) => <li key={i}>{renderInline(li.text)}</li>)}
        </ul>
      );
    }
    listItems = [];
    listType = null;
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (/^###\s/.test(line)) {
      flushList();
      blocks.push(<h4 key={key++} className="font-semibold mt-3 mb-1">{renderInline(line.replace(/^###\s+/, ""))}</h4>);
    } else if (/^##\s/.test(line)) {
      flushList();
      blocks.push(<h3 key={key++} className="font-semibold text-base mt-4 mb-1">{renderInline(line.replace(/^##\s+/, ""))}</h3>);
    } else if (/^\d+\.\s/.test(line)) {
      if (listType !== "ol") flushList();
      listType = "ol";
      listItems.push({ n: listItems.length + 1, text: line.replace(/^\d+\.\s+/, "") });
    } else if (/^[-•]\s/.test(line)) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push({ n: listItems.length + 1, text: line.replace(/^[-•]\s+/, "") });
    } else if (line) {
      flushList();
      blocks.push(<p key={key++} className="my-1.5">{renderInline(line)}</p>);
    } else {
      flushList();
    }
  }
  flushList();

  return <div className="text-sm leading-relaxed">{blocks}</div>;
}

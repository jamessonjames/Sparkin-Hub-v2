import React from "react";
import { cn } from "@/lib/utils";

interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content, className }) => {
  if (!content) return null;

  // Split lines and parse basic Markdown constructs cleanly
  const lines = content.split("\n");
  const renderedElements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
    if (inList && listItems.length > 0) {
      renderedElements.push(
        <ul key={`list-${renderedElements.length}`} className="space-y-1.5 my-2.5 pl-1">
          {listItems}
        </ul>
      );
      listItems = [];
      inList = false;
    }
  };

  // Helper to parse bold and italic inline markup
  const parseInline = (text: string): React.ReactNode => {
    // Regex for bold **text** or __text__
    const parts = text.split(/(\*\*.*?\*\*|__.*?__|`.*?`|\*.*?\*)/g);
    return parts.map((part, idx) => {
      if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
        return <strong key={idx} className="font-semibold text-zinc-100">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return <code key={idx} className="px-1.5 py-0.5 rounded bg-white/10 text-purple-300 font-mono text-[11px]">{part.slice(1, -1)}</code>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={idx} className="italic text-purple-200">{part.slice(1, -1)}</em>;
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      renderedElements.push(<div key={`br-${index}`} className="h-2" />);
      return;
    }

    // Headers
    if (trimmed.startsWith("# ")) {
      flushList();
      renderedElements.push(
        <h1 key={`h1-${index}`} className="text-base font-bold text-purple-300 pt-2 pb-1 border-b border-purple-500/20 flex items-center gap-2">
          {parseInline(trimmed.slice(2))}
        </h1>
      );
      return;
    }

    if (trimmed.startsWith("## ")) {
      flushList();
      renderedElements.push(
        <h2 key={`h2-${index}`} className="text-sm font-bold text-zinc-100 pt-3 pb-1 border-b border-white/10 flex items-center gap-2">
          {parseInline(trimmed.slice(3))}
        </h2>
      );
      return;
    }

    if (trimmed.startsWith("### ")) {
      flushList();
      renderedElements.push(
        <h3 key={`h3-${index}`} className="text-xs font-bold text-purple-300/90 pt-3 pb-0.5 flex items-center gap-1.5">
          {parseInline(trimmed.slice(4))}
        </h3>
      );
      return;
    }

    // Quotes / Warnings
    if (trimmed.startsWith("> ")) {
      flushList();
      renderedElements.push(
        <blockquote key={`quote-${index}`} className="border-l-2 border-purple-500/50 bg-purple-500/10 rounded-r-lg px-3 py-2 text-xs text-purple-200/90 my-2">
          {parseInline(trimmed.slice(2))}
        </blockquote>
      );
      return;
    }

    // Bullet Lists (- or * or •)
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      inList = true;
      const bulletText = trimmed.replace(/^[-*•]\s+/, "");
      listItems.push(
        <li key={`li-${index}`} className="text-xs text-zinc-300 leading-relaxed flex items-start gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-400 mt-1.5 shrink-0" />
          <span className="flex-1">{parseInline(bulletText)}</span>
        </li>
      );
      return;
    }

    // Regular paragraphs
    flushList();
    renderedElements.push(
      <p key={`p-${index}`} className="text-xs text-zinc-300 leading-relaxed">
        {parseInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className={cn("space-y-1 font-sans", className)}>{renderedElements}</div>;
};

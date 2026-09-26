"use client";

import type { ComponentProps, KeyboardEvent } from "react";
import { Textarea } from "./ui";

// Ключи по e.code (физическая клавиша), а не e.key — иначе Ctrl+B/I/U не
// сработает при русской/таджикской раскладке (e.key даёт кириллицу).
const WRAP: Record<string, string> = { KeyB: "**", KeyI: "_", KeyU: "__" };

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function wrapSelection(el: HTMLTextAreaElement, marker: string) {
  const { selectionStart: start, selectionEnd: end, value } = el;
  const selected = value.slice(start, end) || "текст";
  setNativeValue(el, value.slice(0, start) + marker + selected + marker + value.slice(end));
  requestAnimationFrame(() => el.setSelectionRange(start + marker.length, start + marker.length + selected.length));
}

function toggleHeading(el: HTMLTextAreaElement) {
  const { selectionStart: start, value } = el;
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEnd = value.indexOf("\n", start);
  const line = value.slice(lineStart, lineEnd === -1 ? value.length : lineEnd);
  const next = line.startsWith("# ") ? line.slice(2) : "# " + line;
  const delta = next.length - line.length;
  setNativeValue(el, value.slice(0, lineStart) + next + value.slice(lineStart + line.length));
  requestAnimationFrame(() => el.setSelectionRange(start + delta, start + delta));
}

function toggleStrikethrough(el: HTMLTextAreaElement) {
  wrapSelection(el, "~~");
}

/**
 * Textarea с горячими клавишами как в Word: Ctrl+B/I/U — жирный/курсив/подчёркнутый,
 * Ctrl+Shift+X — зачёркнутый, Ctrl+Alt+1 — заголовок строки. Хранит разметку как
 * простой markdown-подобный текст (**bold**, _italic_, __underline__, ~~strike~~, # heading) —
 * рендерится через <FormattedText> (src/components/formatted-text.tsx).
 */
export function RichTextarea(props: ComponentProps<typeof Textarea>) {
  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && WRAP[e.code]) {
      e.preventDefault();
      wrapSelection(e.currentTarget, WRAP[e.code]);
    } else if (mod && e.shiftKey && e.code === "KeyX") {
      e.preventDefault();
      toggleStrikethrough(e.currentTarget);
    } else if (mod && e.altKey && e.code === "Digit1") {
      e.preventDefault();
      toggleHeading(e.currentTarget);
    }
    props.onKeyDown?.(e);
  }

  return <Textarea {...props} onKeyDown={handleKeyDown} />;
}

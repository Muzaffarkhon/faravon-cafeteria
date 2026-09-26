import type { JSX } from "react";

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|_[^_]+_)/g;

function renderInline(text: string, keyPrefix: string) {
  return text.split(INLINE).filter(Boolean).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={key}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("__") && part.endsWith("__")) return <u key={key}>{part.slice(2, -2)}</u>;
    if (part.startsWith("~~") && part.endsWith("~~")) return <s key={key}>{part.slice(2, -2)}</s>;
    if (part.startsWith("_") && part.endsWith("_")) return <em key={key}>{part.slice(1, -1)}</em>;
    return part;
  });
}

/**
 * Рендерит текст с простой markdown-подобной разметкой, которую вводят через
 * горячие клавиши в <RichTextarea> (жирный/курсив/подчёркнутый/зачёркнутый/заголовок).
 * Без dangerouslySetInnerHTML — разбор строкой/regex, безопасно для любого ввода.
 */
export function FormattedText({ text, className }: { text: string; className?: string }): JSX.Element {
  const lines = text.split("\n");
  return (
    <div className={className}>
      {lines.map((line, i) => {
        if (line.startsWith("# ")) {
          return (
            <p key={i} className="font-bold">
              {renderInline(line.slice(2), `${i}`)}
            </p>
          );
        }
        return <p key={i}>{line ? renderInline(line, `${i}`) : " "}</p>;
      })}
    </div>
  );
}

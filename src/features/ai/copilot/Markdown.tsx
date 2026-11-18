/**
 * A small Markdown renderer for copilot answers: paragraphs, headings, bullet and numbered
 * lists, **bold**, *italic*, `code`, fenced code blocks and pipe tables. The model's text is
 * untrusted, so it becomes React elements only (no innerHTML) and links are shown as text.
 */
import { Fragment, type ReactNode } from "react";
import { parseMarkdown } from "./markdownParse";

/** Inline: `code`, **bold**, *italic* / _italic_, [text](url) shown as text. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*|__[^_]+__)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    if (m[1]) out.push(<code key={k++} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{t.slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k++} className="font-semibold">{renderInline(t.slice(2, -2))}</strong>);
    else if (m[3]) out.push(<em key={k++}>{renderInline(t.slice(1, -1))}</em>);
    else out.push(t.slice(1, t.indexOf("]")));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  return (
    <div className="space-y-2 break-words text-sm leading-relaxed">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "h":
            return (
              <p key={i} className="font-semibold">
                {renderInline(b.text)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal space-y-1 pl-5">
                {b.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          case "code":
            return (
              <pre key={i} className="overflow-x-auto rounded-md bg-muted p-2 font-mono text-xs">
                <code>{b.text}</code>
              </pre>
            );
          case "table":
            return (
              <div key={i} className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table">
                <table className="w-full border-collapse text-xs tabular-nums">
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} scope="col" className="border-b border-border px-2 py-1 text-left font-semibold">
                          {renderInline(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, n) => (
                          <td key={n} className="border-b border-border/60 px-2 py-1">
                            {renderInline(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i}>{b.text.split("  ").map((t, j) => <Fragment key={j}>{renderInline(t)}</Fragment>)}</p>;
        }
      })}
    </div>
  );
}

/**
 * A small Markdown renderer for copilot answers: paragraphs, headings, bullet and numbered
 * lists, **bold**, *italic*, `code`, fenced code blocks and pipe tables. The model's text is
 * untrusted, so it becomes React elements only (no innerHTML) and links are shown as text.
 */
import { Fragment, type ReactNode } from "react";
import { parseInline, parseMarkdown, type Inline } from "./markdownParse";

/** Inline: `code`, **bold**, *italic* / _italic_ (CommonMark intraword rules), [text](url) shown as text. */
function renderNodes(nodes: Inline[]): ReactNode[] {
  return nodes.map((n, k) => {
    if (n.kind === "text") return <Fragment key={k}>{n.text}</Fragment>;
    if (n.kind === "code") return <code key={k} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">{n.text}</code>;
    if (n.kind === "strong") return <strong key={k} className="font-semibold">{renderNodes(n.children)}</strong>;
    return <em key={k}>{renderNodes(n.children)}</em>;
  });
}

const renderInline = (text: string) => renderNodes(parseInline(text));

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

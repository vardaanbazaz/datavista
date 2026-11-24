/** Block structure of the copilot's Markdown (rendered by Markdown.tsx). */
export type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; level: number; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; text: string }
  | { kind: "table"; head: string[]; rows: string[][] };

const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
      out.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flush();
      out.push({ kind: "h", level: h[1].length, text: h[2] });
      continue;
    }
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      flush();
      const head = cells(line);
      const rows: string[][] = [];
      for (i += 2; i < lines.length && lines[i].includes("|") && lines[i].trim(); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ kind: "table", head, rows });
      continue;
    }
    const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul || ol) {
      flush();
      const kind = ul ? "ul" : "ol";
      const last = out[out.length - 1];
      const item = (ul ?? ol)![1];
      if (last && last.kind === kind) last.items.push(item);
      else out.push({ kind, items: [item] });
      continue;
    }
    // A continuation line of a list item.
    const last = out[out.length - 1];
    if (!para.length && last && (last.kind === "ul" || last.kind === "ol") && /^\s{2,}/.test(line)) {
      last.items[last.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    para.push(line.trim());
  }
  flush();
  return out;
}


/** Inline Markdown: plain text, `code`, **strong**, *emphasis*; links are kept as their text. */
export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong" | "em"; children: Inline[] };

const WORD = /[\p{L}\p{N}]/u;
const SPACE = /\s/;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)/;

const isWord = (c: string | undefined) => c !== undefined && WORD.test(c);
const isSpace = (c: string | undefined) => c === undefined || SPACE.test(c);

/**
 * Whether the delimiter run `delim` at `i` can open / close emphasis. CommonMark's flanking
 * rules, simplified: `*` opens when followed by non-space and closes when preceded by
 * non-space, so it also works inside a word (a*b*c). `_` additionally may not touch a letter
 * or digit on its outer side, so underscores inside words stay literal (ART_AND_DESIGN,
 * snake_case_name, foo__bar__).
 */
function canOpen(s: string, i: number, delim: string): boolean {
  if (isSpace(s[i + delim.length])) return false;
  return delim[0] === "*" || !isWord(s[i - 1]);
}

function canClose(s: string, j: number, delim: string): boolean {
  if (isSpace(s[j - 1])) return false;
  return delim[0] === "*" || !isWord(s[j + delim.length]);
}

/** The closing run for an opener at `from` (content starts there), or -1. */
function findCloser(s: string, from: number, delim: string): number {
  for (let j = from + 1; j <= s.length - delim.length; j++) {
    if (s[j] === "`") {
      // Skip code spans: emphasis never closes inside one.
      const end = s.indexOf("`", j + 1);
      if (end !== -1) j = end;
      continue;
    }
    if (!s.startsWith(delim, j)) continue;
    // A single delimiter must not be half of a double one (`*a **b** c*` closes at the last *).
    if (delim.length === 1 && s[j + 1] === delim) {
      j++;
      continue;
    }
    if (canClose(s, j, delim)) return j;
  }
  return -1;
}

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const pushText = (t: string) => {
    text += t;
  };
  const flush = () => {
    if (text) out.push({ kind: "text", text });
    text = "";
  };
  for (let i = 0; i < s.length; ) {
    const c = s[i];
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ kind: "code", text: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (c === "[") {
      const m = LINK.exec(s.slice(i));
      if (m) {
        pushText(m[1]);
        i += m[0].length;
        continue;
      }
    }
    if (c === "*" || c === "_") {
      const delim = s[i + 1] === c ? c + c : c;
      if (canOpen(s, i, delim)) {
        const j = findCloser(s, i + delim.length, delim);
        if (j > i + delim.length) {
          flush();
          out.push({ kind: delim.length === 2 ? "strong" : "em", children: parseInline(s.slice(i + delim.length, j)) });
          i = j + delim.length;
          continue;
        }
      }
      pushText(delim);
      i += delim.length;
      continue;
    }
    pushText(c);
    i++;
  }
  flush();
  return out;
}

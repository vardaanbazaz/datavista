import type { Selection } from "d3";

/** Labels longer than this are cut with "…"; the full text stays in the tick's <title>. */
export const MAX_TICK_CHARS = 16;
/** Smallest gap between two visible labels, px. */
const LABEL_GAP = 4;
const COS45 = Math.SQRT1_2;

/**
 * How many ticks to skip so labels never overlap, and whether turning them -45° helps.
 * `spacing` is the smallest distance between neighbouring ticks, `labelWidth` the widest
 * label, `labelHeight` the text height (all px). A turned label's upright box is
 * (w + h)·cos45 wide, so turning helps only for labels much wider than they are tall;
 * comparing upright boxes means visible labels' bounding boxes never intersect either way.
 */
export function tickLayout(spacing: number, labelWidth: number, labelHeight: number): { step: number; rotate: boolean } {
  if (!(spacing > 0)) return { step: 1, rotate: false };
  const flatStep = Math.max(1, Math.ceil((labelWidth + LABEL_GAP) / spacing));
  const turnedStep = Math.max(1, Math.ceil(((labelWidth + labelHeight) * COS45 + LABEL_GAP) / spacing));
  return turnedStep < flatStep ? { step: turnedStep, rotate: true } : { step: flatStep, rotate: false };
}

export function truncateLabel(text: string, max = MAX_TICK_CHARS): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function tickX(tick: SVGGElement): number {
  const m = /translate\(\s*([-\d.e]+)/.exec(tick.getAttribute("transform") || "");
  return m ? Number(m[1]) : NaN;
}

/**
 * Lays out the labels of a bottom axis drawn by d3.axisBottom: cuts long labels (full text
 * in a <title>), then shows every Nth label so none overlap, turned -45° only when that
 * fits more labels. Works for band, point, linear and time scales (reads each tick's x).
 * Hidden labels keep their tick mark. Needs the axis in the document (text measuring).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function layoutBottomAxisLabels(axis: Selection<SVGGElement, any, any, any>): void {
  const ticks = axis.selectAll<SVGGElement, unknown>(".tick").nodes();
  if (!ticks.length) return;

  let widest = 0;
  let height = 0;
  for (const tick of ticks) {
    const text = tick.querySelector("text");
    if (!text) continue;
    const full = text.textContent || "";
    const shown = truncateLabel(full);
    if (shown !== full) {
      text.textContent = shown;
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = full;
      text.appendChild(title);
    }
    const box = text.getBBox();
    widest = Math.max(widest, box.width);
    height = Math.max(height, box.height);
  }

  const xs = ticks.map(tickX).filter(Number.isFinite).sort((a, b) => a - b);
  let spacing = Infinity;
  for (let i = 1; i < xs.length; i++) spacing = Math.min(spacing, xs[i] - xs[i - 1]);
  const { step, rotate } = xs.length > 1 ? tickLayout(spacing, widest, height) : { step: 1, rotate: false };

  ticks.forEach((tick, i) => {
    const text = tick.querySelector("text");
    if (!text) return;
    if (i % step !== 0) {
      text.setAttribute("display", "none");
      return;
    }
    text.removeAttribute("display");
    if (rotate) {
      text.style.textAnchor = "end";
      text.setAttribute("dx", "-.6em");
      // A little lower than d3's default so the first label clears the Y axis's bottom label.
      text.setAttribute("dy", ".6em");
      text.setAttribute("transform", "rotate(-45)");
    } else {
      text.style.textAnchor = "middle";
      text.removeAttribute("dx");
      text.removeAttribute("transform");
    }
  });
}

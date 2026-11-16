/**
 * Server-sent events parser (the subset the AI providers use): `event:` and `data:` fields,
 * multi-line data, comment lines (": keep-alive"), CRLF/CR/LF line ends, and chunks split
 * anywhere, including mid-line and mid-character.
 */
export interface SseEvent {
  event?: string;
  data: string;
}

export async function* parseSse(stream: ReadableStream<Uint8Array>, onChunk?: () => void): AsyncGenerator<SseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | undefined;
  let data: string[] = [];

  const flush = (): SseEvent | null => {
    if (data.length === 0) {
      event = undefined;
      return null;
    }
    const out: SseEvent = { event, data: data.join("\n") };
    event = undefined;
    data = [];
    return out;
  };

  function* processLines(final: boolean): Generator<SseEvent> {
    for (;;) {
      const match = /\r\n|\r|\n/.exec(buffer);
      if (!match) break;
      // A lone "\r" at the very end may be the first half of "\r\n": wait for more.
      if (match[0] === "\r" && match.index === buffer.length - 1 && !final) break;
      const line = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (line === "") {
        const ev = flush();
        if (ev) yield ev;
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "data") data.push(value);
      else if (field === "event") event = value;
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk?.();
      buffer += decoder.decode(value, { stream: true });
      yield* processLines(false);
    }
    buffer += decoder.decode();
    yield* processLines(true);
    // Stream ended without a trailing blank line.
    if (buffer !== "") {
      buffer += "\n";
      yield* processLines(true);
    }
    const last = flush();
    if (last) yield last;
  } finally {
    reader.releaseLock();
  }
}

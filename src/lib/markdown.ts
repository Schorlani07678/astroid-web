/**
 * Lightweight, dependency-free Markdown parser for AI assistant replies.
 *
 * Produces a small typed AST that is rendered with React elements (see
 * `components/chat/MarkdownMessage`). Nothing is ever turned into raw HTML, so
 * model output cannot inject markup or scripts — the AST *is* the sanitizer.
 *
 * Supported subset (what financial briefings actually use):
 * - Paragraphs (single newlines are preserved as line breaks)
 * - Headings `#`, `##`, `###`
 * - Unordered (`-`, `*`, `+`) and ordered (`1.` / `1)`) lists
 * - Fenced code blocks (```lang … ```); an unterminated fence renders as code
 *   so partially streamed replies stay readable
 * - Inline: **bold** / __bold__, *italic* / _italic_, `code`, [links](https://…)
 *
 * Links are only emitted for `http:`, `https:` and `mailto:` targets; anything
 * else (e.g. `javascript:`) degrades to its plain label.
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: InlineNode[] };

export type BlockNode =
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'heading'; level: 1 | 2 | 3; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; start: number; items: InlineNode[][] }
  | { type: 'code'; language: string | null; value: string };

const FENCE_RE = /^\s*```\s*([\w+-]*)\s*$/;
const HEADING_RE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const UNORDERED_RE = /^\s*[-*+]\s+(.*)$/;
const ORDERED_RE = /^\s*(\d{1,9})[.)]\s+(.*)$/;
const CONTINUATION_RE = /^\s{2,}\S/;
const SAFE_URL_RE = /^(?:https?:\/\/|mailto:)/i;

const isWordChar = (char: string | undefined): boolean => !!char && /[\p{L}\p{N}]/u.test(char);

/** Returns true when `href` is safe to render as a clickable link. */
export function isSafeHref(href: string): boolean {
  return SAFE_URL_RE.test(href.trim());
}

function pushText(nodes: InlineNode[], value: string): void {
  if (!value) return;
  const last = nodes[nodes.length - 1];
  if (last && last.type === 'text') {
    last.value += value;
  } else {
    nodes.push({ type: 'text', value });
  }
}

/** Parses inline formatting within a single block of text. */
export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i]!;

    // Backslash escapes for markdown punctuation.
    if (char === '\\' && i + 1 < text.length && /[\\`*_[\]()#+\-.!]/.test(text[i + 1]!)) {
      pushText(nodes, text[i + 1]!);
      i += 2;
      continue;
    }

    if (char === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        nodes.push({ type: 'code', value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if ((char === '*' || char === '_') && text[i + 1] === char) {
      const delimiter = char + char;
      const end = text.indexOf(delimiter, i + 2);
      if (end > i + 2 && text[i + 2] !== ' ') {
        nodes.push({ type: 'strong', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (char === '*' || char === '_') {
      // `_` must not open/close inside words (snake_case identifiers).
      const canOpen = text[i + 1] !== undefined && text[i + 1] !== ' ' && text[i + 1] !== char &&
        (char === '*' || !isWordChar(text[i - 1]));
      if (canOpen) {
        let end = -1;
        for (let j = i + 1; j < text.length; j += 1) {
          if (text[j] === char && text[j - 1] !== ' ' && text[j + 1] !== char &&
            (char === '*' || !isWordChar(text[j + 1]))) {
            end = j;
            break;
          }
        }
        if (end > i + 1) {
          nodes.push({ type: 'em', children: parseInline(text.slice(i + 1, end)) });
          i = end + 1;
          continue;
        }
      }
    }

    if (char === '[') {
      const match = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(text.slice(i));
      if (match) {
        const [whole, label, href] = match as unknown as [string, string, string];
        const children = parseInline(label);
        if (isSafeHref(href)) {
          nodes.push({ type: 'link', href: href.trim(), children });
        } else {
          for (const child of children) {
            if (child.type === 'text') pushText(nodes, child.value);
            else nodes.push(child);
          }
        }
        i += whole.length;
        continue;
      }
    }

    pushText(nodes, char);
    i += 1;
  }

  return nodes;
}

/** Parses a Markdown document into block nodes. */
export function parseMarkdown(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: BlockNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; start: number; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push({
        type: 'list',
        ordered: list.ordered,
        start: list.start,
        items: list.items.map((item) => parseInline(item)),
      });
      list = null;
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    const fence = FENCE_RE.exec(line);
    if (fence) {
      flushAll();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !FENCE_RE.test(lines[index]!)) {
        body.push(lines[index]!);
        index += 1;
      }
      blocks.push({ type: 'code', language: fence[1] || null, value: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      blocks.push({
        type: 'heading',
        level: heading[1]!.length as 1 | 2 | 3,
        children: parseInline(heading[2]!),
      });
      continue;
    }

    const unordered = UNORDERED_RE.exec(line);
    const ordered = unordered ? null : ORDERED_RE.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      const content = (unordered ? unordered[1] : ordered![2]) ?? '';
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, start: ordered ? Number(ordered[1]) : 1, items: [] };
      }
      list.items.push(content);
      continue;
    }

    // Indented lines continue the previous list item.
    if (list && CONTINUATION_RE.test(line)) {
      const items = list.items;
      items[items.length - 1] = `${items[items.length - 1]} ${line.trim()}`;
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushAll();
  return blocks;
}

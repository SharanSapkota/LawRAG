import { memo, useMemo, type ReactNode } from "react";

// Lightweight, dependency-free renderer for the subset of Markdown the
// model actually produces (paragraphs, lists, headings, quotes, bold,
// italics, inline code, links). Everything is rendered as React text
// nodes — never as raw HTML — so model output can't inject markup.
//
// Bracketed references like "[Section 12]" are what the system prompt asks
// the model to cite with, so they're rendered as citation chips and, when
// they match a retrieved source, become a jump link to that source.

type Block =
  | { type: "p"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "h"; text: string }
  | { type: "quote"; lines: string[] };

const HEADING_RE = /^#{1,4}\s+(.*)$/;
const UL_RE = /^\s*[-*•]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current = null as Block | null;

  // Returns null so call sites can push and reset in one statement.
  const flush = (block: Block | null): null => {
    if (block) blocks.push(block);
    return null;
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      current = flush(current);
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      current = flush(current);
      blocks.push({ type: "h", text: heading[1] });
      continue;
    }

    const ul = UL_RE.exec(line);
    const ol = ul ? null : OL_RE.exec(line);
    if (ul || ol) {
      const type = ul ? "ul" : "ol";
      const item = (ul ?? ol)![1];
      if (current?.type === type) {
        current.items.push(item);
      } else {
        current = flush(current);
        current = { type, items: [item] };
      }
      continue;
    }

    const quote = QUOTE_RE.exec(line);
    if (quote) {
      if (current?.type !== "quote") {
        current = flush(current);
        current = { type: "quote", lines: [] };
      }
      current.lines.push(quote[1]);
      continue;
    }

    // Indented continuation of a list item.
    if ((current?.type === "ul" || current?.type === "ol") && /^\s{2,}/.test(rawLine)) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
      continue;
    }

    if (current?.type !== "p") {
      current = flush(current);
      current = { type: "p", lines: [] };
    }
    current.lines.push(line);
  }

  flush(current);
  return blocks;
}

const INLINE_PATTERN =
  /\*\*([^*]+)\*\*|\[([^\]\n]{1,160})\]\((https?:\/\/[^\s)]+)\)|\[([^\]\n]{1,160})\]|`([^`\n]+)`|\*([^*\n]+)\*/g;

export type CitationResolver = (citation: string) => number | null;

interface InlineContext {
  resolveCitation?: CitationResolver;
  onCitationClick?: (index: number) => void;
}

function renderInline(text: string, ctx: InlineContext, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let i = 0;

  // Fresh instance per call: renderInline recurses (bold content), and a
  // shared global regex would have its lastIndex clobbered.
  const re = new RegExp(INLINE_PATTERN.source, "g");
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${i++}`;
    const [, bold, linkText, linkHref, citation, code, italic] = match;

    if (bold !== undefined) {
      nodes.push(<strong key={key}>{renderInline(bold, ctx, key)}</strong>);
    } else if (linkText !== undefined) {
      nodes.push(
        <a key={key} href={linkHref} target="_blank" rel="noopener noreferrer">
          {linkText}
        </a>,
      );
    } else if (citation !== undefined) {
      const sourceIndex = ctx.resolveCitation?.(citation) ?? null;
      nodes.push(
        sourceIndex !== null && ctx.onCitationClick ? (
          <button
            key={key}
            type="button"
            className="citation citation-linked"
            onClick={() => ctx.onCitationClick!(sourceIndex)}
            title="Show source"
          >
            {citation}
            <sup>{sourceIndex + 1}</sup>
          </button>
        ) : (
          <span key={key} className="citation">
            {citation}
          </span>
        ),
      );
    } else if (code !== undefined) {
      nodes.push(<code key={key}>{code}</code>);
    } else if (italic !== undefined) {
      nodes.push(<em key={key}>{italic}</em>);
    }

    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function withLineBreaks(lines: string[], ctx: InlineContext, keyPrefix: string): ReactNode[] {
  return lines.flatMap((line, index) => {
    const parts = renderInline(line, ctx, `${keyPrefix}-${index}`);
    return index === 0 ? parts : [<br key={`${keyPrefix}-br-${index}`} />, ...parts];
  });
}

interface FormattedAnswerProps extends InlineContext {
  content: string;
}

export const FormattedAnswer = memo(function FormattedAnswer({
  content,
  resolveCitation,
  onCitationClick,
}: FormattedAnswerProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);
  const ctx: InlineContext = { resolveCitation, onCitationClick };

  return (
    <div className="prose">
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.type) {
          case "h":
            return <h3 key={key}>{renderInline(block.text, ctx, key)}</h3>;
          case "ul":
          case "ol": {
            const ListTag = block.type;
            return (
              <ListTag key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item, ctx, `${key}-${itemIndex}`)}</li>
                ))}
              </ListTag>
            );
          }
          case "quote":
            return <blockquote key={key}>{withLineBreaks(block.lines, ctx, key)}</blockquote>;
          default:
            return <p key={key}>{withLineBreaks(block.lines, ctx, key)}</p>;
        }
      })}
    </div>
  );
});

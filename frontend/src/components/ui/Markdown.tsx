/** Minimal markdown renderer for report section bodies — headings, lists, bold, paragraphs. */

function inline(text: string, keyBase: string): React.ReactNode[] {
  return text.split("**").map((part, i) =>
    i % 2 === 1 ? <strong key={`${keyBase}-${i}`}>{part}</strong> : <span key={`${keyBase}-${i}`}>{part}</span>,
  );
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];

  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5 text-text-muted">
        {list.map((li, i) => (
          <li key={i}>{inline(li, `li-${blocks.length}-${i}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("- ")) {
      list.push(line.slice(2).replace(/^\s*-\s*/, "· "));
      continue;
    }
    flush();
    if (line.startsWith("## ")) {
      blocks.push(
        <h4 key={`h-${blocks.length}`} className="mt-2 text-xs font-semibold text-text">
          {inline(line.slice(3), `h-${blocks.length}`)}
        </h4>,
      );
    } else {
      blocks.push(
        <p key={`p-${blocks.length}`} className="text-text-muted">
          {inline(line, `p-${blocks.length}`)}
        </p>,
      );
    }
  }
  flush();

  return <div className={className ?? "space-y-1.5 text-[11px] leading-relaxed"}>{blocks}</div>;
}

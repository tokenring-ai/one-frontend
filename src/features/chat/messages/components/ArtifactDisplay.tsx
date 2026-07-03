import type { AgentEventEnvelope } from "@tokenring-ai/agent/AgentEvents";
import safeParseJSON from "@tokenring-ai/utility/json/safeParse";
import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const utf8decoder = new TextDecoder("utf-8");

export default function ArtifactDisplay({ artifact }: { artifact: Extract<AgentEventEnvelope, { type: "output.artifact" }> }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const mime = artifact.mimeType;

  const decodedBody = useMemo(() => {
    if (artifact.encoding === "base64") return Uint8Array.fromBase64(artifact.body);
    return artifact.body;
  }, [artifact]);

  const textBody = typeof decodedBody === "string" ? decodedBody : utf8decoder.decode(decodedBody);

  const summary = useMemo(() => {
    if (mime === "text/x-diff") {
      const lines = textBody.split("\n");
      const added = lines.filter(l => l.startsWith("+")).length;
      const removed = lines.filter(l => l.startsWith("-")).length;
      return `+${added} -${removed} lines`;
    }
    if (mime === "text/markdown") return `${textBody.length} chars`;
    if (mime === "application/json") return "JSON";
    if (mime === "text/html") return "HTML";
    if (mime.startsWith("image/")) return mime.split("/")[1]!.toUpperCase();
    return mime;
  }, [mime, textBody]);

  return (
    <div className="mb-2">
      <button
        type="button"
        className="flex items-center gap-2 py-0.5 w-full text-left cursor-pointer group/header hover:opacity-80 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className={`transition-transform duration-150 ${isExpanded ? "rotate-0" : "-rotate-90"}`}>
          <ChevronDown size={14} className="text-dim" />
        </div>
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="text-sm font-medium text-primary truncate leading-none">{artifact.name}</span>
          <span className="text-[10px] font-mono text-dim opacity-0 group-hover/header:opacity-100 transition-opacity leading-none pt-0.5">{summary}</span>
        </div>
      </button>

      {isExpanded && (
        <div className="ml-1.5 mt-2 border-l border-primary/40 pl-4 py-1">
          {mime === "text/x-diff" && (
            <div className="font-mono text-[11px] leading-relaxed space-y-0.5">
              {textBody.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={`whitespace-pre px-1 ${
                    line.startsWith("+") ? "text-emerald-600 dark:text-emerald-400" : line.startsWith("-") ? "text-rose-600 dark:text-rose-400" : "text-muted"
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
          {mime === "text/markdown" && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{textBody}</ReactMarkdown>
            </div>
          )}
          {mime === "application/json" && (
            <pre className="text-[11px] font-mono text-secondary bg-tertiary p-4 rounded-lg overflow-x-auto border border-primary shadow-md">
              {JSON.stringify(safeParseJSON(textBody, null), null, 2)}
            </pre>
          )}
          {mime === "text/html" && (
            <div className="mt-2 border border-primary rounded-lg overflow-hidden shadow-md">
              <iframe title={`HTML Preview for ${artifact.name}`} srcDoc={textBody} className="w-full h-80 bg-white" sandbox="allow-scripts" />
            </div>
          )}
          {mime.startsWith("image/") && (
            <div className="mt-2">
              <img
                src={URL.createObjectURL(new Blob([decodedBody], { type: mime }))}
                alt={artifact.name}
                className="max-w-full rounded-lg border border-primary shadow-md"
              />
            </div>
          )}
          {!["text/x-diff", "text/markdown", "application/json", "text/html"].includes(mime) && !mime.startsWith("image/") && (
            <pre className="text-[11px] font-mono text-secondary whitespace-pre-wrap">{textBody}</pre>
          )}
        </div>
      )}
    </div>
  );
}

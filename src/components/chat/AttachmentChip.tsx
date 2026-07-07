import type { BaseAttachment } from "@tokenring-ai/agent/AgentEvents";
import formatError from "@tokenring-ai/utility/error/formatError";
import { Check, Copy, Download, File, FileCode, FileJson, FileText, Image as ImageIcon, X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { toastManager } from "../ui/toast.tsx";

interface AttachmentChipProps {
  attachment: BaseAttachment;
  onRemove?: () => void;
  showRemove?: boolean;
}

type AttachmentFamily = "image" | "json" | "code" | "text" | "document" | "generic";

const actionButtonClassName =
  "cursor-pointer rounded-md border border-primary bg-secondary p-1.5 text-muted shadow-sm backdrop-blur transition-colors hover:bg-hover hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 focus-ring";

function isImageAttachment(mimeType: string) {
  return mimeType.startsWith("image/");
}

function isTextAttachment(mimeType: string) {
  return (
    mimeType.startsWith("text/") ||
    mimeType.includes("json") ||
    mimeType.includes("markdown") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript")
  );
}

function getAttachmentFamily(mimeType: string): AttachmentFamily {
  if (isImageAttachment(mimeType)) return "image";
  if (mimeType.includes("json")) return "json";
  if (
    mimeType.includes("code") ||
    mimeType.includes("script") ||
    mimeType.includes("javascript") ||
    mimeType.includes("typescript") ||
    mimeType.includes("html") ||
    mimeType.includes("css") ||
    mimeType.includes("python") ||
    mimeType.includes("java") ||
    mimeType.includes("c++") ||
    mimeType.includes("c#")
  ) {
    return "code";
  }
  if (mimeType.includes("text") || mimeType.includes("markdown") || mimeType.includes("plain")) {
    return "text";
  }
  if (
    mimeType.includes("pdf") ||
    mimeType.includes("word") ||
    mimeType.includes("document") ||
    mimeType.includes("presentation") ||
    mimeType.includes("sheet") ||
    mimeType.includes("excel")
  ) {
    return "document";
  }
  return "generic";
}

function getAttachmentIcon(mimeType: string) {
  const family = getAttachmentFamily(mimeType);

  switch (family) {
    case "image":
      return <ImageIcon className="w-4 h-4" />;
    case "json":
      return <FileJson className="w-4 h-4" />;
    case "code":
      return <FileCode className="w-4 h-4" />;
    case "text":
    case "document":
      return <FileText className="w-4 h-4" />;
    default:
      return <File className="w-4 h-4" />;
  }
}

function getAttachmentAccentClasses(mimeType: string) {
  const family = getAttachmentFamily(mimeType);

  switch (family) {
    case "image":
      return {
        panel: "bg-linear-to-br from-sky-100 via-cyan-50 to-violet-100 dark:from-sky-500/20 dark:via-cyan-500/10 dark:to-accent-subtle",
        badge: "bg-secondary text-sky-700 dark:text-sky-200 border-primary",
        icon: "text-sky-600 dark:text-sky-300",
      };
    case "json":
      return {
        panel: "bg-linear-to-br from-amber-100 via-orange-50 to-yellow-100 dark:from-amber-500/20 dark:via-orange-500/10 dark:to-yellow-500/20",
        badge: "bg-secondary text-amber-700 dark:text-amber-200 border-primary",
        icon: "text-amber-600 dark:text-amber-300",
      };
    case "code":
      return {
        panel: "bg-linear-to-br from-emerald-100 via-teal-50 to-cyan-100 dark:from-emerald-500/20 dark:via-teal-500/10 dark:to-cyan-500/20",
        badge: "bg-secondary text-emerald-700 dark:text-emerald-200 border-primary",
        icon: "text-emerald-600 dark:text-emerald-300",
      };
    case "text":
      return {
        panel: "bg-linear-to-br from-violet-100 via-fuchsia-50 to-pink-100 dark:from-violet-500/20 dark:via-fuchsia-500/10 dark:to-pink-500/20",
        badge: "bg-secondary text-violet-700 dark:text-violet-200 border-primary",
        icon: "text-violet-600 dark:text-violet-300",
      };
    case "document":
      return {
        panel: "bg-linear-to-br from-rose-100 via-orange-50 to-amber-100 dark:from-rose-500/20 dark:via-orange-500/10 dark:to-amber-500/20",
        badge: "bg-secondary text-rose-700 dark:text-rose-200 border-primary",
        icon: "text-rose-600 dark:text-rose-300",
      };
    default:
      return {
        panel: "bg-linear-to-br from-slate-100 via-zinc-50 to-stone-100 dark:from-slate-500/20 dark:via-zinc-500/10 dark:to-stone-500/20",
        badge: "bg-secondary text-muted border-primary",
        icon: "text-muted",
      };
  }
}

function getMimeLabel(mimeType: string) {
  const subtype = mimeType.split("/").pop() ?? mimeType;
  return subtype.replace("vnd.", "").replace(/\./g, " ").toUpperCase();
}

function getAttachmentExtension(name: string, mimeType: string) {
  const extension = name.split(".").pop();
  if (extension && extension !== name) {
    return extension.toUpperCase();
  }

  return getMimeLabel(mimeType);
}

function decodeAttachmentText(attachment: BaseAttachment): string {
  if (attachment.encoding === "base64") {
    return atob(attachment.body);
  }

  return attachment.body;
}

function getAttachmentPreview(attachment: BaseAttachment): string {
  if (!isTextAttachment(attachment.mimeType)) {
    return "";
  }

  try {
    return decodeAttachmentText(attachment).replace(/\s+/g, " ").trim().slice(0, 140);
  } catch {
    return "";
  }
}

function getImagePreviewSrc(attachment: BaseAttachment): string | null {
  if (!isImageAttachment(attachment.mimeType)) {
    return null;
  }

  if (attachment.encoding === "href") {
    return attachment.body;
  }

  if (attachment.encoding === "base64") {
    return `data:${attachment.mimeType};base64,${attachment.body}`;
  }

  return `data:${attachment.mimeType};charset=utf-8,${encodeURIComponent(attachment.body)}`;
}

function downloadAttachment(attachment: BaseAttachment) {
  if (attachment.encoding === "href") {
    const a = document.createElement("a");
    a.href = attachment.body;
    a.download = attachment.name;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    return;
  }

  let blob: Blob;

  if (attachment.encoding === "base64") {
    const binaryString = atob(attachment.body);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: attachment.mimeType });
  } else {
    blob = new Blob([attachment.body], { type: attachment.mimeType });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = attachment.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 100);
}

function formatFileSize(attachment: BaseAttachment): string {
  try {
    let byteSize: number;

    if (attachment.encoding === "base64") {
      byteSize = Math.floor(attachment.body.length * 0.75);
    } else {
      byteSize = new TextEncoder().encode(attachment.body).length;
    }

    if (byteSize < 1024) {
      return `${byteSize} B`;
    }
    if (byteSize < 1024 * 1024) {
      return `${(byteSize / 1024).toFixed(1)} KB`;
    }
    return `${(byteSize / (1024 * 1024)).toFixed(1)} MB`;
  } catch {
    return "";
  }
}

export default function AttachmentChip({ attachment, onRemove, showRemove = false }: AttachmentChipProps) {
  const icon = getAttachmentIcon(attachment.mimeType);
  const preview = getAttachmentPreview(attachment);
  const fileSize = formatFileSize(attachment);
  const imageSrc = useMemo(() => getImagePreviewSrc(attachment), [attachment]);
  const extension = useMemo(() => getAttachmentExtension(attachment.name, attachment.mimeType), [attachment]);
  const accent = useMemo(() => getAttachmentAccentClasses(attachment.mimeType), [attachment.mimeType]);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [imageError, setImageError] = useState(false);

  const showImagePreview = Boolean(imageSrc && !imageError);

  const handleDownload = (e?: React.MouseEvent | React.KeyboardEvent) => {
    e?.stopPropagation();
    setDownloading(true);
    try {
      downloadAttachment(attachment);
    } catch (error: unknown) {
      toastManager.error(`Failed to download "${attachment.name}": ${formatError(error)}`, { duration: 5000 });
    } finally {
      setTimeout(() => setDownloading(false), 1000);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove?.();
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(decodeAttachmentText(attachment));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error: unknown) {
      toastManager.error(`Failed to copy "${attachment.name}" to clipboard: ${formatError(error)}`, { duration: 5000 });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleDownload(e);
    }
  };

  return (
    <div
      className="group relative flex w-[220px] max-w-full cursor-pointer flex-col overflow-hidden rounded-xl border border-primary bg-secondary shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:bg-hover"
      role="listitem"
      aria-label={`Attachment: ${attachment.name}`}
      onClick={() => handleDownload()}
      onKeyDown={handleKeyDown}
    >
      <div className="relative aspect-[4/3] overflow-hidden border-b border-primary">
        {showImagePreview ? (
          <>
            <img
              src={imageSrc!}
              alt={attachment.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-t border-primary bg-secondary px-3 py-2">
              <span className="text-xs font-medium text-primary truncate">Preview</span>
              <span className="rounded-md border border-primary bg-tertiary px-2 py-1 text-2xs font-semibold uppercase tracking-[0.18em] text-primary">
                {extension}
              </span>
            </div>
          </>
        ) : (
          <div className={`relative flex h-full w-full items-center justify-center overflow-hidden ${accent.panel}`}>
            <div className="absolute -left-6 top-4 h-16 w-16 rounded-full bg-secondary blur-2xl" />
            <div className="absolute bottom-3 right-3 h-20 w-20 rounded-full bg-tertiary blur-2xl" />
            <div className="absolute inset-x-5 top-5 h-px bg-secondary" />
            <div className="absolute inset-x-5 top-9 h-px bg-tertiary" />
            <div className={`relative flex flex-col items-center gap-3 ${accent.icon}`}>
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-xl border border-primary bg-secondary shadow-md`}>
                {React.cloneElement(icon, { className: "w-7 h-7" })}
              </div>
              <span className={`rounded-md border px-2.5 py-1 text-2xs font-semibold uppercase tracking-[0.18em] ${accent.badge}`}>{extension}</span>
            </div>
          </div>
        )}

        <div className="absolute right-2 top-2 flex items-center gap-1">
          {isTextAttachment(attachment.mimeType) && (
            <button
              type="button"
              onClick={handleCopy}
              className={actionButtonClassName}
              title={`Copy ${attachment.name} to clipboard`}
              aria-label={`Copy ${attachment.name} to clipboard`}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={handleDownload}
            className={actionButtonClassName}
            title={downloading ? `Downloading ${attachment.name}...` : `Download ${attachment.name}`}
            aria-label={downloading ? `Downloading ${attachment.name}...` : `Download ${attachment.name}`}
            disabled={downloading}
          >
            {downloading ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
          </button>
          {showRemove && onRemove && (
            <button
              type="button"
              onClick={handleRemove}
              className={`${actionButtonClassName} hover:text-red-500`}
              title={`Remove ${attachment.name}`}
              aria-label={`Remove ${attachment.name}`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="space-y-1">
          <div className="line-clamp-2 text-sm font-semibold leading-snug text-primary" title={attachment.name}>
            {attachment.name}
          </div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-dim">
            {fileSize && <span>{fileSize}</span>}
            <span className="h-1 w-1 rounded-full bg-current/50" />
            <span className="truncate" title={attachment.mimeType}>
              {getMimeLabel(attachment.mimeType)}
            </span>
          </div>
        </div>

        {preview && <p className="line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-muted">{preview}</p>}
      </div>
    </div>
  );
}

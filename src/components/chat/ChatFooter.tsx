import { BaseAttachmentSchema, type InputAttachment } from "@tokenring-ai/agent/AgentEvents";
import { AnimatePresence, motion } from "framer-motion";
import { File, FileCode, FileText, FolderOpen, History, Image, Paperclip, Send, Square, X } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import errorAsString from "@tokenring-ai/utility/error/errorAsString";
import { agentRPCClient } from "../../rpc.ts";
import HookSelector from "../HookSelector.tsx";
import { toastManager } from "../ui/toast.tsx";
import ModelSelector from "../ModelSelector.tsx";
import SubAgentSelector from "../SubAgentSelector.tsx";
import ToolSelector from "../ToolSelector.tsx";

interface FileAttachment {
  id: string;
  file: File;
  attachment: InputAttachment;
}

interface ChatFooterProps {
  agentId: string;
  input: string;
  setInput: (value: string) => void;
  inputError: boolean;
  setInputError: (value: boolean) => void;
  idle: boolean;
  statusMessage: string;
  availableCommands: string[];
  commandHistory: string[];
  showHistory: boolean;
  setShowHistory: (value: boolean) => void;
  setShowFileBrowser: (value: boolean) => void;
  onSubmit: (attachments?: InputAttachment[]) => void;
  submitFeedback: { message: string; type: "success" | "error" } | null;
}

// Get file icon based on mime type
function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType.startsWith("text/")) return FileText;
  if (mimeType.includes("json") || mimeType.includes("javascript") || mimeType.includes("typescript")) return FileCode;
  return File;
}

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Format file size with appropriate units
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

export default function ChatFooter({
  agentId,
  input,
  setInput,
  inputError,
  setInputError,
  idle,
  statusMessage,
  availableCommands,
  commandHistory,
  showHistory,
  setShowHistory,
  setShowFileBrowser,
  onSubmit,
  submitFeedback,
}: ChatFooterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyBuffer, setHistoryBuffer] = useState("");
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const isNavigatingHistoryRef = useRef(false);

  // Reset history navigation when user manually types
  useEffect(() => {
    if (!isNavigatingHistoryRef.current && historyIndex !== null) {
      setHistoryIndex(null);
      setHistoryBuffer("");
    }
    // Reset the ref after the effect runs
    isNavigatingHistoryRef.current = false;
  }, [historyIndex]);

  // Handle drag and drop
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessingFiles && idle) {
        setIsDragOver(true);
      }
    },
    [isProcessingFiles, idle],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  // Read file and convert to InputAttachment
  const readFileAsAttachment = useCallback((file: File): Promise<FileAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const mimeType = BaseAttachmentSchema.shape.mimeType.safeParse(file.type);
        if (!mimeType.success) {
          reject(new Error(`Invalid MIME type: ${file.type}`));
          return;
        }

        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);

        // Convert to base64 in chunks to avoid stack overflow on large files
        const CHUNK = 8192;
        let binary = "";
        for (let i = 0; i < bytes.length; i += CHUNK) {
          binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
        }
        const base64 = btoa(binary);

        const attachment: InputAttachment = {
          type: "attachment",
          name: file.name,
          encoding: "base64",
          mimeType: mimeType.data,
          body: base64,
          timestamp: Date.now(),
        };

        resolve({
          id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          attachment,
        });
      };

      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsArrayBuffer(file);
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files || []);
      if (files.length === 0) return;

      setIsProcessingFiles(true);
      const newAttachments: FileAttachment[] = [];

      const processFiles = async () => {
        for (const file of files) {
          // Check file size
          if (file.size > MAX_FILE_SIZE) {
            toastManager.warning(`"${file.name}" exceeds the 5MB limit and was not attached.`, { duration: 5000 });
            continue;
          }

          try {
            const attachment = await readFileAsAttachment(file);
            newAttachments.push(attachment);
          } catch (error: unknown) {
            toastManager.error(`Failed to read "${file.name}": ${errorAsString(error)}`, { duration: 5000 });
          }
        }

        if (newAttachments.length > 0) {
          setAttachments(prev => [...prev, ...newAttachments]);
        }
        setIsProcessingFiles(false);
      };

      void processFiles();
    },
    [readFileAsAttachment],
  );

  // Handle file selection
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setIsProcessingFiles(true);
      const newAttachments: FileAttachment[] = [];

      try {
        for (const file of Array.from(files)) {
          // Check file size
          if (file.size > MAX_FILE_SIZE) {
            toastManager.warning(`"${file.name}" exceeds the 5MB limit and was not attached.`, { duration: 5000 });
            continue;
          }

          try {
            const attachment = await readFileAsAttachment(file);
            newAttachments.push(attachment);
          } catch (error: unknown) {
            toastManager.error(`Failed to read "${file.name}": ${errorAsString(error)}`, { duration: 5000 });
          }
        }

        if (newAttachments.length > 0) {
          setAttachments(prev => [...prev, ...newAttachments]);
        }
      } finally {
        setIsProcessingFiles(false);
      }

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [readFileAsAttachment],
  );

  // Remove attachment
  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  // Handle submit with attachments
  const handleSubmitWithAttachments = useCallback(() => {
    const inputAttachments = attachments.length > 0 ? attachments.map(a => a.attachment) : undefined;
    onSubmit(inputAttachments);
    setAttachments([]);
    // Reset textarea height after submission
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [attachments, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle command suggestions with arrow keys
    if (availableCommands.length > 0 && historyIndex === null) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev + 1) % availableCommands.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedSuggestion(prev => (prev - 1 + availableCommands.length) % availableCommands.length);
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const cmd = availableCommands[selectedSuggestion];
        setInput(`/${cmd} `);
        textareaRef.current?.focus();
        return;
      }
    }

    // Handle history navigation with arrow keys
    if (availableCommands.length === 0 || historyIndex !== null) {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (commandHistory.length > 0) {
          let newIndex: number;

          if (historyIndex === null) {
            // Start navigating history, save current input
            setHistoryBuffer(input);
            newIndex = commandHistory.length - 1;
          } else if (historyIndex > 0) {
            newIndex = historyIndex - 1;
          } else {
            newIndex = 0;
          }

          setHistoryIndex(newIndex);
          isNavigatingHistoryRef.current = true;
          setInput(commandHistory[newIndex] ?? "Array Overflow");
        }
        return;
      }

      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (historyIndex !== null) {
          if (historyIndex < commandHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            isNavigatingHistoryRef.current = true;
            setInput(commandHistory[newIndex]!);
          } else {
            // Go back to the original input before history navigation
            setHistoryIndex(null);
            setHistoryBuffer("");
            setInput(historyBuffer);
          }
        }
        return;
      }
    }

    if (e.key === "Enter") {
      const isTouchDevice = navigator.maxTouchPoints > 0;
      if (!isTouchDevice && !e.shiftKey) {
        e.preventDefault();
        handleSubmitWithAttachments();
      }
    }
  };

  return (
    <footer
      ref={footerRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`shrink-0 border-t border-primary md:border-t-0 md:bg-transparent relative transition-all duration-200 md:rounded-none ${
        isDragOver ? "ring-2 ring-accent ring-inset bg-accent/10" : ""
      }`}
    >
      <AnimatePresence>
        {availableCommands.length > 0 && (
          <motion.div
            id="command-suggestions"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 5 }}
            className="absolute bottom-full left-4 right-4 mb-2 flex flex-wrap gap-2 p-3 bg-secondary border border-primary rounded-lg shadow-md z-20"
            role="listbox"
            aria-label="Command suggestions"
            aria-activedescendant={`cmd-${selectedSuggestion}`}
          >
            {availableCommands.slice(0, 15).map((cmd, idx) => (
              <button
                type="button"
                key={cmd}
                id={`cmd-${idx}`}
                onClick={() => {
                  setInput(`/${cmd} `);
                  textareaRef.current?.focus();
                }}
                className={`text-xs font-mono px-2 py-1 rounded-md transition-colors cursor-pointer ${
                  idx === selectedSuggestion ? "bg-accent text-primary" : "bg-tertiary hover:bg-hover text-accent"
                }`}
                role="option"
                aria-selected={idx === selectedSuggestion}
              >
                /{cmd}
              </button>
            ))}
            {availableCommands.length > 15 && <span className="text-xs text-muted ml-auto">+{availableCommands.length - 15} more</span>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag and drop overlay */}
      <AnimatePresence>
        {isDragOver && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-accent/10 backdrop-blur-sm flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="flex flex-col items-center gap-3 p-6">
              <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 0.5, repeat: Infinity }}>
                <Paperclip className="w-12 h-12 text-accent" />
              </motion.div>
              <div className="text-center">
                <p className="text-lg font-mono text-accent/80 font-semibold">Drop files to attach</p>
                <p className="text-sm text-muted font-mono mt-1">Maximum 5MB per file</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="md:mx-4 md:mb-4 md:rounded-xl md:overflow-hidden md:ring-1 md:ring-white/10 md:shadow-xl md:bg-secondary rounded-t-xl overflow-hidden">
        <div className="relative bg-secondary">
          {/* Hidden file input for local file upload */}
          <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} className="hidden" aria-label="Upload files" />

          {/* Attachments preview */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border border-primary overflow-hidden"
              >
                {/* Processing indicator */}
                {isProcessingFiles && (
                  <div className="px-4 py-3 flex items-center gap-2 text-warning">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-4 h-4">
                      <Paperclip className="w-4 h-4" />
                    </motion.div>
                    <span className="text-sm font-mono">Processing files...</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 px-4 py-3">
                  {attachments.map(({ id, file, attachment }) => {
                    const Icon = getFileIcon(attachment.mimeType);
                    return (
                      <motion.div
                        key={id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex items-center gap-2 bg-tertiary px-3 py-1.5 rounded-md group shadow-card"
                      >
                        <Icon className="w-4 h-4 text-muted" />
                        <span className="text-sm text-primary font-mono max-w-37.5 truncate">{file.name}</span>
                        <span className="text-xs text-muted font-mono">({formatFileSize(file.size)})</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(id)}
                          className="text-muted hover:text-error transition-colors focus-ring rounded-md p-1.5"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    );
                  })}
                </div>
                {/* Total size indicator */}
                <div className="px-4 pb-3 flex items-center gap-2 border-t border-primary/30">
                  <span className="text-xs text-muted font-mono">Total:</span>
                  <span
                    className={`text-xs font-mono ${
                      attachments.reduce((sum, a) => sum + a.file.size, 0) > MAX_FILE_SIZE * 0.8 ? "text-warning" : "text-muted"
                    }`}
                  >
                    {attachments.reduce((sum, a) => sum + a.file.size, 0).toLocaleString()} bytes
                  </span>
                  {attachments.reduce((sum, a) => sum + a.file.size, 0) > MAX_FILE_SIZE && (
                    <span className="text-xs text-error font-mono">Exceeds 5MB limit</span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-start gap-4 px-6 pt-3 pb-2">
            <div className="shrink-0 h-lh items-center flex justify-center select-none text-lg">
              <span className="text-accent font-bold">&gt;</span>
            </div>

            <div className="flex-1 relative pt-0.75">
              <label htmlFor="chat-input" className="sr-only">
                Command or message input
              </label>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  id="chat-input"
                  value={input}
                  onChange={e => {
                    setInput(e.target.value);
                    setInputError(false);
                    // Auto-expand textarea when typing
                    const target = e.target;
                    target.style.height = "auto";
                    target.style.height = `${target.scrollHeight}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={!idle}
                  rows={1}
                  className={`w-full bg-transparent border-none focus:ring-0 resize-none text-sm font-mono text-primary placeholder-muted p-0 leading-relaxed outline-none transition-opacity ${
                    inputError ? "placeholder:text-error/50" : ""
                  } ${!idle ? "opacity-60" : ""}`}
                  placeholder={inputError ? "Please enter a message or command..." : "Execute command or send message..."}
                  spellCheck="false"
                  aria-label="Command or message input"
                  aria-describedby={availableCommands.length > 0 ? "command-suggestions" : undefined}
                  aria-invalid={inputError}
                  aria-required="true"
                  style={{ height: "auto", minHeight: "1.5rem", maxHeight: "12rem" }}
                />
              </div>
            </div>

            {/* Send/Abort button - moved to right of input */}
            <div className="shrink-0">
              {idle ? (
                <button
                  type="button"
                  aria-label="Send message"
                  onClick={handleSubmitWithAttachments}
                  className="p-2 rounded-md hover:bg-hover transition-colors text-muted hover:text-primary focus-ring"
                >
                  <Send className="w-5 h-5" />
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Abort current operation"
                  onClick={() => agentRPCClient.abortCurrentOperation({ agentId, message: "User aborted the current operation via the chat webapp" })}
                  className="p-2 rounded-md hover:bg-hover transition-colors text-muted hover:text-error focus-ring"
                >
                  <Square className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          <div className="min-h-10 pb-3 bg-secondary flex flex-col sm:flex-row items-start sm:items-center justify-between px-6 gap-2 sm:gap-0">
            <div className="flex flex-wrap items-center gap-2 order-2 sm:order-1">
              {/* Local file upload button */}
              <button
                type="button"
                aria-label="Attach file"
                onClick={() => fileInputRef.current?.click()}
                disabled={!idle || isProcessingFiles}
                className="p-1.5 rounded-md hover:bg-hover transition-colors text-muted hover:text-primary focus-ring disabled:opacity-50 disabled:cursor-not-allowed relative"
                title={isProcessingFiles ? "Processing files..." : "Attach file"}
              >
                {isProcessingFiles ? (
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="w-5 h-5">
                    <Paperclip className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <Paperclip className="w-5 h-5" />
                )}
              </button>
              {/* Remote file browser button */}
              <button
                type="button"
                aria-label="Browse remote files"
                onClick={() => setShowFileBrowser(true)}
                className="p-1.5 rounded-md hover:bg-hover transition-colors text-muted hover:text-primary focus-ring"
              >
                <FolderOpen className="w-5 h-5" />
              </button>
              <button
                type="button"
                aria-label={showHistory ? "Hide command history" : "Show command history"}
                onClick={() => setShowHistory(!showHistory)}
                disabled={commandHistory.length === 0}
                className="p-1.5 rounded-md hover:bg-hover transition-colors text-muted hover:text-primary focus-ring disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <History className="w-5 h-5" />
              </button>
              <div className="w-px h-5 bg-primary/70 mx-0.5" aria-hidden="true" />
              <ModelSelector agentId={agentId} triggerVariant="icon" />
              <ToolSelector agentId={agentId} triggerVariant="icon" />
              <HookSelector agentId={agentId} triggerVariant="icon" />
              <SubAgentSelector agentId={agentId} triggerVariant="icon" />
            </div>

            <div className="flex items-center gap-2 order-1 sm:order-2" aria-live="polite" aria-atomic="true">
              {/* Right side - status indicator */}
              <div
                className={`w-2 h-2 ${idle ? "bg-accent" : "bg-warning"} rounded-full animate-pulse`}
                aria-label={idle ? "Agent is online" : "Agent is busy"}
                role="status"
              />
              <span className={`text-xs ${idle ? "text-accent" : "text-warning"} font-mono uppercase`}>{idle ? "Online" : "Busy"}</span>
              {attachments.length > 0 && (
                <span className="text-xs text-accent font-mono">
                  • {attachments.length} file{attachments.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <AnimatePresence>
            {showHistory && commandHistory && commandHistory.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute bottom-full left-6 right-6 mb-2 p-3 bg-secondary border border-primary rounded-lg shadow-md z-30 max-h-64 overflow-y-auto"
                role="dialog"
                aria-labelledby="history-title"
              >
                <div className="flex items-center justify-between mb-2">
                  <span id="history-title" className="text-xs text-muted font-mono uppercase">
                    Command History
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHistory(false)}
                    className="text-muted hover:text-primary focus-ring p-1 rounded-md"
                    aria-label="Close command history"
                  >
                    ×
                  </button>
                </div>
                <div className="space-y-1" role="listbox" aria-label="Previous commands">
                  {commandHistory
                    .slice()
                    .reverse()
                    .map((cmd, idx) => {
                      const actualIndex = commandHistory.length - 1 - idx;
                      const isSelected = historyIndex === actualIndex;
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => {
                            setInput(cmd);
                            textareaRef.current?.focus();
                            setShowHistory(false);
                          }}
                          className={`w-full text-left text-sm font-mono px-3 py-2 rounded-md text-primary transition-colors focus-ring ${
                            isSelected ? "bg-accent text-primary" : "bg-tertiary hover:bg-hover"
                          }`}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {cmd}
                        </button>
                      );
                    })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="h-6 bg-tertiary flex items-center justify-between px-6 select-none">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted font-mono line-clamp-1">{statusMessage}</span>
            <span className="text-xs text-dim font-mono">{input.length} chars</span>
            {submitFeedback && (
              <span className={`text-xs font-mono ${submitFeedback.type === "success" ? "text-success" : "text-error"}`}>{submitFeedback.message}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-dim mt-0.5">
            <span className="hidden md:inline">
              <kbd className="px-1.5 py-0.5 bg-tertiary rounded-md text-primary font-mono">↑/↓</kbd> History •{" "}
              <kbd className="px-1.5 py-0.5 bg-tertiary rounded-md text-primary font-mono">Enter</kbd> Send •{" "}
              <kbd className="px-1.5 py-0.5 bg-tertiary rounded-md text-primary font-mono">Shift+Enter</kbd> New line
            </span>
            <span className="md:hidden">↑/↓ History • Enter for new line • Tap send to submit</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

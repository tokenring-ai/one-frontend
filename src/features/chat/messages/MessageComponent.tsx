import { motion, type Variants } from "framer-motion";
import { Check, Code, FileJson, FileText, Image as ImageIcon, Info, Layout, Square } from "lucide-react";
import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AttachmentChip from "../../../components/chat/AttachmentChip";
import type { ChatMessage, InteractionResponseMessage, QuestionPromptMessage } from "../../../types/agent-events.ts";
import ArtifactDisplay from "./components/ArtifactDisplay.tsx";
import CodeBlock from "./components/CodeBlock.tsx";
import InteractionResponseDisplay from "./components/InteractionResponseDisplay.tsx";
import MessageDetails from "./components/MessageDetails.tsx";
import MessageFooter from "./components/MessageFooter.tsx";
import QuestionWithResponseDisplay from "./components/QuestionWithResponseDisplay.tsx";
import ThinkingBlock from "./components/ThinkingBlock.tsx";
import ToolCallDisplay from "./components/ToolCallDisplay.tsx";
import { events } from "./eventConfig.tsx";
import { getInputSource, getMessageDetails, getMessageText } from "./messageUtils.ts";

interface MessageComponentProps {
  msg: ChatMessage;
  agentId: string;
  question?: QuestionPromptMessage;
  response?: InteractionResponseMessage;
}

const messageVariants = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.2, ease: "easeOut" } },
} satisfies Variants;

export default function MessageComponent({ msg, question, response }: MessageComponentProps) {
  const messageIcon = useMemo(() => {
    if (msg.type === "output.artifact") {
      const mime = msg.mimeType;
      if (mime === "text/x-diff") return <Code className="w-[1em] text-success" />;
      if (mime === "text/markdown") return <FileText className="w-[1em] text-accent" />;
      if (mime === "application/json") return <FileJson className="w-[1em] text-warning" />;
      if (mime === "text/html") return <Layout className="w-[1em] text-warning" />;
      if (mime.startsWith("image/")) return <ImageIcon className="w-[1em] text-accent" />;
    }
    if (msg.type === "agent.response") {
      if (msg.status === "success") return <Check className="w-[1em] text-success" />;
      if (msg.status === "cancelled") return <Square className="w-[1em] text-warning" />;
      return <Info className="w-[1em] text-error/70" />;
    }
    return events[msg.type].icon;
  }, [msg]);

  const messageStyle = useMemo(() => {
    if (msg.type !== "agent.response") return events[msg.type].style;
    if (msg.status === "success") return "text-success font-medium";
    if (msg.status === "cancelled") return "text-warning font-medium";
    return "text-error font-medium";
  }, [msg]);

  const attachments = useMemo(() => {
    if (msg.type === "input.received") return msg.input.attachments ?? [];
    if (msg.type === "agent.response" && "attachments" in msg) return msg.attachments ?? [];
    return [];
  }, [msg]);

  const messageText = getMessageText(msg);
  const messageDetails = getMessageDetails(msg);
  const inputSource = getInputSource(msg);
  const hasAttachments = attachments.length > 0;
  const pairedQuestion = question ?? (msg.type === "question" ? msg : undefined);
  const isQuestionWithResponse = Boolean(pairedQuestion && response);

  return (
    <motion.div
      variants={messageVariants}
      initial="hidden"
      animate="visible"
      className={`group relative flex flex-row items-start gap-3 px-3 py-3 transition-colors border-l-2 ${
        msg.type === "input.received"
          ? "bg-accent-subtle border-accent-strong"
          : isQuestionWithResponse
            ? "bg-cyan-50/30 dark:bg-cyan-500/5 border-cyan-500/30"
            : msg.type === "input.interaction"
              ? "bg-emerald-50/30 dark:bg-emerald-500/5 border-emerald-500/30"
              : "hover:bg-hover border-transparent hover:border-primary"
      }`}
    >
      <div className="shrink-0 w-6 flex justify-center items-center prose prose-sm">
        {isQuestionWithResponse ? <span className="text-cyan-500 font-bold flex items-center">?</span> : messageIcon}
      </div>

      <div className={`${messageStyle} w-full min-w-0`}>
        {msg.type === "toolCall" ? (
          <ToolCallDisplay msg={msg} />
        ) : msg.type === "output.artifact" ? (
          <ArtifactDisplay artifact={msg} />
        ) : isQuestionWithResponse ? (
          <QuestionWithResponseDisplay question={pairedQuestion!} {...(response !== undefined && { response })} />
        ) : msg.type === "input.interaction" ? (
          <InteractionResponseDisplay msg={msg as InteractionResponseMessage} />
        ) : msg.type === "output.reasoning" ? (
          <ThinkingBlock message={msg.message} />
        ) : messageText ? (
          <>
            {inputSource && <div className="text-primary font-bold font-mono text-sm mb-1">From: {inputSource}</div>}
            <div className="prose prose-sm dark:prose-invert">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  code: ({ className, children, ...props }) => {
                    const text = String(children as string).trim();
                    if (text.includes("\n")) {
                      return <CodeBlock {...(className !== undefined && { className })}>{text}</CodeBlock>;
                    } else {
                      return (
                        <code {...(className !== undefined && { className })} {...props}>
                          {text}
                        </code>
                      );
                    }
                  },
                }}
              >
                {messageText}
              </ReactMarkdown>
            </div>

            <MessageDetails details={messageDetails} />

            {hasAttachments && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((attachment, index) => (
                  <AttachmentChip key={`${attachment.name}-${index}`} attachment={attachment} />
                ))}
              </div>
            )}
          </>
        ) : null}
        <MessageFooter
          msg={msg}
          {...(msg.type === "output.artifact" && {
            onDownload: () => {
              const decodedBody = msg.encoding === "base64" ? Buffer.from(msg.body, "base64") : msg.body;
              const blob = new Blob([decodedBody], { type: msg.mimeType });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = msg.name;
              a.click();
              URL.revokeObjectURL(url);
            },
          })}
        />
      </div>
    </motion.div>
  );
}

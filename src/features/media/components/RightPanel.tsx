import type { MediaEntry, MediaKind } from "../types.ts";
import ImageGeneratePanel from "./generate/ImageGeneratePanel.tsx";
import SpeechGeneratePanel from "./generate/SpeechGeneratePanel.tsx";
import VideoGeneratePanel from "./generate/VideoGeneratePanel.tsx";
import AudioViewer from "./viewers/AudioViewer.tsx";
import ImageViewer from "./viewers/ImageViewer.tsx";
import VideoViewer from "./viewers/VideoViewer.tsx";

export default function RightPanel({
  kind,
  agentId,
  selected,
  onWorkOnSelection,
  onClearSelection,
  onGenerated,
}: {
  kind: MediaKind;
  agentId: string | null;
  selected: MediaEntry | null;
  onWorkOnSelection: () => Promise<void>;
  onClearSelection: () => void;
  onGenerated: () => void;
}) {
  if (selected) {
    if (selected.kind === "image") return <ImageViewer image={selected} onWorkOnImage={onWorkOnSelection} onClose={onClearSelection} />;
    if (selected.kind === "video") return <VideoViewer video={selected} onWorkOnVideo={onWorkOnSelection} onClose={onClearSelection} />;
    if (selected.kind === "audio") return <AudioViewer audio={selected} agentId={agentId} onWorkOnAudio={onWorkOnSelection} onClose={onClearSelection} />;
  }
  if (kind === "image") return <ImageGeneratePanel agentId={agentId} onGenerated={onGenerated} />;
  if (kind === "video") return <VideoGeneratePanel agentId={agentId} onGenerated={onGenerated} />;
  return <SpeechGeneratePanel agentId={agentId} onGenerated={onGenerated} />;
}
import type { AudioIndexEntry } from "@tokenring-ai/media-library/rpc/schema";
import type { ImageIndexEntry, VideoIndexEntry } from "@tokenring-ai/media-library/rpc/schema";

export type MediaKind = "image" | "video" | "audio";
export type MediaEntry = ImageIndexEntry | VideoIndexEntry | AudioIndexEntry;
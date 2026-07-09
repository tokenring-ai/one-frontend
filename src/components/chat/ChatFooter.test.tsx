import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChatFooter from "./ChatFooter.tsx";

const { warningMock, errorMock } = vi.hoisted(() => ({
  warningMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("../ui/toast.tsx", () => ({
  toastManager: {
    warning: warningMock,
    error: errorMock,
  },
}));

vi.mock("../../rpc.ts", () => ({
  agentRPCClient: {
    abortCurrentOperation: vi.fn(),
  },
}));

vi.mock("../HookSelector.tsx", () => ({ default: () => null }));
vi.mock("../ModelSelector.tsx", () => ({ default: () => null }));
vi.mock("../SubAgentSelector.tsx", () => ({ default: () => null }));
vi.mock("../ToolSelector.tsx", () => ({ default: () => null }));

function renderChatFooter(overrides: Partial<Parameters<typeof ChatFooter>[0]> = {}) {
  const props = {
    agentId: "test-agent",
    input: "",
    setInput: vi.fn(),
    inputError: false,
    setInputError: vi.fn(),
    idle: true,
    statusMessage: "Ready",
    availableCommands: [],
    commandHistory: [],
    showHistory: false,
    setShowHistory: vi.fn(),
    setShowFileBrowser: vi.fn(),
    onSubmit: vi.fn(),
    submitFeedback: null,
    ...overrides,
  };

  return render(<ChatFooter {...props} />);
}

type MediaRecorderHandler = (() => void) | null;

class MockMediaRecorder {
  static isTypeSupported = vi.fn(() => true);

  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: MediaRecorderHandler = null;
  onstop: MediaRecorderHandler = null;
  start = vi.fn((_timeslice?: number) => {
    this.state = "recording";
  });
  stop = vi.fn(() => {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }) });
    this.onstop?.();
  });

  constructor(_stream: MediaStream, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }
}

function stubMediaDevices() {
  const trackStop = vi.fn();
  const stream = {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;

  const getUserMedia = vi.fn().mockResolvedValue(stream);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });

  vi.stubGlobal("MediaRecorder", MockMediaRecorder);

  return { getUserMedia, trackStop, stream };
}

describe("ChatFooter file attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a warning toast when a file exceeds the size limit", async () => {
    const user = userEvent.setup();
    renderChatFooter();

    const oversizedFile = new File(["x"], "large.txt", { type: "text/plain" });
    Object.defineProperty(oversizedFile, "size", { value: 6 * 1024 * 1024 });

    const input = screen.getByLabelText("Upload files");
    await user.upload(input, oversizedFile);

    await waitFor(() => {
      expect(warningMock).toHaveBeenCalledWith('"large.txt" exceeds the 5MB limit and was not attached.', { duration: 5000 });
    });
  });

  it("shows an error toast when file reading fails", async () => {
    class FailingFileReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      result: ArrayBuffer | null = null;
      readAsArrayBuffer = vi.fn(() => {
        queueMicrotask(() => {
          this.onerror?.();
        });
      });
    }

    vi.stubGlobal("FileReader", FailingFileReader);

    const user = userEvent.setup();
    renderChatFooter();

    const file = new File(["hello"], "broken.txt", { type: "text/plain" });
    const input = screen.getByLabelText("Upload files");
    await user.upload(input, file);

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Failed to read "broken.txt":'), { duration: 5000 });
      expect(errorMock.mock.calls[0]?.[0]).toContain("Failed to read file");
    });

    vi.unstubAllGlobals();
  });
});

describe("ChatFooter audio recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts recording when the mic button is clicked", async () => {
    const { getUserMedia } = stubMediaDevices();
    const user = userEvent.setup();
    renderChatFooter();

    await user.click(screen.getByRole("button", { name: "Record audio" }));

    await waitFor(() => {
      expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(screen.getByRole("status", { name: "Recording in progress" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Stop recording" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("attaches recorded audio after stop", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubMediaDevices();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChatFooter();

    await user.click(screen.getByRole("button", { name: "Record audio" }));
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Recording in progress" })).toBeInTheDocument();
    });

    // Advance past the minimum recording duration so the clip is kept
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await user.click(screen.getByRole("button", { name: "Stop recording and attach" }));

    await act(async () => {
      // Flush async finalizeRecording (arrayBuffer + FileReader)
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Record audio" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.getByText(/recording-/)).toBeInTheDocument();
      expect(screen.getByText(/1 file/)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("discards recording when cancelled", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    stubMediaDevices();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderChatFooter();

    await user.click(screen.getByRole("button", { name: "Record audio" }));
    await waitFor(() => {
      expect(screen.getByRole("status", { name: "Recording in progress" })).toBeInTheDocument();
    });

    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    await user.click(screen.getByRole("button", { name: "Cancel recording" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Record audio" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByText(/recording-/)).not.toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("shows an error when microphone permission is denied", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError: Permission denied")),
      },
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    const user = userEvent.setup();
    renderChatFooter();

    await user.click(screen.getByRole("button", { name: "Record audio" }));

    await waitFor(() => {
      expect(errorMock).toHaveBeenCalledWith("Microphone permission denied. Allow microphone access to record audio.", { duration: 5000 });
    });
  });
});

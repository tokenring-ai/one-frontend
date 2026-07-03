import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

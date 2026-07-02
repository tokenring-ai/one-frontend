import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { BaseAttachment } from "@tokenring-ai/agent/AgentEvents";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AttachmentChip from "./AttachmentChip.tsx";

const { errorMock } = vi.hoisted(() => ({
  errorMock: vi.fn(),
}));

vi.mock("../ui/toast.tsx", () => ({
  toastManager: {
    error: errorMock,
  },
}));

const textAttachment: BaseAttachment = {
  type: "attachment",
  name: "notes.txt",
  encoding: "base64",
  mimeType: "text/plain",
  body: btoa("hello world"),
  timestamp: Date.now(),
};

describe("AttachmentChip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a toast when clipboard copy fails", async () => {
    const user = userEvent.setup();
    const writeTextSpy = vi.spyOn(navigator.clipboard, "writeText").mockRejectedValueOnce(new Error("Clipboard denied"));

    render(<AttachmentChip attachment={textAttachment} />);
    await user.click(screen.getByLabelText('Copy notes.txt to clipboard'));

    await waitFor(() => {
      expect(writeTextSpy).toHaveBeenCalledWith("hello world");
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Failed to copy "notes.txt" to clipboard:'), { duration: 5000 });
      expect(errorMock.mock.calls[0]?.[0]).toContain("Clipboard denied");
    });

    writeTextSpy.mockRestore();
  });

  it("shows a toast when download fails", async () => {
    const user = userEvent.setup();
    const createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockImplementationOnce(() => {
      throw new Error("Blob URL unavailable");
    });

    render(<AttachmentChip attachment={textAttachment} />);
    await user.click(screen.getByLabelText("Download notes.txt"));

    await waitFor(() => {
      expect(createObjectURLSpy).toHaveBeenCalled();
      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining('Failed to download "notes.txt":'), { duration: 5000 });
      expect(errorMock.mock.calls.at(-1)?.[0]).toContain("Blob URL unavailable");
    });
  });
});
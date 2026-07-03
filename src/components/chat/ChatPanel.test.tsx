import type { ReactNode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatInputProvider } from "../ChatInputContext.tsx";
import ChatPanel from "./ChatPanel.tsx";

const { sendInputMock } = vi.hoisted(() => ({
  sendInputMock: vi.fn(),
}));

vi.mock("../../hooks/useAgentEventState.ts", () => ({
  useAgentEventState: vi.fn(() => ({
    messages: [],
    agentStatus: { status: "running", inputExecutionQueue: [], currentActivity: "" },
    currentExecutionState: null,
    isConnecting: false,
    connectionError: null,
    reconnectAttempts: 0,
    agentNotFound: false,
    manualReconnect: vi.fn(),
  })),
}));

vi.mock("../../rpc.ts", () => ({
  agentRPCClient: {
    sendInput: sendInputMock,
  },
  useAvailableCommands: vi.fn(() => ({ data: [] })),
  useCommandHistory: vi.fn(() => ({ data: [], mutate: vi.fn() })),
}));

vi.mock("./AutoScrollContainer.tsx", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("./MessageList.tsx", () => ({ default: () => null }));
vi.mock("./PendingQuestions.tsx", () => ({ default: () => null }));
vi.mock("./ConnectionStatusBanner.tsx", () => ({ default: () => null }));
vi.mock("../overlay/file-browser.tsx", () => ({ default: () => null }));
vi.mock("../HookSelector.tsx", () => ({ default: () => null }));
vi.mock("../ModelSelector.tsx", () => ({ default: () => null }));
vi.mock("../SubAgentSelector.tsx", () => ({ default: () => null }));
vi.mock("../ToolSelector.tsx", () => ({ default: () => null }));

function renderChatPanel(agentId = "test-agent") {
  return render(
    <MemoryRouter>
      <ChatInputProvider>
        <ChatPanel agentId={agentId} />
      </ChatInputProvider>
    </MemoryRouter>,
  );
}

describe("ChatPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("restores input when send fails", async () => {
    const user = userEvent.setup();
    sendInputMock.mockRejectedValueOnce(new Error("Network error"));

    renderChatPanel();

    const input = screen.getByRole("textbox", { name: "Command or message input" });
    await user.type(input, "hello world");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() => {
      expect(input).toHaveValue("hello world");
    });
    expect(sendInputMock).toHaveBeenCalledWith({
      agentId: "test-agent",
      input: {
        from: "Chat webapp user",
        message: "hello world",
      },
    });
  });
});

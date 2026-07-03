import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";

vi.mock("./components/CheckpointBrowser.tsx", () => ({
  default: () => null,
}));

vi.mock("./rpc.ts", () => ({
  useAgentList: () => ({ data: [], isLoading: false, mutate: vi.fn() }),
  useAgentTypes: () => ({ data: [], isLoading: false }),
  useWorkflows: () => ({ data: [], isLoading: false }),
}));

function NavigationHarness() {
  const navigate = useNavigate();
  return (
    <>
      <button type="button" onClick={() => navigate("/agents")}>
        Go agents
      </button>
      <button type="button" onClick={() => navigate("/settings")}>
        Go settings
      </button>
      <App />
    </>
  );
}

describe("App route loading bar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading bar on initial mount and on navigation", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/"]}>
        <NavigationHarness />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("route-loading-bar")).toBeInTheDocument();

    vi.advanceTimersByTime(300);
    await waitFor(() => {
      expect(screen.queryByTestId("route-loading-bar")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Go agents" }));
    expect(screen.getByTestId("route-loading-bar")).toBeInTheDocument();
  });
});

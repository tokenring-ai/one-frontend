import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MarkdownEditor from "./MarkdownEditor.tsx";

vi.mock("@uiw/react-md-editor", () => ({
  default: ({ value }: { value: string }) => <textarea aria-label="md-editor" readOnly value={value} />,
}));

describe("MarkdownEditor", () => {
  it("syncs editor content when content prop changes", () => {
    const { rerender } = render(<MarkdownEditor content="first" />);
    expect(screen.getByRole("textbox", { name: "md-editor" })).toHaveValue("first");

    rerender(<MarkdownEditor content="second" />);
    expect(screen.getByRole("textbox", { name: "md-editor" })).toHaveValue("second");
  });
});

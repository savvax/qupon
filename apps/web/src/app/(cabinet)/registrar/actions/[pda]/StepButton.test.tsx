// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StepButton } from "./StepButton";

/** Task 1418: a successful step stays loading until polling sees the new status (devnet read lag). */

const bo = vi.hoisted(() => ({
  post: () => Promise.resolve({ signature: "SigStep1" as const }),
  refresh: () => {},
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: bo.refresh }),
}));
vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join(",")}` : key,
      { has: () => true },
    ),
}));
vi.mock("@/lib/boClient", () => ({
  boPost: () => bo.post(),
  BoError: class BoError extends Error {},
}));
vi.mock("@/lib/useRunWrite", () => ({
  useRunWrite:
    () =>
    async <T,>(o: { call: () => Promise<T> }): Promise<T | null> => {
      try {
        return await o.call();
      } catch {
        return null;
      }
    },
}));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const button = () => screen.getByRole("button") as HTMLButtonElement;

describe("StepButton (task 1418)", () => {
  it("stays loading after success until the status prop changes", async () => {
    const { rerender } = render(
      <StepButton pda="Act1" label="Advance" status="Snapshot" />,
    );
    const btn = button();
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await act(async () => {
      await Promise.resolve();
    });
    // write confirmed, but the server tree still reports the old status → keep waiting
    expect(btn.getAttribute("aria-busy")).toBe("true");
    expect(btn.disabled).toBe(true);
    rerender(<StepButton pda="Act1" label="Advance" status="Voting" />);
    expect(btn.getAttribute("aria-busy")).toBeNull();
    expect(btn.disabled).toBe(false);
  });

  it("re-enables when the 60 s poll budget ends with no status change", async () => {
    vi.useFakeTimers();
    render(<StepButton pda="Act1" label="Advance" status="Snapshot" />);
    fireEvent.click(button());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24 * 2500 + 100);
    });
    expect(button().getAttribute("aria-busy")).toBeNull();
    expect(button().disabled).toBe(false);
  });

  it("re-enables when the write fails", async () => {
    bo.post = () => Promise.reject(new Error("boom"));
    render(<StepButton pda="Act1" label="Advance" status="Snapshot" />);
    fireEvent.click(button());
    await act(async () => {
      await Promise.resolve();
    });
    expect(button().getAttribute("aria-busy")).toBeNull();
    expect(button().disabled).toBe(false);
  });
});

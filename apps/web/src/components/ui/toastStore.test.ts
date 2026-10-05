import { describe, expect, it } from "vitest";
import { createToastStore } from "./toastStore";
describe("toast store", () => {
  it("adds, updates and dismisses toasts", () => {
    const s = createToastStore();
    const id = s.push({ kind: "pending", title: "Sending" });
    s.update(id, { kind: "success", title: "Paid", tx: "abc" });
    expect(s.list()).toEqual([
      { id, kind: "success", title: "Paid", tx: "abc" },
    ]);
    s.dismiss(id);
    expect(s.list()).toEqual([]);
  });
});

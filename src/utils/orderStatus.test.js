import { describe, expect, it } from "vitest";
import { orderStatusClass, orderStatusLabel } from "./orderStatus";

describe("order status presentation", () => {
  it("uses the standard colours and labels for each operational state", () => {
    expect(orderStatusLabel("COOKING")).toBe("กำลังจัดเตรียม");
    expect(orderStatusClass("COOKING")).toContain("sky");
    expect(orderStatusClass("READY")).toContain("emerald");
    expect(orderStatusClass("PENDING")).toContain("amber");
    expect(orderStatusClass("CANCELLED")).toContain("rose");
  });

  it("keeps an unknown status safe and understandable", () => {
    expect(orderStatusLabel("unknown")).toBe("รอดำเนินการ");
    expect(orderStatusClass("unknown")).toContain("amber");
  });
});

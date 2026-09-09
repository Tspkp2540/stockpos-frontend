import { describe, expect, it } from "vitest";
import { maskPhone } from "./phone";

describe("maskPhone", () => {
  it("keeps only the last four digits", () => {
    expect(maskPhone("081-234-5678")).toBe("xxxxxx5678");
  });

  it("returns an empty value when no phone is supplied", () => {
    expect(maskPhone("")).toBe("");
  });

  it("does not expose a short partial number", () => {
    expect(maskPhone("123")).toBe("123");
  });
});

import { describe, expect, it } from "vitest";
import { createOrderSubmissionFingerprint, normalizePhone } from "./orderSubmission";

describe("order submission fingerprint", () => {
  const baseOrder = {
    channel_id: "2",
    customer_name: "  ณัฐ  ",
    customer_nickname: "นัท",
    customer_phone: "081-234-5678",
    coupon_code: " tea10 ",
    payment_method: "cash",
    amount_received: "100",
    items: [{ product_id: "4", qty: "2", price: "55", modifiers: [{ option_id: "9" }, { option_id: "2" }] }],
  };

  it("normalizes equivalent order data to the same idempotency key", () => {
    const first = createOrderSubmissionFingerprint(baseOrder, "2026-09-09");
    const retry = createOrderSubmissionFingerprint({
      ...baseOrder,
      customer_name: "ณัฐ",
      customer_phone: "0812345678",
      coupon_code: "TEA10",
      items: [{ ...baseOrder.items[0], modifiers: [2, 9] }],
    }, "2026-09-09");
    expect(retry).toBe(first);
  });

  it("changes when an order value that affects payment changes", () => {
    const first = createOrderSubmissionFingerprint(baseOrder, "2026-09-09");
    const changed = createOrderSubmissionFingerprint({ ...baseOrder, amount_received: "120" }, "2026-09-09");
    expect(changed).not.toBe(first);
  });

  it("keeps a zero cash amount instead of treating it as missing", () => {
    const fingerprint = JSON.parse(createOrderSubmissionFingerprint({ ...baseOrder, amount_received: 0 }, "2026-09-09"));
    expect(fingerprint.amount_received).toBe(0);
  });
});

describe("normalizePhone", () => {
  it("removes phone formatting before comparing an order retry", () => {
    expect(normalizePhone("081-234 5678")).toBe("0812345678");
  });
});

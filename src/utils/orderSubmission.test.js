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

  it("includes table and split-payment details so a retry cannot reuse a different bill", () => {
    const split = {
      ...baseOrder,
      table_id: "7",
      payments: [
        { payment_method: "CASH", paid_amount: "40", amount_received: "50" },
        { payment_method: "QR", paid_amount: "60" },
      ],
    };
    const first = createOrderSubmissionFingerprint(split, "2026-09-09");
    expect(createOrderSubmissionFingerprint({ ...split, table_id: "8" }, "2026-09-09")).not.toBe(first);
    expect(createOrderSubmissionFingerprint({ ...split, payments: [{ ...split.payments[0], paid_amount: "41" }, split.payments[1]] }, "2026-09-09")).not.toBe(first);
  });
});

describe("normalizePhone", () => {
  it("removes phone formatting before comparing an order retry", () => {
    expect(normalizePhone("081-234 5678")).toBe("0812345678");
  });
});

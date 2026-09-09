import { describe, expect, it } from "vitest";
import { menuAvailability, menuAvailabilityLabel } from "./menuAvailability";

describe("menu availability", () => {
  it("shows available stock quantities", () => {
    expect(menuAvailability({ available_quantity: '8' })).toMatchObject({ isAvailable: true, availableQuantity: 8, reason: 'AVAILABLE' });
    expect(menuAvailabilityLabel({ available_quantity: 8 })).toBe("พร้อมขาย · ได้สูงสุด 8 แก้ว");
  });

  it("shows low stock only when a menu is still available", () => {
    expect(menuAvailabilityLabel({ is_low_stock: true, available_quantity: 2 })).toBe("ใกล้หมด · เหลือประมาณ 2 แก้ว");
    expect(menuAvailability({ is_available: false, is_low_stock: true })).toMatchObject({ isAvailable: false, isLowStock: false });
  });

  it("prioritizes manual sold-out and insufficient stock states", () => {
    expect(menuAvailabilityLabel({ is_sold_out: true })).toBe("ปิดขายชั่วคราว");
    expect(menuAvailabilityLabel({ is_available: false })).toBe("วัตถุดิบไม่พอ");
    expect(menuAvailability({ available_quantity: 'unknown' }).availableQuantity).toBeNull();
  });
});

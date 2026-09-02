export const menuAvailability = (product = {}) => {
  const manuallySoldOut = product.is_sold_out === true;
  const isAvailable = !manuallySoldOut && product.is_available !== false;
  const rawQuantity = product.available_quantity;
  const availableQuantity = rawQuantity === null || rawQuantity === undefined || rawQuantity === ""
    ? null
    : Number(rawQuantity);
  const reason = manuallySoldOut
    ? "MANUALLY_SOLD_OUT"
    : product.availability_reason || (isAvailable ? "AVAILABLE" : "INSUFFICIENT_STOCK");
  const isLowStock = isAvailable && product.is_low_stock === true;

  return {
    isAvailable,
    manuallySoldOut,
    isLowStock,
    availableQuantity: Number.isFinite(availableQuantity) ? availableQuantity : null,
    reason,
  };
};

export const menuAvailabilityLabel = (product) => {
  const availability = menuAvailability(product);
  if (availability.manuallySoldOut) return "ปิดขายชั่วคราว";
  if (!availability.isAvailable) return "วัตถุดิบไม่พอ";
  if (availability.isLowStock) return `ใกล้หมด · เหลือประมาณ ${availability.availableQuantity} แก้ว`;
  if (availability.availableQuantity !== null) return `พร้อมขาย · ได้สูงสุด ${availability.availableQuantity} แก้ว`;
  return "พร้อมขาย";
};

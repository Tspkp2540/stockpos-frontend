const ORDER_STATUS = {
  PENDING: { label: "รอดำเนินการ", className: "bg-amber-50 text-amber-800 ring-1 ring-amber-200" },
  COOKING: { label: "กำลังจัดเตรียม", className: "bg-sky-50 text-sky-700 ring-1 ring-sky-200" },
  READY: { label: "พร้อมรับสินค้า", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  COMPLETED: { label: "เสร็จสิ้น", className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  RETURNED: { label: "คืนเงินแล้ว", className: "bg-slate-100 text-slate-700 ring-1 ring-slate-300" },
  CANCELLED: { label: "ยกเลิกแล้ว", className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
  ERROR: { label: "เกิดข้อผิดพลาด", className: "bg-rose-50 text-rose-700 ring-1 ring-rose-200" },
};

export const normalizeOrderStatus = (status) => String(status || "PENDING").trim().toUpperCase();

export const orderStatusLabel = (status) =>
  ORDER_STATUS[normalizeOrderStatus(status)]?.label || "รอดำเนินการ";

export const orderStatusClass = (status) =>
  ORDER_STATUS[normalizeOrderStatus(status)]?.className || ORDER_STATUS.PENDING.className;

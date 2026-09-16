import { useMemo } from "react";

const stageOrder = ["PENDING", "ACCEPTED", "IN_PROGRESS", "READY"];
const stageMeta = {
  PENDING: { label: "รอรับงาน", className: "bg-slate-100 text-slate-700" },
  ACCEPTED: { label: "รับออเดอร์แล้ว", className: "bg-violet-100 text-violet-700" },
  IN_PROGRESS: { label: "กำลังทำ", className: "bg-sky-100 text-sky-700" },
  READY: { label: "เสร็จสิ้น · พร้อมรับ", className: "bg-emerald-100 text-emerald-700" },
};
const stationLabel = { BAR: "บาร์", KITCHEN: "ครัว", BAKERY: "ขนม", OTHER: "จุดอื่น" };

export default function KitchenStatusStrip({ orders = [], limit = 6 }) {
  const activeOrders = useMemo(() => orders
    .filter((order) => ["COOKING", "READY"].includes(order.status))
    .slice(0, limit)
    .map((order) => {
      const items = order.rawItems || [];
      const stage = order.status === "READY"
        ? "READY"
        : [...items].sort((left, right) => stageOrder.indexOf(String(left.production_status || "PENDING")) - stageOrder.indexOf(String(right.production_status || "PENDING")))[0]?.production_status || "PENDING";
      const stations = [...new Set(items.map((item) => String(item.production_station || "BAR").toUpperCase()))]
        .map((station) => stationLabel[station] || station)
        .join(" · ");
      return { ...order, stage: stageMeta[stage] ? stage : "PENDING", stations };
    }), [limit, orders]);

  return <section className="rounded-2xl border border-sky-200 bg-sky-50/70 p-3 shadow-sm sm:p-4" aria-label="สถานะครัวล่าสุด">
    <div className="flex items-center justify-between gap-3">
      <div><h2 className="font-bold text-slate-900">สถานะครัวล่าสุด</h2><p className="text-xs text-slate-500">อัปเดตทันทีเมื่อครัวเปลี่ยนขั้นตอน</p></div>
      <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-sky-700">{activeOrders.length} คิว</span>
    </div>
    {activeOrders.length ? <div className="mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1">
      {activeOrders.map((order) => {
        const meta = stageMeta[order.stage];
        return <article className="min-w-[188px] snap-start rounded-xl border border-white bg-white p-3 shadow-sm" key={order.id}>
          <div className="flex items-start justify-between gap-2"><div><p className="font-black text-slate-900">คิว {order.queue_no || "-"}</p><p className="mt-0.5 text-[11px] text-slate-500">#{order.order_no}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${meta.className}`}>{meta.label}</span></div>
          <p className="mt-2 truncate text-xs font-semibold text-slate-700">{order.customer_nickname || order.customer_name || "ไม่ระบุชื่อลูกค้า"}</p>
          <p className="mt-1 text-[11px] text-slate-500">{order.stations || "กำลังตรวจสอบจุดผลิต"}</p>
        </article>;
      })}
    </div> : <p className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs text-slate-500">ยังไม่มีคิวที่อยู่ระหว่างเตรียมหรือพร้อมรับสินค้า</p>}
  </section>;
}

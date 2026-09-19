export const kitchenStageMeta = {
  PENDING: { label: "รอรับงาน", className: "bg-slate-100 text-slate-700" },
  ACCEPTED: { label: "รับออเดอร์แล้ว", className: "bg-sky-100 text-sky-700" },
  IN_PROGRESS: { label: "กำลังทำ", className: "bg-sky-100 text-sky-700" },
  READY: { label: "เสร็จสิ้น", className: "bg-emerald-100 text-emerald-700" },
};

const stageOrder = ["PENDING", "ACCEPTED", "IN_PROGRESS", "READY"];
const stationLabels = { BAR: "บาร์", KITCHEN: "ครัว", BAKERY: "ขนม", OTHER: "จุดอื่น" };

export const kitchenProgressForOrder = (order = {}) => {
  const items = Array.isArray(order.rawItems) ? order.rawItems : [];
  const groups = items.reduce((result, item) => {
    const station = String(item.production_station || "BAR").toUpperCase();
    result[station] = [...(result[station] || []), String(item.production_status || "PENDING").toUpperCase()];
    return result;
  }, {});
  const stations = Object.entries(groups).map(([station, stages]) => {
    const stage = [...stages].sort((left, right) => stageOrder.indexOf(left) - stageOrder.indexOf(right))[0] || "PENDING";
    return { station, label: stationLabels[station] || station, stage: kitchenStageMeta[stage] ? stage : "PENDING" };
  });
  const allReady = items.length ? items.every((item) => String(item.production_status || "PENDING").toUpperCase() === "READY") : order.status === "READY";
  return { stations, allReady };
};

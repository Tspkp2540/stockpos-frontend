import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import coffeeBarista from "../../assets/coffee-barista-kin-cha-kan-sky.webp";
import officeCoordinator from "../../assets/operations-office-coordinator.webp";
import stockCoordinator from "../../assets/operations-stock-coordinator.webp";
import MenuModifierPicker from "./MenuModifierPicker";
import CashShiftDialog from "./CashShiftDialog";
import { exportExcel } from "../../utils/exportExcel";
import { menuAvailability, menuAvailabilityLabel } from "../../utils/menuAvailability";
import { maskPhone } from "../../utils/phone";
import { printReceipt } from "../../utils/printReceipt";
import { printKitchenTicket } from "../../utils/printKitchenTicket";
import { loadPrintSettings, savePrintSettings } from "../../utils/printSettings";
import { printCashShiftSummary } from "../../utils/printCashShiftSummary";
import { loadPosMenuFavorites, loadPosMenuUsage, recordPosMenuUsage, togglePosMenuFavorite } from "../../utils/posMenuUsage";
import { productForChannel } from "../../utils/channelMenu";
import { orderStatusClass, orderStatusLabel } from "../../utils/orderStatus";
import { useActionDialog } from "./ActionDialog";

// Keep the 3D workspace available for the next design phase without loading it in production now.
const ENABLE_OPERATIONS_ROOM_3D = false;
const OperationsRoom3D = lazy(() => import("./OperationsRoom3D"));

const navigationGroups = [
  {
    id: "overview",
    icon: "🏪",
    label: "ภาพรวมการดำเนินงาน",
    description: "ติดตามภาพรวมร้านและงานที่ต้องดูแล",
    items: [{ id: "operations", icon: "📊", label: "ภาพรวมการดำเนินงานร้าน" }],
  },
  {
    id: "counter",
    icon: "🧾",
    label: "การขายหน้าร้าน",
    description: "ขาย รับชำระ จัดคิว และเตรียมสินค้า",
    items: [
      { id: "pos", icon: "🛒", label: "การขายและคำสั่งซื้อ" },
      { id: "tables", icon: "🪑", label: "จัดการโต๊ะและบิล", adminOnly: true },
      { id: "kitchen", icon: "👨‍🍳", label: "หน้าจอเตรียมสินค้า" },
      { id: "cash-shifts", icon: "💵", label: "จัดการกะเงินสด", adminOnly: true },
    ],
  },
  {
    id: "stock",
    icon: "📦",
    label: "สินค้าและสินค้าคงคลัง",
    description: "จัดการเมนู วัตถุดิบ และการจัดซื้อ",
    items: [
      { id: "alerts", icon: "🔔", label: "การแจ้งเตือน" },
      { id: "inventory", icon: "🧺", label: "จัดการวัตถุดิบ" },
      { id: "menu", icon: "☕", label: "จัดการเมนูสินค้า" },
      { id: "procurement", icon: "🚚", label: "การจัดซื้อ", adminOnly: true },
    ],
  },
  {
    id: "settings",
    icon: "⚙️",
    label: "การตั้งค่าร้าน",
    description: "กำหนดช่องทางขาย สมาชิก สิทธิ์ และการพิมพ์",
    items: [
      { id: "sales-channels", icon: "📱", label: "จัดการช่องทางการขาย", adminOnly: true },
      { id: "coupons", icon: "🎟️", label: "จัดการคูปอง", adminOnly: true },
      { id: "loyalty-settings", icon: "⭐", label: "ตั้งค่าคะแนนสะสม", adminOnly: true },
      { id: "loyalty-members", icon: "👥", label: "จัดการสมาชิก", adminOnly: true },
      { id: "role-permissions", icon: "🔐", label: "จัดการสิทธิ์บทบาท", adminOnly: true },
      { id: "audit-logs", icon: "🕘", label: "ประวัติการแก้ไข", adminOnly: true },
      { id: "printing", icon: "🖨️", label: "ตั้งค่าการพิมพ์", adminOnly: true },
    ],
  },
  {
    id: "finance",
    icon: "💰",
    label: "การเงินและรายงาน",
    description: "ติดตามยอดขาย ค่าใช้จ่าย และผลประกอบการ",
    items: [
      { id: "finance", icon: "💳", label: "ข้อมูลการเงิน" },
      { id: "business-reports", icon: "📈", label: "รายงานเชิงธุรกิจ", adminOnly: true },
    ],
  },
];

const categoryViewId = (groupId) => `category-${groupId}`;

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const orderNetAmounts = (order = {}) => {
  const gross = Number(order.gross_amount ?? order.net_revenue ?? 0);
  const refunded = Math.min(gross, Math.max(0, Number(order.refunded_amount || 0)));
  const refundRatio = gross > 0 ? refunded / gross : 0;
  const net = Math.max(0, Number(order.net_revenue || 0) * (1 - refundRatio));
  const cogs = Math.max(0, Number(order.total_cogs || 0) - Number(order.restored_cogs || 0));
  return { gross: Math.max(0, gross - refunded), net, cogs, profit: net - cogs, refunded };
};
const localDateTimeValue = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};
const expiryState = (value) => {
  if (!value) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (Number.isNaN(days)) return null;
  if (days < 0) return { label: `หมดอายุแล้ว ${Math.abs(days)} วัน`, tone: "rose" };
  if (days <= 7) return { label: days === 0 ? "หมดอายุวันนี้" : `หมดอายุใน ${days} วัน`, tone: "amber" };
  return null;
};
const inputClass =
  "w-full min-w-0 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
const labelClass = "grid min-w-0 gap-1.5 text-xs font-semibold text-slate-600";
const paymentOptions = [
  ["CASH", "เงินสด"],
  ["QR", "QR พร้อมเพย์"],
  ["TRANSFER", "โอนเงิน"],
  ["CARD", "บัตร"],
  ["OTHER", "อื่น ๆ"],
];

function Card({ children, className = "" }) {
  return (
    <section
      className={`shop-panel rounded-2xl border p-4 sm:p-5 ${className}`}
    >
      {children}
    </section>
  );
}

function Button({ children, className = "", variant = "primary", ...props }) {
  const styles = {
    primary: "bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-200",
    secondary:
      "border border-sky-200 bg-white text-sky-700 hover:bg-sky-50 focus:ring-sky-100",
    danger:
      "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus:ring-rose-100",
    quiet: "text-slate-600 hover:bg-slate-100 focus:ring-slate-100",
  };
  return (
    <button
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Modal({ children, onClose, label = "หน้าต่างจัดการ", maxWidth = "max-w-4xl" }) {
  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={onClose}
    >
      <div className="flex min-h-full items-center justify-center">
        <section
          aria-label={label}
          aria-modal="true"
          className={`relative w-full ${maxWidth} rounded-3xl shadow-2xl shadow-slate-900/30`}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <Button
            aria-label="ปิดหน้าต่าง"
            className="absolute right-3 top-3 z-10 h-9 w-9 px-0 text-lg"
            type="button"
            variant="secondary"
            onClick={onClose}
          >
            ×
          </Button>
          {children}
        </section>
      </div>
    </div>
  );
}

function FormSection({ title, description, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-sky-100 bg-sky-50/35 p-3.5 sm:p-4 ${className}`}>
      <div className="mb-3">
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {description ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

function RequiredMark() {
  return <span className="text-rose-600" aria-label="จำเป็น">*</span>;
}

function Status({ status }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${orderStatusClass(status)}`}
    >
      {orderStatusLabel(status)}
    </span>
  );
}

function ProductVisual({ product, className = "h-10 w-10" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSource = product?.image_data || product?.image_url;
  if (imageSource && !imageFailed) {
    return (
      <img
        alt=""
        className={`${className} shrink-0 rounded-lg border border-sky-100 bg-sky-50 object-cover`}
        loading="lazy"
        src={imageSource}
        onError={() => setImageFailed(true)}
      />
    );
  }
  return (
    <span className={`grid ${className} shrink-0 place-items-center rounded-lg bg-sky-50 text-lg`} aria-hidden="true">
      {product?.icon || "▦"}
    </span>
  );
}

const compressMenuImage = (file) => new Promise((resolve, reject) => {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    reject(new Error("กรุณาเลือกไฟล์ JPG, PNG หรือ WebP"));
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    reject(new Error("รูปต้นฉบับต้องมีขนาดไม่เกิน 12 MB"));
    return;
  }
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(objectUrl);
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = longestSide > 640 ? 640 / longestSide : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.76, 0.64, 0.52]) {
      const result = canvas.toDataURL("image/webp", quality);
      if (result.startsWith("data:image/webp") && result.length <= 160000) {
        resolve(result);
        return;
      }
    }
    reject(new Error("รูปมีรายละเอียดมากเกินไป กรุณาเลือกรูปอื่น"));
  };
  image.onerror = () => {
    URL.revokeObjectURL(objectUrl);
    reject(new Error("ไม่สามารถอ่านไฟล์รูปภาพได้"));
  };
  image.src = objectUrl;
});

function Heading({ title, description, action }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 hidden max-w-2xl truncate text-xs text-slate-500 md:block">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-5 text-center text-sm text-slate-500">
      {children}
    </div>
  );
}

function AdminHomePage({ groups, summary, onNavigate }) {
  return (
    <div className="space-y-5">
      <Heading
        title="ศูนย์จัดการร้าน"
        description="เลือกหมวดงานเพื่อเข้าสู่เมนูที่เกี่ยวข้อง"
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <button className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-left transition hover:border-amber-300" type="button" onClick={() => onNavigate("pos")}><p className="text-xs font-bold text-amber-800">คิวที่ต้องดูแล</p><strong className="mt-2 block text-3xl text-slate-900">{summary.pendingOrders}</strong><span className="mt-1 block text-xs text-slate-600">คำสั่งซื้อกำลังทำหรือพร้อมรับ</span></button>
        <button className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-left transition hover:border-rose-300" type="button" onClick={() => onNavigate("inventory")}><p className="text-xs font-bold text-rose-700">วัตถุดิบใกล้หมด</p><strong className="mt-2 block text-3xl text-slate-900">{summary.lowStock}</strong><span className="mt-1 block text-xs text-slate-600">รายการที่ต้องตรวจสอบ</span></button>
        <button className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-left transition hover:border-emerald-300" type="button" onClick={() => onNavigate("finance")}><p className="text-xs font-bold text-emerald-700">ยอดขายสุทธิ</p><strong className="mt-2 block text-2xl text-slate-900">{money(summary.netSales)}</strong><span className="mt-1 block text-xs text-slate-600">สรุปตามข้อมูลล่าสุด</span></button>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {groups.map((group) => (
          <button
            className="group rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-sky-100"
            key={group.id}
            type="button"
            onClick={() => onNavigate(categoryViewId(group.id))}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-100 text-3xl shadow-sm ring-1 ring-sky-200/70" aria-hidden="true">{group.icon}</span>
              <span className="text-sm font-bold text-sky-700 transition group-hover:translate-x-0.5">เปิด →</span>
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">{group.label}</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">{group.description}</p>
            <p className="mt-3 text-xs font-semibold text-sky-700">{group.items.length} เมนู</p>
          </button>
        ))}
      </section>
    </div>
  );
}

function CategoryHubPage({ group, onNavigate }) {
  return (
    <div className="space-y-5">
      <Heading
        title={group.label}
        description={group.description}
      />
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.items.map((item) => (
          <button
            className="group rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:bg-sky-50 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-sky-100"
            key={item.id}
            type="button"
            onClick={() => onNavigate(item.id)}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sky-100 text-3xl shadow-sm ring-1 ring-sky-200/70" aria-hidden="true">{item.icon}</span>
              <span className="text-sm font-bold text-sky-700 transition group-hover:translate-x-0.5">เปิด →</span>
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-900">{item.label}</h2>
          </button>
        ))}
      </section>
    </div>
  );
}

function LowStockMenuAlert({ products, className = "" }) {
  const lowStockMenus = products.filter((product) => menuAvailability(product).isLowStock);
  if (!lowStockMenus.length) return null;
  return (
    <div className={`rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm ${className}`} role="status">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-bold">⚠ เมนูใกล้หมด {lowStockMenus.length} รายการ</span>
        <span className="text-xs text-amber-800">ตรวจรับวัตถุดิบหรือปิดขายชั่วคราวก่อนหมด</span>
      </div>
      <p className="mt-1 text-sm font-medium text-amber-900">
        {lowStockMenus.slice(0, 3).map((product) => `${product.name} (${menuAvailability(product).availableQuantity} แก้ว)`).join(" · ")}
        {lowStockMenus.length > 3 ? ` และอีก ${lowStockMenus.length - 3} รายการ` : ""}
      </p>
    </div>
  );
}

function OrderReturnModal({ order, onClose, onSubmit }) {
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const items = Array.isArray(order?.rawItems) ? order.rawItems : [];
  useEffect(() => {
    setQuantities(Object.fromEntries(items.map((item) => [String(item.order_item_id), "0"])));
    setReason("");
  }, [order?.id]);
  const lines = items.map((item) => {
    const available = Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0));
    const selected = Math.min(available, Math.max(0, Number(quantities[String(item.order_item_id)] || 0)));
    return { ...item, available, selected };
  }).filter((item) => item.available > 0);
  const selectedSubtotal = lines.reduce((sum, item) => sum + item.selected * Number(item.unit_price || 0), 0);
  const remainingRefund = Math.max(0, Number(order?.gross_amount || 0) - Number(order?.refunded_amount || 0));
  const estimatedRefund = Math.min(remainingRefund, Number(order?.subtotal_amount || 0) > 0 ? selectedSubtotal * Number(order?.gross_amount || 0) / Number(order.subtotal_amount) : 0);
  const updateQuantity = (item, value) => {
    const next = Math.min(item.available, Math.max(0, Number(value || 0)));
    setQuantities((current) => ({ ...current, [String(item.order_item_id)]: String(next) }));
  };
  const submit = async (event) => {
    event.preventDefault();
    const selectedItems = lines.filter((item) => item.selected > 0).map((item) => ({ order_item_id: item.order_item_id, quantity: item.selected }));
    if (!selectedItems.length || saving) return;
    setSaving(true);
    const success = await onSubmit(order.id, { items: selectedItems, reason });
    setSaving(false);
    if (success) onClose();
  };
  const paymentLabel = { CASH: "เงินสด", QR: "QR พร้อมเพย์", TRANSFER: "โอนเงิน", CARD: "บัตร", OTHER: "อื่น ๆ" }[order?.payment?.payment_method] || "ช่องทางเดิม";
  return <Modal label={`คืนสินค้า ${order?.order_no || ""}`} maxWidth="max-w-2xl" onClose={onClose}>
    <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-white">
      <div className="pr-10"><p className="text-xs font-bold text-violet-700">คืนสินค้าและคืนเงิน</p><h2 className="mt-1 text-lg font-bold text-slate-900">ออเดอร์ #{order?.order_no}</h2><p className="mt-1 text-sm text-slate-500">คืนเงินผ่าน {paymentLabel} · เลือกรายการและจำนวนที่ลูกค้านำมาคืน</p></div>
      {lines.length ? <form className="mt-5 space-y-4" onSubmit={submit}>
        <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {lines.map((item) => <div className="grid grid-cols-[minmax(0,1fr)_104px] items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/45 p-3" key={item.order_item_id}><div><p className="font-semibold text-slate-800">{item.name || "สินค้า"}</p><p className="mt-0.5 text-xs text-slate-500">ซื้อ {item.quantity} · คืนแล้ว {item.returned_quantity || 0} · คืนได้อีก {item.available} · {money(item.unit_price)} / ชิ้น</p>{Array.isArray(item.modifiers) && item.modifiers.length ? <p className="mt-1 text-xs text-violet-700">{item.modifiers.map((modifier) => modifier.name).join(" · ")}</p> : null}</div><label className="grid gap-1 text-xs font-bold text-slate-600">จำนวนคืน<input className={inputClass} type="number" inputMode="decimal" min="0" max={item.available} step="0.001" value={quantities[String(item.order_item_id)] || "0"} onChange={(event) => updateQuantity(item, event.target.value)} /></label></div>)}
        </div>
        <label className={labelClass}>เหตุผลการคืนสินค้า<textarea className={`${inputClass} min-h-20 resize-y`} maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น สินค้าผิดรายการ / ลูกค้าเปลี่ยนใจ" /></label>
        <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-bold text-violet-700">ยอดคืนโดยประมาณ</p><p className="mt-1 text-2xl font-black text-violet-900">{money(estimatedRefund)}</p></div><p className="text-xs text-violet-700">ระบบคำนวณส่วนลด คะแนน และคูปองตามสัดส่วน พร้อมคืนสต็อกล็อตเดิม</p></div></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button><Button type="submit" variant="danger" disabled={saving || selectedSubtotal <= 0}>{saving ? "กำลังคืนสินค้า..." : "ยืนยันคืนสินค้า"}</Button></div>
      </form> : <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-600">ไม่มีสินค้าเหลือให้คืนในออเดอร์นี้</div>}
    </Card>
  </Modal>;
}

function OrdersPage({ orders, onUpdate, onReturn, preview = false, onViewAll, onBack }) {
  const { showMessage } = useActionDialog();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [channelFilter, setChannelFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [returnOrder, setReturnOrder] = useState(null);
  const channelOptions = useMemo(
    () => [...new Set(orders.map((order) => order.channel_name).filter(Boolean))],
    [orders],
  );
  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((order) => {
      const searchable = [
        order.order_no,
        order.queue_no,
        order.customer_name,
        order.customer_nickname,
        order.customer_phone,
        order.channel_name,
      ].filter(Boolean).join(" ").toLowerCase();
      return (!term || searchable.includes(term))
        && (statusFilter === "ALL" || order.status === statusFilter)
        && (channelFilter === "ALL" || order.channel_name === channelFilter)
        && (!dateFilter || bangkokDate(order.created_at) === dateFilter);
    });
  }, [channelFilter, dateFilter, orders, search, statusFilter]);
  const visibleOrders = preview ? orders.slice(0, 5) : filteredOrders;
  const headingAction = preview && orders.length > 5
    ? <Button type="button" variant="secondary" onClick={onViewAll}>ดูรายการออเดอร์ทั้งหมด →</Button>
    : onBack
      ? <Button type="button" variant="secondary" onClick={onBack}>← กลับหน้าขาย</Button>
      : null;
  const handlePrint = (order) => {
    if (printReceipt(order)) return;
    showMessage({
      tone: "danger",
      title: "เปิดใบเสร็จไม่ได้",
      message: "กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อพิมพ์ใบเสร็จ",
    });
  };
  return (
    <div className="space-y-5 pb-24 xl:pb-0">
      <Heading
        title={preview ? "คำสั่งซื้อล่าสุด" : "รายการคำสั่งซื้อทั้งหมด"}
        description={preview ? `แสดง 5 รายการล่าสุดจากทั้งหมด ${orders.length} รายการ` : "ติดตามสถานะออเดอร์ทั้งหมดจากจุดเดียว"}
        action={headingAction}
      />
      {!preview ? (
        <Card className="p-3 sm:p-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_150px_180px_165px_auto]">
            <input
              aria-label="ค้นหาออเดอร์"
              className={inputClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาเลขออเดอร์ คิว ชื่อลูกค้า หรือเบอร์โทร"
            />
            <select aria-label="กรองสถานะออเดอร์" className={inputClass} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="ALL">ทุกสถานะ</option>
              <option value="COOKING">กำลังทำ</option>
              <option value="READY">พร้อมรับ</option>
              <option value="COMPLETED">สำเร็จ</option>
              <option value="RETURNED">คืนเงินแล้ว</option>
              <option value="CANCELLED">ยกเลิก</option>
            </select>
            <select aria-label="กรองช่องทางขาย" className={inputClass} value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
              <option value="ALL">ทุกช่องทาง</option>
              {channelOptions.map((channel) => <option value={channel} key={channel}>{channel}</option>)}
            </select>
            <input aria-label="กรองวันที่ออเดอร์" className={inputClass} type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} />
            <Button type="button" variant="secondary" onClick={() => { setSearch(""); setStatusFilter("ALL"); setChannelFilter("ALL"); setDateFilter(""); }}>
              ล้างตัวกรอง
            </Button>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">พบ {filteredOrders.length} จาก {orders.length} รายการ</p>
        </Card>
      ) : null}
      {preview && visibleOrders.length > 1 ? <p className="-mt-2 text-xs font-semibold text-sky-700">← เลื่อนซ้าย–ขวาเพื่อดูออเดอร์ล่าสุด →</p> : null}
      <div className={preview ? "flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pr-1" : "grid gap-4 xl:grid-cols-2"}>
        {visibleOrders.length ? (
          visibleOrders.map((order) => (
            <article
              className={`rounded-2xl border border-sky-100 bg-white p-4 shadow-sm ${preview ? "w-[86vw] max-w-[360px] shrink-0 snap-start sm:w-[360px]" : ""}`}
              key={order.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">#{order.order_no}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {order.channel_name}
                  </p>
                  {order.customer_phone && (
                    <p className="mt-1 text-xs text-slate-400">
                      {order.customer_name || order.customer_nickname || "ลูกค้า"} · {maskPhone(order.customer_phone)}
                    </p>
                  )}
                </div>
                <Status status={order.status} />
              </div>
              <p className="mt-3 line-clamp-2 text-sm text-slate-600">
                {order.items || "ไม่มีรายการสินค้า"}
              </p>
              {Number(order.refunded_amount || 0) > 0 ? <p className="mt-2 text-xs font-bold text-violet-700">คืนเงินแล้ว {money(order.refunded_amount)}</p> : null}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <strong className="text-lg text-sky-700">
                  {money(order.net_revenue)}
                </strong>
                {order.status === "COOKING" ? (
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-xl bg-sky-50 px-2.5 py-2 text-xs font-bold text-sky-700">รอครัวยืนยัน</span>
                    <Button
                      className="text-xs"
                      variant="danger"
                      onClick={() => onUpdate(order.id, "CANCELLED")}
                    >
                      ยกเลิก
                    </Button>
                    <Button className="text-xs" variant="secondary" onClick={() => handlePrint(order)}>
                      ใบเสร็จ
                    </Button>
                  </div>
                ) : order.status === "READY" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button className="text-xs" onClick={() => onUpdate(order.id, "COMPLETED")}>
                      ส่งมอบแล้ว
                    </Button>
                    {Number(order.gross_amount || 0) > Number(order.refunded_amount || 0) + 0.005 ? <Button className="text-xs" variant="danger" onClick={() => setReturnOrder(order)}>คืนสินค้า</Button> : null}
                    <Button className="text-xs" variant="secondary" onClick={() => handlePrint(order)}>
                      ใบเสร็จ
                    </Button>
                  </div>
                ) : <div className="flex flex-wrap gap-2"><Button className="text-xs" variant="secondary" onClick={() => handlePrint(order)}>ใบเสร็จ</Button>{["COMPLETED", "READY"].includes(order.status) && Number(order.gross_amount || 0) > Number(order.refunded_amount || 0) + 0.005 ? <Button className="text-xs" variant="danger" onClick={() => setReturnOrder(order)}>คืนสินค้า</Button> : null}</div>}
              </div>
            </article>
          ))
        ) : (
          <Empty>{preview ? "ยังไม่มีออเดอร์" : "ไม่พบออเดอร์ที่ตรงกับตัวกรอง"}</Empty>
        )}
      </div>
      {preview && orders.length > 5 ? (
        <div className="flex justify-center">
          <Button type="button" variant="secondary" onClick={onViewAll}>ดูรายการออเดอร์ทั้งหมด ({orders.length}) →</Button>
        </div>
      ) : null}
      {returnOrder ? <OrderReturnModal order={returnOrder} onClose={() => setReturnOrder(null)} onSubmit={onReturn} /> : null}
    </div>
  );
}

function KitchenDisplayPage({ orders, onUpdate, onUpdateStation }) {
  const { showMessage } = useActionDialog();
  const [now, setNow] = useState(() => Date.now());
  const [stationFilter, setStationFilter] = useState("ALL");
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const activeOrders = orders.filter((order) => !["COMPLETED", "RETURNED", "CANCELLED"].includes(order.status));
  const elapsedMinutes = (order) => {
    const createdAt = new Date(order.created_at || order.order_date || now).getTime();
    return Math.max(0, Math.floor((now - createdAt) / 60000));
  };
  const elapsed = (order) => {
    const minutes = elapsedMinutes(order);
    return minutes ? `รอ ${minutes} นาที` : "เพิ่งเข้าคิว";
  };
  const stationLabel = { BAR: "บาร์เครื่องดื่ม", KITCHEN: "ครัวอาหาร", BAKERY: "ครัวขนม", OTHER: "จุดผลิตอื่น" };
  const stationOrder = ["BAR", "KITCHEN", "BAKERY", "OTHER"];
  const productionStages = ["PENDING", "ACCEPTED", "IN_PROGRESS", "READY"];
  const productionStageMeta = {
    PENDING: { label: "รอรับงาน", className: "bg-slate-100 text-slate-700", next: "ACCEPTED", action: "รับออเดอร์" },
    ACCEPTED: { label: "รับออเดอร์แล้ว", className: "bg-violet-100 text-violet-700", next: "IN_PROGRESS", action: "เริ่มทำ" },
    IN_PROGRESS: { label: "กำลังทำ", className: "bg-sky-100 text-sky-700", next: "READY", action: "ยืนยันเสร็จสิ้น" },
    READY: { label: "เสร็จสิ้น", className: "bg-emerald-100 text-emerald-700", next: "IN_PROGRESS", action: "เปิดทำงานอีกครั้ง" },
  };
  const stageFor = (items) => [...items]
    .sort((left, right) => productionStages.indexOf(String(left.production_status || "PENDING")) - productionStages.indexOf(String(right.production_status || "PENDING")))[0]?.production_status || "PENDING";
  const stationSummary = useMemo(() => stationOrder.map((station) => ({
    station,
    label: stationLabel[station],
    count: activeOrders.filter((order) => (order.rawItems || []).some((item) => String(item.production_station || "BAR") === station && item.production_status !== "READY")).length,
  })).filter((entry) => entry.count || stationFilter === entry.station), [activeOrders, stationFilter]);
  const urgencyFor = (order, items) => {
    const target = Math.max(1, ...items.map((item) => Number(item.target_prep_minutes || 5)));
    const minutes = elapsedMinutes(order);
    return { target, minutes, isLate: minutes > target + 5, isNear: minutes >= target };
  };
  const handleKitchenPrint = (order) => {
    if (printKitchenTicket(order)) return;
    showMessage({
      tone: "danger",
      title: "เปิดใบครัวไม่ได้",
      message: "กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อพิมพ์ใบครัว",
    });
  };
  const Ticket = ({ order, station }) => {
    const rawItems = Array.isArray(order.rawItems) ? order.rawItems : [];
    const stationItems = station ? rawItems.filter((item) => String(item.production_station || "BAR") === station) : rawItems;
    const isReady = order.status === "READY";
    const pendingStationItems = stationItems.filter((item) => item.production_status !== "READY");
    const urgency = urgencyFor(order, stationItems);
    const stationComplete = stationItems.length > 0 && pendingStationItems.length === 0;
    const stationStage = stageFor(stationItems);
    const stageMeta = productionStageMeta[stationStage] || productionStageMeta.PENDING;
    return (
      <article className={`rounded-2xl border bg-white p-4 shadow-sm ${urgency.isLate ? "border-rose-300 ring-1 ring-rose-100" : urgency.isNear ? "border-amber-300" : isReady ? "border-emerald-200" : "border-sky-200"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-black text-slate-900">คิว {order.queue_no || "-"}</p>
            <p className={`mt-1 text-xs font-bold ${urgency.isLate ? "text-rose-700" : urgency.isNear ? "text-amber-700" : "text-slate-500"}`}>#{order.order_no} · {elapsed(order)} · เป้าหมาย {urgency.target} นาที{urgency.isLate ? " · คิวช้า" : urgency.isNear ? " · ใกล้เกินเวลา" : ""}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${orderStatusClass(order.status)}`}>
            {orderStatusLabel(order.status)}
          </span>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-500">{order.customer_nickname || order.customer_name || "ไม่ระบุชื่อลูกค้า"} · {order.channel_name || "หน้าร้าน"}</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {stationItems.length ? stationItems.map((item, index) => (
              <li className="flex items-start justify-between gap-2" key={`${item.product_id || item.name}-${index}`}>
                <span>
                <span className="font-bold">{item.name} × {item.quantity ?? item.qty}</span>
                {(item.modifiers || []).length ? (
                  <span className="mt-0.5 block text-xs text-violet-700">{item.modifiers.map((modifier) => modifier.name).join(" · ")}</span>
                ) : null}
                </span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${(productionStageMeta[item.production_status] || productionStageMeta.PENDING).className}`}>{(productionStageMeta[item.production_status] || productionStageMeta.PENDING).label}</span></li>
            )) : <li>{order.items || "ไม่มีรายละเอียดสินค้า"}</li>}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {station ? <Button className="flex-1" disabled={!stationItems.length} variant={stationStage === "READY" ? "secondary" : "primary"} onClick={() => onUpdateStation?.(order.id, station, stageMeta.next)}>
            {stageMeta.action} · {stationLabel[station]}
          </Button> : <Button className="flex-1" onClick={() => onUpdate(order.id, isReady ? "COMPLETED" : "READY")}>{isReady ? "ส่งมอบแล้ว" : "ทำเสร็จ / พร้อมรับ"}</Button>}
          <Button className="text-xs" variant="secondary" onClick={() => handleKitchenPrint(order)}>
            พิมพ์ใบครัว
          </Button>
        </div>
      </article>
    );
  };
  const cooking = activeOrders.filter((order) => order.status !== "READY");
  const ready = activeOrders.filter((order) => order.status === "READY");
  return (
    <div className="space-y-5">
      <Heading
        title="หน้าจอเตรียมสินค้า"
        description="แยกจุดผลิต ติดตามเวลารอ และแจ้งคิวที่ช้ากว่าเป้าหมาย"
        action={<span className="rounded-full bg-sky-100 px-3 py-2 text-sm font-bold text-sky-700">{activeOrders.length} คิวที่ต้องดูแล</span>}
      />
      <div className="flex flex-wrap gap-2"><Button type="button" className="text-xs" variant={stationFilter === "ALL" ? "primary" : "secondary"} onClick={() => setStationFilter("ALL")}>ทุกจุดผลิต</Button>{stationSummary.map((entry) => <Button key={entry.station} type="button" className="text-xs" variant={stationFilter === entry.station ? "primary" : "secondary"} onClick={() => setStationFilter(entry.station)}>{entry.label} · {entry.count}</Button>)}</div>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-sky-200 bg-sky-50/60 p-4 sm:p-5 xl:col-span-2">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-sky-950">กำลังทำตามจุดผลิต</h2><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-sky-700">{cooking.length} คิว</span></div>
          <div className="grid gap-4 xl:grid-cols-2">{stationSummary.filter((entry) => stationFilter === "ALL" || stationFilter === entry.station).map((entry) => { const tickets = cooking.filter((order) => (order.rawItems || []).some((item) => String(item.production_station || "BAR") === entry.station)).sort((left, right) => urgencyFor(right, (right.rawItems || []).filter((item) => String(item.production_station || "BAR") === entry.station)).minutes - urgencyFor(left, (left.rawItems || []).filter((item) => String(item.production_station || "BAR") === entry.station)).minutes); return <section className="rounded-2xl border border-white bg-white/70 p-3" key={entry.station}><h3 className="mb-3 text-sm font-black text-slate-800">{entry.label} · {tickets.length} คิว</h3><div className="grid gap-3">{tickets.length ? tickets.map((order) => <Ticket key={`${entry.station}-${order.id}`} order={order} station={entry.station} />) : <Empty>ไม่มีงานในจุดนี้</Empty>}</div></section>; })}</div>
        </section>
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-emerald-950">พร้อมรับสินค้า</h2><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700">{ready.length}</span></div>
          <div className="grid gap-3">{ready.length ? ready.map((order) => <Ticket key={order.id} order={order} />) : <Empty>ยังไม่มีรายการที่พร้อมรับ</Empty>}</div>
        </section>
      </div>
    </div>
  );
}

function PrintingSettingsPage() {
  const { showMessage } = useActionDialog();
  const [settings, setSettings] = useState(() => loadPrintSettings());
  const updateSetting = (field, value) => setSettings((current) => ({ ...current, [field]: value }));
  const sampleOrder = {
    order_no: "TEST-PRINT",
    queue_no: 1,
    channel_name: "หน้าร้าน",
    customer_nickname: "ลูกค้าทดสอบ",
    created_at: new Date().toISOString(),
    rawItems: [
      { name: "ชานมไข่มุก", quantity: 1, unit_price: 55, modifiers: [{ name: "หวานน้อย" }, { name: "ไข่มุก" }] },
      { name: "ครัวซองต์เนยสด", quantity: 1, unit_price: 45, modifiers: [] },
    ],
    subtotal_amount: 100,
    gross_amount: 100,
    payment: { payment_method: "CASH", amount_received: 100, change_amount: 0 },
  };
  const save = () => {
    savePrintSettings(settings);
    showMessage({ tone: "success", title: "บันทึกการตั้งค่าการพิมพ์แล้ว", message: "การตั้งค่านี้จะใช้กับเครื่องและเบราว์เซอร์ปัจจุบัน" });
  };
  const testPrint = (type) => {
    savePrintSettings(settings);
    const opened = type === "receipt" ? printReceipt(sampleOrder) : printKitchenTicket(sampleOrder);
    if (opened) return;
    showMessage({ tone: "danger", title: "เปิดหน้าพิมพ์ไม่ได้", message: "กรุณาอนุญาตหน้าต่างป๊อปอัป แล้วลองอีกครั้ง" });
  };
  const PrinterFields = ({ title, description, widthField, labelField, testType }) => (
    <Card className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          ขนาดกระดาษ
          <select className={inputClass} value={settings[widthField]} onChange={(event) => updateSetting(widthField, event.target.value)}>
            <option value="80">80 มม.</option>
            <option value="58">58 มม.</option>
          </select>
        </label>
        <label className={labelClass}>
          ชื่อเครื่องพิมพ์ (เพื่ออ้างอิง)
          <input className={inputClass} value={settings[labelField]} onChange={(event) => updateSetting(labelField, event.target.value)} placeholder="เช่น Thermal Counter 01" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50/70 p-3">
        <p className="text-xs leading-5 text-slate-600">เมื่อสั่งพิมพ์ ระบบจะเปิดหน้าต่างของระบบปฏิบัติการ เพื่อเลือกเครื่องพิมพ์จริงก่อนยืนยัน</p>
        <Button type="button" variant="secondary" onClick={() => testPrint(testType)}>ทดสอบพิมพ์</Button>
      </div>
    </Card>
  );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Heading title="ตั้งค่าการพิมพ์หน้าร้าน" description="กำหนดรูปแบบใบเสร็จและใบเตรียมสินค้า ก่อนเลือกเครื่องพิมพ์จากหน้าต่างพิมพ์" />
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        เว็บไซต์ไม่สามารถล็อกให้พิมพ์ไปที่เครื่องใดเครื่องหนึ่งได้โดยตรงเพื่อความปลอดภัย จึงให้เลือกเครื่องจริงในหน้าต่างพิมพ์ทุกครั้ง ส่วนชื่อเครื่องในหน้านี้ใช้เป็นข้อมูลอ้างอิงของจุดพิมพ์
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <PrinterFields title="ใบเสร็จรับเงิน" description="สำหรับส่งมอบให้ลูกค้าหลังชำระเงิน" widthField="receipt_paper_width" labelField="receipt_printer_label" testType="receipt" />
        <PrinterFields title="ใบเตรียมสินค้า / ครัว" description="สำหรับเครื่องดื่มและครัว ใช้ได้จากจอเตรียมสินค้า" widthField="kitchen_paper_width" labelField="kitchen_printer_label" testType="kitchen" />
      </div>
      <div className="flex justify-end">
        <Button type="button" onClick={save}>บันทึกการตั้งค่า</Button>
      </div>
    </div>
  );
}

function PosPage({ channels, diningTables = [], products, currentShift, loyaltySettings, onAdd, onLookupLoyalty, onValidateCoupon, onQuotePromotion, onOpenCashShift, onCloseCashShift }) {
  const { showMessage } = useActionDialog();
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [tableId, setTableId] = useState("");
  const activeChannels = useMemo(
    () => channels.filter((channel) => channel.is_active !== false),
    [channels],
  );
  useEffect(() => {
    if (activeChannels.some((channel) => String(channel.id) === String(channelId))) return;
    setChannelId(activeChannels[0]?.id || "");
  }, [activeChannels, channelId]);
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [cashShiftDialog, setCashShiftDialog] = useState(null);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [editingCartKey, setEditingCartKey] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [loyaltyError, setLoyaltyError] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [promotionQuote, setPromotionQuote] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentRows, setPaymentRows] = useState([{ payment_method: "CASH", paid_amount: "", amount_received: "" }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategory, setMenuCategory] = useState("ALL");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [menuUsage, setMenuUsage] = useState(loadPosMenuUsage);
  const [favoriteMenuIds, setFavoriteMenuIds] = useState(loadPosMenuFavorites);
  const channelProducts = useMemo(
    () => products
      .map((product) => productForChannel(product, channelId))
      .filter((product) => product.channel_available),
    [channelId, products],
  );
  const menuCategories = useMemo(
    () => [...new Set(channelProducts.map((product) => String(product.category || "").trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, "th")),
    [channelProducts],
  );
  const visibleProducts = useMemo(() => {
    const term = menuSearch.trim().toLowerCase();
    return channelProducts.filter((product) => {
      const searchable = [product.name, product.category, product.barcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (!term || searchable.includes(term))
        && (menuCategory === "ALL" || String(product.category || "").trim() === menuCategory);
    });
  }, [channelProducts, menuCategory, menuSearch]);
  const quickProducts = useMemo(
    () => channelProducts
      .filter((product) => menuAvailability(product).isAvailable && Number(menuUsage[String(product.id)] || 0) > 0)
      .sort((left, right) => Number(menuUsage[String(right.id)] || 0) - Number(menuUsage[String(left.id)] || 0))
      .slice(0, 6),
    [channelProducts, menuUsage],
  );
  const favoriteProducts = useMemo(
    () => channelProducts.filter((product) => favoriteMenuIds.includes(String(product.id))).slice(0, 8),
    [channelProducts, favoriteMenuIds],
  );
  const noteMenuUsed = (product) => setMenuUsage((current) => recordPosMenuUsage(current, product.id));
  const toggleFavorite = (productId) => setFavoriteMenuIds((current) => togglePosMenuFavorite(current, productId));
  const openCart = () => {
    setCheckoutStep(1);
    setCartOpen(true);
  };
  const selectChannel = (nextChannelId) => {
    if (String(nextChannelId) === String(channelId)) return;
    if (cart.length) {
      showMessage({
        tone: "danger",
        title: "เปลี่ยนช่องทางขายไม่ได้",
        message: "กรุณายืนยันหรือล้างตะกร้าก่อน เพื่อให้ราคาเมนูในตะกร้าตรงกับช่องทางขาย",
      });
      return;
    }
    setChannelId(nextChannelId);
  };
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
        0,
      ),
    [cart],
  );
  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0), 0),
    [cart],
  );
  const loyaltyCupCount = useMemo(
    () => cart.reduce((sum, item) => item.counts_as_loyalty_cup === true ? sum + Math.max(0, Number(item.qty) || 0) : sum, 0),
    [cart],
  );
  const manualDiscountAmount = useMemo(() => {
    const value = Math.max(0, Number(discountValue) || 0);
    return discountType === "percent"
      ? Math.min(subtotal, subtotal * Math.min(value, 100) / 100)
      : Math.min(subtotal, value);
  }, [discountType, discountValue, subtotal]);
  const promotionDiscountAmount = Math.min(Math.max(0, Number(promotionQuote?.discount_amount || 0)), Math.max(0, subtotal - manualDiscountAmount));
  const couponDiscountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const eligibleAmount = Math.max(0, subtotal - manualDiscountAmount - promotionDiscountAmount);
    if (eligibleAmount < Number(appliedCoupon.min_order_amount || 0)) return 0;
    const rawDiscount = appliedCoupon.discount_type === "PERCENT"
      ? eligibleAmount * Math.min(Number(appliedCoupon.discount_value || 0), 100) / 100
      : Number(appliedCoupon.discount_value || 0);
    const cappedDiscount = Number(appliedCoupon.max_discount_amount || 0) > 0
      ? Math.min(rawDiscount, Number(appliedCoupon.max_discount_amount))
      : rawDiscount;
    return Math.min(eligibleAmount, cappedDiscount);
  }, [appliedCoupon, manualDiscountAmount, promotionDiscountAmount, subtotal]);
  const activeLoyaltyRules = loyaltyData?.rules || loyaltySettings || {};
  const loyaltyEarnEnabled = activeLoyaltyRules.earn_enabled !== undefined ? activeLoyaltyRules.earn_enabled === true : activeLoyaltyRules.is_enabled !== false;
  const loyaltyRedeemEnabled = activeLoyaltyRules.redeem_enabled !== undefined ? activeLoyaltyRules.redeem_enabled === true : activeLoyaltyRules.is_enabled !== false;
  const loyaltyEnabled = loyaltyEarnEnabled || loyaltyRedeemEnabled;
  const loyaltyEarnMode = String(activeLoyaltyRules.earn_mode || "SPEND").toUpperCase() === "CUP" ? "CUP" : "SPEND";
  const loyaltySpendPerPoint = Math.max(0.01, Number(activeLoyaltyRules.spend_per_point || 25));
  const loyaltyCupsPerPoint = Math.max(1, Number(activeLoyaltyRules.cups_per_point || 1));
  const loyaltyBahtPerPoint = Math.max(0.01, Number(activeLoyaltyRules.baht_per_point || 0.1));
  const loyaltyMaxRedeemPercent = Math.max(0, Math.min(100, Number(activeLoyaltyRules.max_redeem_percent ?? 50)));
  const loyaltyBaseAmount = Math.max(0, subtotal - manualDiscountAmount - promotionDiscountAmount - couponDiscountAmount);
  const loyaltyBalance = Math.max(0, Number(loyaltyData?.account?.points_balance || 0));
  const loyaltyMaxPoints = loyaltyRedeemEnabled
    ? Math.min(loyaltyBalance, Math.floor((loyaltyBaseAmount * (loyaltyMaxRedeemPercent / 100)) / loyaltyBahtPerPoint))
    : 0;
  const loyaltyPointsRedeemed = Math.min(loyaltyMaxPoints, Math.max(0, Math.floor(Number(loyaltyPoints) || 0)));
  const loyaltyDiscountAmount = Number((loyaltyPointsRedeemed * loyaltyBahtPerPoint).toFixed(2));
  const total = Math.max(0, loyaltyBaseAmount - loyaltyDiscountAmount);
  useEffect(() => {
    let active = true;
    if (!onQuotePromotion || !channelId || subtotal <= 0) { setPromotionQuote(null); return undefined; }
    const timer = window.setTimeout(async () => {
      try {
        const quote = await onQuotePromotion({ channel_id: Number(channelId), amount: Math.max(0, subtotal - manualDiscountAmount), customer_phone: customerPhone });
        if (active) setPromotionQuote(quote?.promotion ? quote : null);
      } catch { if (active) setPromotionQuote(null); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [channelId, customerPhone, manualDiscountAmount, onQuotePromotion, subtotal]);
  const estimatedLoyaltyPoints = loyaltyEarnEnabled && customerPhone.replace(/\D/g, '').length >= 9
    ? Math.floor(loyaltyEarnMode === "CUP" ? loyaltyCupCount / loyaltyCupsPerPoint : total / loyaltySpendPerPoint)
    : 0;
  const receivedAmount = Number(amountReceived || 0);
  const changeAmount = paymentMethod === "CASH" && receivedAmount >= total
    ? receivedAmount - total
    : 0;
  const splitPaidTotal = useMemo(
    () => paymentRows.reduce((sum, payment) => sum + Math.max(0, Number(payment.paid_amount) || 0), 0),
    [paymentRows],
  );
  const splitRemaining = Number((total - splitPaidTotal).toFixed(2));
  const splitCashInvalid = paymentRows.some((payment) => payment.payment_method === "CASH"
    && Number(payment.paid_amount || 0) > 0
    && Number(payment.amount_received || payment.paid_amount || 0) < Number(payment.paid_amount || 0));
  const updatePaymentRow = (index, field, value) => setPaymentRows((current) => current.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, [field]: value } : payment));
  const addPaymentRow = () => setPaymentRows((current) => current.length >= 5 ? current : [...current, { payment_method: "QR", paid_amount: "", amount_received: "" }]);
  const removePaymentRow = (index) => setPaymentRows((current) => current.length <= 1 ? current : current.filter((_, paymentIndex) => paymentIndex !== index));
  const enableSplitPayment = (enabled) => {
    setIsSplitPayment(enabled);
    if (enabled) {
      setPaymentRows([{ payment_method: paymentMethod, paid_amount: total ? total.toFixed(2) : "", amount_received: paymentMethod === "CASH" ? amountReceived : "" }]);
    }
  };
  const cartKeyFor = (product, modifiers = []) =>
    `${product.id}:${modifiers
      .map((modifier) => modifier.id)
      .sort((a, b) => a - b)
      .join("-") || "base"}`;
  const addConfiguredItem = (product, modifiers = []) => {
    const modifierAdjustment = modifiers.reduce(
      (sum, modifier) => sum + Number(modifier.price_adjustment || 0),
      0,
    );
    const cartKey = cartKeyFor(product, modifiers);
    setCart((current) => {
      const found = current.find((item) => item.cart_key === cartKey);
      return found
        ? current.map((item) =>
            item.cart_key === cartKey
              ? { ...item, qty: item.qty + 1 }
              : item,
          )
        : [
            ...current,
            {
              cart_key: cartKey,
              product_id: product.id,
              name: product.name,
              base_price: Number(product.price_retail || 0),
              counts_as_loyalty_cup: product.counts_as_loyalty_cup === true,
              price: Number(product.price_retail || 0) + modifierAdjustment,
              modifiers,
              modifier_groups: product.modifier_groups || [],
              qty: 1,
            },
        ];
    });
  };
  const addItem = (product) => {
    if (!product.channel_available || !menuAvailability(product).isAvailable) return;
    noteMenuUsed(product);
    setEditingCartKey(null);
    setPendingProduct(product);
  };
  const addBarcodeProduct = (event) => {
    event.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;
    const product = channelProducts.find((item) => String(item.barcode || "").trim() === barcode
      || String(item.id) === barcode);
    if (!product) {
      showMessage({ tone: "danger", title: "ไม่พบเมนู", message: "ไม่พบเมนูจากบาร์โค้ดหรือรหัสสินค้านี้" });
      return;
    }
    if (!menuAvailability(product).isAvailable) {
      showMessage({ tone: "danger", title: "เมนูยังขายไม่ได้", message: `${product.name}: ${menuAvailabilityLabel(product)}` });
      return;
    }
    setBarcodeInput("");
    addItem(product);
  };
  const editCartModifiers = (cartKey) => {
    const item = cart.find((row) => row.cart_key === cartKey);
    if (!item) return;
    const product = channelProducts.find((row) => String(row.id) === String(item.product_id)) || {
      id: item.product_id,
      name: item.name,
      price_retail: item.base_price,
      modifier_groups: item.modifier_groups || [],
    };
    if (!(product.modifier_groups || []).length) return;
    setCartOpen(false);
    setEditingCartKey(cartKey);
    setPendingProduct(product);
  };
  const replaceConfiguredItem = (previousCartKey, product, modifiers = []) => {
    const modifierAdjustment = modifiers.reduce(
      (sum, modifier) => sum + Number(modifier.price_adjustment || 0),
      0,
    );
    const nextCartKey = cartKeyFor(product, modifiers);
    setCart((current) => {
      const previous = current.find((item) => item.cart_key === previousCartKey);
      if (!previous) return current;
      const matching = current.find((item) => item.cart_key === nextCartKey);
      if (matching && nextCartKey !== previousCartKey) {
        return current
          .filter((item) => item.cart_key !== previousCartKey)
          .map((item) =>
            item.cart_key === nextCartKey
              ? { ...item, qty: Number(item.qty || 0) + Number(previous.qty || 0) }
              : item,
          );
      }
      return current.map((item) =>
        item.cart_key === previousCartKey
          ? {
              ...item,
              cart_key: nextCartKey,
              name: product.name,
              base_price: Number(product.price_retail || 0),
              counts_as_loyalty_cup: product.counts_as_loyalty_cup === true,
              price: Number(product.price_retail || 0) + modifierAdjustment,
              modifiers,
              modifier_groups: product.modifier_groups || [],
            }
          : item,
      );
    });
  };
  const changeQty = (cartKey, qty) =>
    setCart((current) =>
      current.map((item) =>
        item.cart_key === cartKey
          ? { ...item, qty: Math.max(1, Number(qty) || 1) }
          : item,
      ),
    );
  const applyCoupon = async () => {
    if (!couponCode.trim()) return;
    if (!onValidateCoupon) {
      setCouponError("ยังไม่สามารถตรวจสอบคูปองได้");
      return;
    }
    try {
      const coupon = await onValidateCoupon({
        code: couponCode.trim(),
        amount: Math.max(0, subtotal - manualDiscountAmount),
      });
      setAppliedCoupon(coupon);
      setCouponCode(coupon.code);
      setCouponError("");
    } catch (error) {
      setAppliedCoupon(null);
      setCouponError(error.response?.data?.error || error.message || "คูปองไม่สามารถใช้งานได้");
    }
  };
  const lookupLoyalty = async (rawPhone = customerPhone) => {
    const phone = String(rawPhone || "").replace(/\D/g, "");
    if (!phone) {
      setLoyaltyData(null);
      setLoyaltyPoints("");
      setLoyaltyError("");
      return null;
    }
    if (!onLookupLoyalty) return null;
    try {
      const data = await onLookupLoyalty(phone);
      setLoyaltyData(data || null);
      setLoyaltyPoints("");
      setLoyaltyError("");
      return data;
    } catch (error) {
      setLoyaltyData(null);
      setLoyaltyPoints("");
      setLoyaltyError(error.response?.data?.error || error.message || "ไม่พบข้อมูลสมาชิก");
      return null;
    }
  };
  const manageCashShift = () => setCashShiftDialog({
    mode: currentShift ? "close" : "open",
    shift: currentShift || null,
  });
  const saveCashShift = async ({ cash, note }) => {
    if (cashShiftDialog?.mode === "close" && cashShiftDialog.shift) {
      const closed = await onCloseCashShift?.(cashShiftDialog.shift.id, cash, note);
      if (closed) showMessage({ tone: "success", title: "ปิดกะเงินสดแล้ว", message: `ยอดคาดการณ์ ${money(closed.expected_cash)}\nยอดต่าง ${money(closed.difference_amount)}` });
      return closed;
    }
    const opened = await onOpenCashShift?.(cash, note);
    if (opened) showMessage({ tone: "success", title: "เปิดกะเงินสดแล้ว", message: `เงินทอนเริ่มกะ ${money(opened.opening_cash)}` });
    return opened;
  };
  const submit = async () => {
    if (!cart.length || isSubmitting) return;
    if (!isSplitPayment && paymentMethod === "CASH" && total > 0 && receivedAmount < total) {
      showMessage({
        tone: "danger",
        title: "ยังยืนยันออเดอร์ไม่ได้",
        message: "ยอดที่รับต้องไม่น้อยกว่ายอดสุทธิ",
      });
      return;
    }
    if (isSplitPayment && (Math.abs(splitRemaining) > 0.005 || splitCashInvalid)) {
      showMessage({ tone: "danger", title: "ยอดชำระยังไม่ครบ", message: splitCashInvalid ? "ตรวจสอบยอดเงินสดที่รับในแต่ละรายการ" : `ยอดชำระคงเหลือ ${money(Math.abs(splitRemaining))}` });
      return;
    }
    const channel = activeChannels.find(
      (item) => String(item.id) === String(channelId),
    );
    if (!channel) {
      showMessage({ tone: "danger", title: "ยังยืนยันออเดอร์ไม่ได้", message: "กรุณาเลือกช่องทางขายที่เปิดใช้งาน" });
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await onAdd({
        channel_id: Number(channelId),
        channel_name: channel?.name,
        total,
        customer_name: customerName.trim(),
        customer_nickname: customerName.trim(),
        customer_phone: customerPhone.trim(),
        manual_discount_amount: Number(manualDiscountAmount.toFixed(2)),
        coupon_code: appliedCoupon?.code || undefined,
        promotion_id: promotionQuote?.promotion?.id || undefined,
        loyalty_points_redeemed: loyaltyPointsRedeemed,
        table_id: tableId || undefined,
        payment_method: paymentMethod,
        amount_received: paymentMethod === "CASH" ? receivedAmount : undefined,
        payments: isSplitPayment ? paymentRows.map((payment) => ({
          payment_method: payment.payment_method,
          paid_amount: Number(payment.paid_amount) || 0,
          amount_received: payment.payment_method === "CASH" && payment.amount_received !== "" ? Number(payment.amount_received) : undefined,
        })) : undefined,
        items: cart.map(({ product_id, qty, price, base_price, modifiers }) => ({
          product_id,
          qty,
          price: Number(base_price ?? price),
          modifiers: (modifiers || []).map((modifier) => ({ option_id: modifier.id })),
        })),
      });
      if (saved) {
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setDiscountValue("");
        setDiscountType("amount");
        setCouponCode("");
        setAppliedCoupon(null);
        setPromotionQuote(null);
        setCouponError("");
        setPaymentMethod("CASH");
        setAmountReceived("");
        setIsSplitPayment(false);
        setPaymentRows([{ payment_method: "CASH", paid_amount: "", amount_received: "" }]);
        setTableId("");
        setLoyaltyPoints("");
        setLoyaltyData(null);
        setCartOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <div className="space-y-5">
      <div>
        <Heading
          title="บันทึกการขาย"
          description="เลือกช่องทางและเมนู แล้วส่งออเดอร์ได้ทันที"
          action={
            <button
              aria-label={`เปิดตะกร้าสินค้า มี ${cartItemCount} ชิ้น`}
              className="group relative inline-flex min-h-12 items-center gap-2 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-700 px-3.5 py-2.5 text-sm font-bold text-white shadow-lg shadow-sky-300/70 transition hover:-translate-y-0.5 hover:from-sky-600 hover:to-blue-800 focus:outline-none focus:ring-4 focus:ring-sky-200 active:translate-y-0"
              title="เปิดตะกร้าสินค้า"
              type="button"
              onClick={openCart}
            >
              <span className="relative grid h-8 w-8 place-items-center rounded-xl bg-white/20 text-lg" aria-hidden="true">
                🛒
                {cartItemCount ? <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full border-2 border-sky-600 bg-amber-300 px-1 text-[10px] font-black text-slate-900">{cartItemCount}</span> : null}
              </span>
              <span>ตะกร้า</span>
              <span className="hidden rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold sm:inline">{cartItemCount} ชิ้น</span>
              <span className="hidden border-l border-white/25 pl-2 text-xs font-semibold lg:inline">{money(subtotal)}</span>
            </button>
          }
        />
        <LowStockMenuAlert products={products} className="mb-5" />
        <Card className="!p-3 sm:!p-4">
          <fieldset>
            <legend className="mb-2 text-xs font-bold text-slate-700">
              ช่องทางการขาย
            </legend>
            <div className="flex flex-wrap gap-2">
              {activeChannels.map((channel) => {
                const selected = String(channel.id) === String(channelId);
                return (
                  <label
                    className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-within:ring-4 ${selected ? "border-sky-500 bg-sky-50 text-sky-800 focus-within:ring-sky-100" : "border-sky-100 bg-white text-slate-700 hover:border-sky-300 focus-within:ring-sky-100"}`}
                    key={channel.id}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="channel"
                      checked={selected}
                      onChange={() => selectChannel(channel.id)}
                    />
                    <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full border text-[10px] ${selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</span>
                    {channel.name}
                  </label>
                );
              })}
              {!activeChannels.length ? <p className="text-sm text-rose-600">ยังไม่มีช่องทางขายที่เปิดใช้งาน กรุณาให้ Admin เปิดหรือเพิ่มช่องทางขายก่อน</p> : null}
            </div>
          </fieldset>
        </Card>
        <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.42fr)]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">เมนูขาย</h2>
            <span className="text-sm text-slate-500">
              {visibleProducts.length} / {channelProducts.length} รายการ
            </span>
          </div>
          <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
            <input
              aria-label="ค้นหาเมนู"
              className={inputClass}
              value={menuSearch}
              onChange={(event) => setMenuSearch(event.target.value)}
              placeholder="ค้นหาชื่อเมนู หมวดหมู่ หรือบาร์โค้ด"
            />
            <form className="flex gap-2" onSubmit={addBarcodeProduct}>
              <input
                aria-label="สแกนบาร์โค้ดหรือกรอกรหัสสินค้า"
                className={inputClass}
                inputMode="text"
                value={barcodeInput}
                onChange={(event) => setBarcodeInput(event.target.value)}
                placeholder="สแกน / รหัสสินค้า"
              />
              <Button className="shrink-0" type="submit">เพิ่ม</Button>
            </form>
          </div>
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            <button
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition ${menuCategory === "ALL" ? "border-sky-600 bg-sky-600 text-white" : "border-sky-100 bg-white text-slate-600 hover:border-sky-300"}`}
              type="button"
              onClick={() => setMenuCategory("ALL")}
            >
              ทั้งหมด
            </button>
            {menuCategories.map((category) => (
              <button
                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition ${menuCategory === category ? "border-sky-600 bg-sky-600 text-white" : "border-sky-100 bg-white text-slate-600 hover:border-sky-300"}`}
                key={category}
                type="button"
                onClick={() => setMenuCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>
          {quickProducts.length ? (
            <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-2.5">
              <p className="mb-2 text-xs font-bold text-amber-900">เมนูที่กดบ่อย</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {quickProducts.map((product) => (
                  <button
                    className="flex min-w-36 shrink-0 items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-left text-xs font-bold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50"
                    key={product.id}
                    type="button"
                    onClick={() => addItem(product)}
                  >
                    <ProductVisual product={product} className="h-7 w-7" />
                    <span className="min-w-0"><span className="block truncate">{product.name}</span><span className="text-sky-700">{money(product.price_retail)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {favoriteProducts.length ? (
            <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 p-2.5">
              <p className="mb-2 text-xs font-bold text-violet-900">เมนูโปรด</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {favoriteProducts.map((product) => <button className="flex min-w-36 shrink-0 items-center gap-2 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-left text-xs font-bold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50" key={product.id} type="button" onClick={() => addItem(product)}><ProductVisual product={product} className="h-8 w-8" /><span className="min-w-0"><span className="block truncate">{product.name}</span><span className="text-sky-700">{money(product.price_retail)}</span></span></button>)}
              </div>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visibleProducts.map((product) => {
              const availability = menuAvailability(product);
              return (
                <div className="relative" key={product.id}>
                <button
                  className={`min-w-0 w-full rounded-xl border p-3 text-left transition focus:outline-none focus:ring-4 ${availability.isAvailable ? "border-sky-100 bg-sky-50/40 hover:border-sky-400 hover:bg-sky-50 focus:ring-sky-100" : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-65 focus:ring-slate-100"}`}
                  disabled={!availability.isAvailable}
                  onClick={() => addItem(product)}
                >
                  <ProductVisual product={product} className="h-12 w-12 shadow-sm" />
                  <p className="mt-2 truncate text-sm font-bold text-slate-800">
                    {product.name}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-sky-700">
                    {money(product.price_retail)}
                  </p>
                  <p className={`mt-1 truncate text-[11px] font-semibold ${availability.isAvailable ? "text-emerald-700" : "text-rose-600"}`}>
                    {menuAvailabilityLabel(product)}
                  </p>
                </button>
                <button aria-label={`${favoriteMenuIds.includes(String(product.id)) ? "ยกเลิกเมนูโปรด" : "เพิ่มเมนูโปรด"} ${product.name}`} className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg border text-sm ${favoriteMenuIds.includes(String(product.id)) ? "border-violet-300 bg-violet-100 text-violet-700" : "border-sky-100 bg-white text-slate-400 hover:text-violet-600"}`} type="button" onClick={() => toggleFavorite(product.id)}>★</button>
                </div>
              );
            })}
          </div>
          {!visibleProducts.length ? <Empty>ไม่พบเมนูที่ตรงกับการค้นหาหรือหมวดหมู่</Empty> : null}
        </Card>
        <aside className="xl:sticky xl:top-24">
          <Card className="overflow-hidden !p-0">
            <div className="flex items-center justify-between border-b border-sky-100 bg-sky-50/70 px-4 py-3">
              <div>
                <h2 className="font-bold text-slate-900">รายการที่เลือก</h2>
                <p className="text-xs text-slate-500">ตรวจสอบก่อนชำระเงิน</p>
              </div>
              <span className="rounded-full bg-sky-600 px-2.5 py-1 text-xs font-bold text-white">{cartItemCount} ชิ้น</span>
            </div>
            <div className="max-h-[42vh] space-y-2 overflow-y-auto p-3">
              {cart.length ? cart.map((item) => (
                <article className="rounded-xl border border-sky-100 bg-white p-2.5" key={item.cart_key}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{item.name}</p>
                      {item.modifiers?.length ? <p className="mt-0.5 truncate text-xs text-violet-700">{item.modifiers.map((modifier) => modifier.name).join(" · ")}</p> : null}
                    </div>
                    <strong className="shrink-0 text-sm text-sky-700">{money(Number(item.price) * Number(item.qty))}</strong>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-lg border border-sky-100 bg-sky-50">
                      <button aria-label={`ลดจำนวน ${item.name}`} className="h-7 w-7 text-sm font-bold text-sky-700 hover:bg-sky-100" type="button" onClick={() => item.qty <= 1 ? setCart((current) => current.filter((row) => row.cart_key !== item.cart_key)) : changeQty(item.cart_key, item.qty - 1)}>−</button>
                      <span className="min-w-7 text-center text-xs font-bold text-slate-700">{item.qty}</span>
                      <button aria-label={`เพิ่มจำนวน ${item.name}`} className="h-7 w-7 text-sm font-bold text-sky-700 hover:bg-sky-100" type="button" onClick={() => changeQty(item.cart_key, Number(item.qty) + 1)}>+</button>
                    </div>
                    <button className="text-xs font-bold text-rose-600 hover:text-rose-800" type="button" onClick={() => setCart((current) => current.filter((row) => row.cart_key !== item.cart_key))}>ลบ</button>
                  </div>
                </article>
              )) : <Empty>เลือกเมนูจากรายการด้านซ้าย</Empty>}
            </div>
            <div className="border-t border-sky-100 bg-white p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-slate-500">ยอดสินค้า</span>
                <strong className="text-lg text-sky-700">{money(subtotal)}</strong>
              </div>
              <Button className="mt-3 w-full" disabled={!cart.length} type="button" onClick={openCart}>
                ตรวจสอบและชำระเงิน
              </Button>
            </div>
          </Card>
        </aside>
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-100 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur xl:hidden">
        <Button className="w-full !py-3" disabled={!cart.length} type="button" onClick={openCart}>
          <span className="flex items-center justify-between gap-3"><span>🛒 ตะกร้า {cartItemCount} ชิ้น</span><strong>{money(subtotal)} · ตรวจสอบ</strong></span>
        </Button>
      </div>
      {cartOpen ? (
        <Modal label="ตะกร้าสินค้าและยืนยันออเดอร์" maxWidth="max-w-2xl" onClose={() => setCartOpen(false)}>
        <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">ตะกร้าสินค้า</h2>
            <div className="flex items-center gap-2"><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">{cart.length} รายการ</span>{cart.length ? <Button className="px-2.5 py-1.5 text-xs" type="button" variant="danger" onClick={() => { setCart([]); setCheckoutStep(1); }}>ล้างทั้งหมด</Button> : null}</div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-sky-50 p-1 text-center text-[11px] font-bold text-sky-700">
            <span className={`rounded-lg px-2 py-1.5 ${checkoutStep === 1 ? "bg-white shadow-sm" : ""}`}>1. รายการ</span>
            <span className={`rounded-lg px-2 py-1.5 ${checkoutStep === 2 ? "bg-white shadow-sm" : ""}`}>2. ส่วนลด/ลูกค้า</span>
            <span className={`rounded-lg px-2 py-1.5 ${checkoutStep === 3 ? "bg-white shadow-sm" : ""}`}>3. ชำระเงิน</span>
          </div>
          {checkoutStep === 1 ? <div className="my-4 max-h-[32vh] space-y-2 overflow-y-auto pr-1 sm:max-h-64">
            {cart.length ? (
              cart.map((item) => (
                <div
                  className="rounded-xl border border-sky-100 bg-sky-50/30 p-2.5"
                  key={item.cart_key}
                >
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">{item.name}</p>
                    <div className="inline-flex shrink-0 items-center rounded-lg border border-sky-100 bg-white">
                      <button aria-label={`ลดจำนวน ${item.name}`} className="h-7 w-7 font-bold text-sky-700 hover:bg-sky-50" type="button" onClick={() => item.qty <= 1 ? setCart((current) => current.filter((row) => row.cart_key !== item.cart_key)) : changeQty(item.cart_key, item.qty - 1)}>−</button>
                      <span className="min-w-6 text-center text-xs font-bold text-slate-700">{item.qty}</span>
                      <button aria-label={`เพิ่มจำนวน ${item.name}`} className="h-7 w-7 font-bold text-sky-700 hover:bg-sky-50" type="button" onClick={() => changeQty(item.cart_key, Number(item.qty) + 1)}>+</button>
                    </div>
                    <p className="shrink-0 text-sm font-bold text-sky-700">{money(Number(item.price) * Number(item.qty))}</p>
                    <button aria-label={`ลบ ${item.name}`} className="shrink-0 text-sm font-bold text-rose-600 hover:text-rose-800" type="button" onClick={() => setCart((current) => current.filter((row) => row.cart_key !== item.cart_key))}>×</button>
                  </div>
                  <div className="min-w-0">
                      {item.modifiers?.length ? (
                        <p className="mt-0.5 truncate text-xs text-violet-700">
                          {item.modifiers.map((modifier) => modifier.name).join(" · ")}
                        </p>
                      ) : null}
                      {(item.modifier_groups?.length || products.find((product) => String(product.id) === String(item.product_id))?.modifier_groups?.length) ? (
                        <button
                          className="mt-1 text-xs font-bold text-violet-700 hover:text-violet-900"
                          onClick={() => editCartModifiers(item.cart_key)}
                        >
                          ปรับความหวาน / ท็อปปิ้ง
                        </button>
                      ) : null}
                  </div>
                </div>
              ))
            ) : (
              <Empty>เลือกเมนูจากรายการด้านซ้าย</Empty>
            )}
          <div className="flex justify-end border-t border-sky-100 pt-3"><Button type="button" disabled={!cart.length} onClick={() => setCheckoutStep(2)}>ถัดไป: ส่วนลดและลูกค้า →</Button></div>
          </div> : null}
          {checkoutStep === 2 ? <div className="space-y-3 border-t border-sky-100 pt-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className={labelClass}>
                ชื่อลูกค้า <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                <input
                  className={inputClass}
                  autoComplete="name"
                  maxLength="120"
                  value={customerName}
                  onChange={(event) => setCustomerName(event.target.value)}
                  placeholder="เช่น นัท"
                />
              </label>
              <label className={labelClass}>
                เบอร์โทรศัพท์ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                <input
                  className={inputClass}
                  inputMode="tel"
                  autoComplete="tel"
                  maxLength="20"
                  value={customerPhone}
                  onChange={(event) => {
                    setCustomerPhone(event.target.value);
                    setLoyaltyData(null);
                    setLoyaltyPoints("");
                    setLoyaltyError("");
                  }}
                  onBlur={() => {
                    const digits = customerPhone.replace(/\D/g, "");
                    if (!digits || digits.length >= 9) lookupLoyalty();
                  }}
                  placeholder="เช่น 0812345678"
                />
              </label>
            </div>
            {diningTables.length ? (
              <label className={labelClass}>
                โต๊ะรับประทานที่ร้าน <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                <select className={inputClass} value={tableId} onChange={(event) => setTableId(event.target.value)}>
                  <option value="">ซื้อกลับ / ไม่ระบุโต๊ะ</option>
                  {diningTables.filter((table) => table.is_active !== false && table.status !== "DISABLED").map((table) => (
                    <option value={table.id} key={table.id}>
                      {table.display_name || table.table_code} · {table.status === "OCCUPIED" ? `มีบิลอยู่ ${table.order_count || 0} รายการ` : `ว่าง ${table.capacity} ที่นั่ง`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {customerPhone ? (
              <div className="rounded-xl border border-violet-100 bg-violet-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                    <p className="text-xs font-bold text-violet-800">คะแนนสะสม</p>
                    <p className="mt-0.5 text-xs text-violet-700">{loyaltyEnabled ? `${loyaltyEarnEnabled ? loyaltyEarnMode === "CUP" ? `ทุก ${loyaltyCupsPerPoint} แก้ว รับ 1 คะแนน` : `ทุก ${money(loyaltySpendPerPoint)} รับ 1 คะแนน` : "ไม่รับคะแนน"} · ${loyaltyRedeemEnabled ? `10 คะแนน ลดได้ ${money(loyaltyBahtPerPoint * 10)}` : "ไม่ใช้คะแนนเป็นส่วนลด"}` : "ระบบคะแนนสะสมปิดใช้งานอยู่"}</p>
                  </div>
                  {loyaltyEnabled ? <Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => lookupLoyalty()}>
                    ตรวจสอบคะแนนสะสม
                  </Button> : null}
                </div>
                {!loyaltyEnabled ? <p className="mt-2 text-xs text-violet-700">รายการนี้จะไม่สะสมหรือใช้คะแนน</p> : loyaltyData?.account ? (
                  <div className="mt-3">
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-700">คะแนนสะสมคงเหลือ <strong className="text-lg text-violet-700">{loyaltyBalance.toLocaleString()} คะแนน</strong></p>
                      <button className="text-xs font-bold text-violet-700 hover:text-violet-900 disabled:opacity-50" type="button" disabled={!loyaltyMaxPoints} onClick={() => setLoyaltyPoints(String(loyaltyMaxPoints))}>ตัดได้สูงสุด {loyaltyMaxPoints.toLocaleString()} คะแนน</button>
                    </div>
                    <label className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
                      ตัดคะแนนสะสมเพื่อเป็นส่วนลด
                      <input
                        className={inputClass}
                        type="number"
                        min="0"
                        max={loyaltyMaxPoints}
                        step="1"
                        inputMode="numeric"
                        value={loyaltyPoints}
                        onChange={(event) => setLoyaltyPoints(String(Math.min(loyaltyMaxPoints, Math.max(0, Math.floor(Number(event.target.value) || 0)))))}
                          placeholder={`ตัดได้สูงสุด ${loyaltyMaxPoints.toLocaleString()} คะแนน`}
                      />
                    </label>
                    {loyaltyPointsRedeemed ? <p className="mt-2 text-xs font-semibold text-violet-700">ตัด {loyaltyPointsRedeemed.toLocaleString()} คะแนน เป็นส่วนลด {money(loyaltyDiscountAmount)} · คงเหลือ {Math.max(0, loyaltyBalance - loyaltyPointsRedeemed).toLocaleString()} คะแนน</p> : <p className="mt-2 text-xs text-violet-700">ระบบจะตัดคะแนนเมื่อยืนยันคำสั่งซื้อเท่านั้น</p>}
                  </div>
                ) : loyaltyError ? (
                  <p className="mt-2 text-xs font-medium text-rose-600">{loyaltyError}</p>
                ) : (
                  <p className="mt-2 text-xs text-violet-700">เบอร์นี้ยังไม่มีแต้ม เมื่อชำระออเดอร์ ระบบจะเริ่มสร้างบัญชีสะสมแต้มให้</p>
                )}
                {estimatedLoyaltyPoints ? <p className="mt-2 text-xs font-semibold text-emerald-700">ออเดอร์นี้คาดว่าจะได้รับ {estimatedLoyaltyPoints} แต้ม</p> : null}
              </div>
            ) : null}
            <div className="rounded-xl bg-sky-50/70 p-3">
              <p className="text-xs font-bold text-sky-700">ส่วนลดทั้งตะกร้า</p>
              <div className="mt-2 grid grid-cols-[110px_minmax(0,1fr)] gap-2">
                <select
                  className={inputClass}
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value)}
                >
                  <option value="amount">ลดเป็นบาท</option>
                  <option value="percent">ลดเป็น %</option>
                </select>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  max={discountType === "percent" ? "100" : undefined}
                  step="0.01"
                  inputMode="decimal"
                  value={discountValue}
                  onChange={(event) => setDiscountValue(event.target.value)}
                  placeholder={discountType === "percent" ? "เช่น 10" : "เช่น 20"}
                />
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-white/75 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-700">คูปองส่วนลด</p>
                {appliedCoupon ? (
                  <button
                    className="text-xs font-semibold text-rose-600"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponError("");
                    }}
                  >
                    ล้างคูปอง
                  </button>
                ) : null}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  className={inputClass}
                  value={couponCode}
                  onChange={(event) => {
                    setCouponCode(event.target.value.toUpperCase());
                    setCouponError("");
                  }}
                  placeholder="เช่น WELCOME10"
                />
                <Button
                  className="shrink-0"
                  variant="secondary"
                  disabled={!cart.length || !couponCode.trim()}
                  onClick={applyCoupon}
                >
                  ใช้คูปอง
                </Button>
              </div>
              {appliedCoupon ? (
                <p className="mt-2 text-xs font-semibold text-emerald-700">
                  ใช้ {appliedCoupon.code} แล้ว · ลด {money(couponDiscountAmount)}
                </p>
              ) : null}
              {couponError ? <p className="mt-2 text-xs font-medium text-rose-600">{couponError}</p> : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-sky-100 pt-3"><Button type="button" variant="secondary" onClick={() => setCheckoutStep(1)}>← รายการ</Button><Button type="button" onClick={() => setCheckoutStep(3)}>ถัดไป: ชำระเงิน →</Button></div>
          </div> : null}
          {checkoutStep === 3 ? <div className="space-y-3 border-t border-sky-100 pt-4">
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-700">การชำระเงิน</p>
                <button className="text-xs font-semibold text-sky-700" onClick={manageCashShift}>
                  {currentShift ? "ปิดกะเงินสด" : "เปิดกะเงินสด"}
                </button>
              </div>
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700">
                <input className="accent-sky-600" type="checkbox" checked={isSplitPayment} onChange={(event) => enableSplitPayment(event.target.checked)} />
                แยกชำระหลายช่องทาง / หลายคน
              </label>
              {!isSplitPayment ? <>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {paymentOptions.map(([value, label]) => (
                  <label
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${paymentMethod === value ? "border-amber-500 bg-white text-amber-800" : "border-amber-100 bg-white/70 text-slate-600"}`}
                    key={value}
                  >
                    <input
                      className="accent-amber-600"
                      type="radio"
                      name="admin-payment"
                      checked={paymentMethod === value}
                      onChange={() => setPaymentMethod(value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {paymentMethod === "CASH" ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <label className="grid gap-1 text-xs font-medium text-slate-600">
                    รับเงินสด
                    <input
                      className={inputClass}
                      type="number"
                      min={total}
                      step="0.01"
                      inputMode="decimal"
                      value={amountReceived}
                      onChange={(event) => setAmountReceived(event.target.value)}
                      placeholder={total.toFixed(2)}
                    />
                  </label>
                  <div className="rounded-xl bg-white/80 p-3 text-xs">
                    <p className="text-slate-500">เงินทอน</p>
                    <strong className="mt-1 block text-lg text-emerald-700">{money(changeAmount)}</strong>
                  </div>
                </div>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                {paymentMethod === "CASH"
                  ? currentShift
                    ? `กะเปิดอยู่ · เงินทอนเริ่มกะ ${money(currentShift.opening_cash)}`
                    : "ยังไม่เปิดกะเงินสด · รับชำระและบันทึกออเดอร์ได้ตามปกติ"
                  : "การชำระเงินแบบนี้ไม่รวมในยอดเงินสดของกะ"}
              </p>
              </> : <div className="mt-3 space-y-2">
                {paymentRows.map((payment, index) => {
                  const paid = Math.max(0, Number(payment.paid_amount) || 0);
                  const received = Number(payment.amount_received || paid || 0);
                  const rowChange = payment.payment_method === "CASH" && received >= paid ? received - paid : 0;
                  return <div className="rounded-xl border border-amber-100 bg-white/80 p-2.5" key={index}>
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_30px]">
                      <select aria-label={`ช่องทางชำระรายการ ${index + 1}`} className={inputClass} value={payment.payment_method} onChange={(event) => updatePaymentRow(index, "payment_method", event.target.value)}>
                        {paymentOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                      <input aria-label={`ยอดชำระรายการ ${index + 1}`} className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" placeholder="ยอดชำระ" value={payment.paid_amount} onChange={(event) => updatePaymentRow(index, "paid_amount", event.target.value)} />
                      {payment.payment_method === "CASH" ? <input aria-label={`รับเงินสดรายการ ${index + 1}`} className={inputClass} type="number" min={paid} step="0.01" inputMode="decimal" placeholder="รับเงินสด" value={payment.amount_received} onChange={(event) => updatePaymentRow(index, "amount_received", event.target.value)} /> : <span className="flex items-center justify-center rounded-xl bg-slate-50 px-2 text-xs text-slate-500">ชำระแล้ว</span>}
                      <button aria-label={`ลบช่องทางชำระ ${index + 1}`} className="text-lg font-bold text-rose-600 disabled:text-slate-300" type="button" disabled={paymentRows.length === 1} onClick={() => removePaymentRow(index)}>×</button>
                    </div>
                    {payment.payment_method === "CASH" && paid > 0 ? <p className={`mt-1 text-[11px] font-semibold ${received < paid ? "text-rose-600" : "text-emerald-700"}`}>{received < paid ? "รับเงินสดไม่ครบ" : `เงินทอน ${money(rowChange)}`}</p> : null}
                  </div>;
                })}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" disabled={paymentRows.length >= 5} onClick={addPaymentRow}>+ เพิ่มช่องทาง</Button>
                  <strong className={Math.abs(splitRemaining) <= 0.005 ? "text-emerald-700" : "text-amber-700"}>{Math.abs(splitRemaining) <= 0.005 ? "ยอดชำระครบแล้ว" : `${splitRemaining > 0 ? "เหลือ" : "เกิน"} ${money(Math.abs(splitRemaining))}`}</strong>
                </div>
              </div>}
            </div>
            <div className="space-y-2 border-b border-sky-100 pb-4 text-sm">
              <div className="flex items-center justify-between text-slate-500">
                <span>ยอดก่อนลด</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-rose-600">
                <span>ส่วนลดหน้าร้าน</span>
                <span>-{money(manualDiscountAmount)}</span>
              </div>
              {promotionQuote?.promotion ? <div className="flex items-center justify-between text-fuchsia-700"><span>โปรโมชั่น {promotionQuote.promotion.name}</span><span>-{money(promotionDiscountAmount)}</span></div> : null}
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>คูปอง {appliedCoupon.code}</span>
                  <span>-{money(couponDiscountAmount)}</span>
                </div>
              ) : null}
              {loyaltyPointsRedeemed ? (
                <div className="flex items-center justify-between text-violet-700">
                  <span>ตัดคะแนนสะสม {loyaltyPointsRedeemed.toLocaleString()} คะแนน</span>
                  <span>-{money(loyaltyDiscountAmount)}</span>
                </div>
              ) : null}
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold text-slate-600">ยอดสุทธิ</span>
              <strong className="text-2xl text-sky-700">{money(total)}</strong>
            </div>
            {!isSplitPayment && paymentMethod === "CASH" && total > 0 && receivedAmount < total ? <p className="mb-2 text-xs font-semibold text-amber-700">กรอกยอดเงินสดที่รับอย่างน้อย {money(total)} ก่อนยืนยัน</p> : null}
            {isSplitPayment && Math.abs(splitRemaining) > 0.005 ? <p className="mb-2 text-xs font-semibold text-amber-700">ระบุยอดชำระรวมให้ครบ {money(total)}</p> : null}
            <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-sky-100 bg-white/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-5 sm:px-5"><Button className="shrink-0" type="button" variant="secondary" disabled={isSubmitting} onClick={() => setCheckoutStep(2)}>← ย้อนกลับ</Button><Button className="flex-1" disabled={!cart.length || isSubmitting} onClick={submit}>{isSubmitting ? "กำลังบันทึกออเดอร์..." : "ยืนยันออเดอร์"}</Button></div>
          </div> : null}
        </Card>
        </Modal>
      ) : null}
      {pendingProduct ? (
        <MenuModifierPicker
          key={`${pendingProduct.id}-${editingCartKey || "new"}`}
          product={pendingProduct}
          initialModifiers={editingCartKey ? cart.find((item) => item.cart_key === editingCartKey)?.modifiers || [] : []}
          actionLabel={editingCartKey ? "บันทึกการปรับแก้ว" : "เพิ่มลงตะกร้า"}
          onClose={() => {
            setPendingProduct(null);
            setEditingCartKey(null);
          }}
          onConfirm={(product, modifiers) => {
            if (editingCartKey) replaceConfiguredItem(editingCartKey, product, modifiers);
            else addConfiguredItem(product, modifiers);
            setPendingProduct(null);
            setEditingCartKey(null);
          }}
        />
      ) : null}
      {cashShiftDialog ? <CashShiftDialog mode={cashShiftDialog.mode} shift={cashShiftDialog.shift} onClose={() => setCashShiftDialog(null)} onSubmit={saveCashShift} /> : null}
    </div>
  );
}

function TableManagementPage({ tables = [], orders = [], onCreate, onUpdate, onRefresh, onSessionAction }) {
  const { showMessage } = useActionDialog();
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ table_code: "", display_name: "", capacity: "2", is_active: true });
  const [sessionAction, setSessionAction] = useState(null);
  const [targetTableId, setTargetTableId] = useState("");
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const openEditor = (table = null) => {
    setEditor(table || {});
    setForm(table ? { table_code: table.table_code, display_name: table.display_name || "", capacity: String(table.capacity || 2), is_active: table.is_active !== false } : { table_code: "", display_name: "", capacity: "2", is_active: true });
  };
  const saveTable = async (event) => {
    event.preventDefault();
    const saved = editor?.id ? await onUpdate?.(editor.id, form) : await onCreate?.(form);
    if (saved) {
      showMessage({ tone: "success", title: editor?.id ? "แก้ไขโต๊ะแล้ว" : "เพิ่มโต๊ะแล้ว", message: "โต๊ะพร้อมเลือกจากหน้า POS ทันที" });
      setEditor(null);
    }
  };
  const openAction = (table, action) => {
    setSessionAction({ table, action });
    setTargetTableId("");
    setSelectedOrderIds([]);
  };
  const executeAction = async () => {
    if (!sessionAction) return;
    const { table, action } = sessionAction;
    if (action === "release") {
      const saved = await onSessionAction?.(table.id, "release");
      if (saved) setSessionAction(null);
      return;
    }
    if (!targetTableId) {
      showMessage({ tone: "danger", title: "เลือกโต๊ะปลายทาง", message: "กรุณาเลือกโต๊ะที่จะรับบิลก่อนดำเนินการ" });
      return;
    }
    if (action === "split" && !selectedOrderIds.length) {
      showMessage({ tone: "danger", title: "ยังไม่ได้เลือกออเดอร์", message: "เลือกอย่างน้อยหนึ่งออเดอร์ที่ต้องการแยกไปโต๊ะใหม่" });
      return;
    }
    const saved = await onSessionAction?.(table.id, action, { target_table_id: Number(targetTableId), order_ids: selectedOrderIds });
    if (saved) setSessionAction(null);
  };
  const sourceOrders = useMemo(() => sessionAction?.table?.session_id
    ? orders.filter((order) => String(order.dining_session_id) === String(sessionAction.table.session_id))
    : [], [orders, sessionAction]);
  const actionLabel = { release: "ปิดโต๊ะ", move: "ย้ายโต๊ะ", merge: "รวมโต๊ะ", split: "แยกโต๊ะ" };
  return <div className="mx-auto max-w-6xl space-y-5">
    <Heading title="จัดการโต๊ะและบิลกินที่ร้าน" description="เปิดบิลตามโต๊ะ ย้าย รวม หรือแยกออเดอร์ก่อนส่งชำระเงิน" action={<Button type="button" onClick={() => openEditor()}>+ เพิ่มโต๊ะ</Button>} />
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {tables.map((table) => {
        const status = table.status === "OCCUPIED" ? "ใช้งาน" : table.status === "DISABLED" ? "ปิดใช้" : "ว่าง";
        const statusClass = table.status === "OCCUPIED" ? "bg-amber-100 text-amber-800" : table.status === "DISABLED" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800";
        return <Card className="!p-4" key={table.id}><div className="flex items-start justify-between gap-2"><div><p className="text-lg font-black text-slate-900">{table.display_name || table.table_code}</p><p className="text-xs text-slate-500">รหัส {table.table_code} · {table.capacity} ที่นั่ง</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-bold ${statusClass}`}>{status}</span></div>{table.status === "OCCUPIED" ? <p className="mt-3 text-sm font-semibold text-sky-700">บิลเปิดอยู่ {table.order_count || 0} รายการ</p> : <p className="mt-3 text-sm text-slate-500">พร้อมรับบิลใหม่</p>}<div className="mt-4 flex flex-wrap gap-2"><Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => openEditor(table)}>แก้ไข</Button>{table.status === "OCCUPIED" ? <><Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => openAction(table, "move")}>ย้าย</Button><Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => openAction(table, "merge")}>รวม</Button><Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => openAction(table, "split")}>แยก</Button><Button className="px-2.5 py-1.5 text-xs" type="button" variant="danger" onClick={() => openAction(table, "release")}>ปิดโต๊ะ</Button></> : null}</div></Card>;
      })}
    </div>
    {!tables.length ? <Empty>ยังไม่มีโต๊ะ กรุณาเพิ่มหมายเลขโต๊ะก่อนเปิดบิลกินที่ร้าน</Empty> : null}
    {editor ? <Modal label={editor.id ? "แก้ไขโต๊ะ" : "เพิ่มโต๊ะ"} maxWidth="max-w-lg" onClose={() => setEditor(null)}><form className="space-y-4" onSubmit={saveTable}><label className={labelClass}>รหัสโต๊ะ<input className={inputClass} value={form.table_code} maxLength="32" required onChange={(event) => setForm((current) => ({ ...current, table_code: event.target.value.toUpperCase() }))} placeholder="เช่น T01" /></label><label className={labelClass}>ชื่อแสดง<input className={inputClass} value={form.display_name} maxLength="100" onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} placeholder="เช่น โต๊ะริมหน้าต่าง" /></label><label className={labelClass}>จำนวนที่นั่ง<input className={inputClass} type="number" min="1" max="100" value={form.capacity} required onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))} /></label><label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input className="accent-sky-600" type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />เปิดใช้งานโต๊ะนี้</label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setEditor(null)}>ยกเลิก</Button><Button type="submit">บันทึก</Button></div></form></Modal> : null}
    {sessionAction ? <Modal label={actionLabel[sessionAction.action]} maxWidth="max-w-lg" onClose={() => setSessionAction(null)}><div className="space-y-4"><p className="text-sm text-slate-600">โต๊ะต้นทาง: <strong>{sessionAction.table.display_name || sessionAction.table.table_code}</strong></p>{sessionAction.action !== "release" ? <label className={labelClass}>โต๊ะปลายทาง<select className={inputClass} value={targetTableId} onChange={(event) => setTargetTableId(event.target.value)}><option value="">เลือกโต๊ะ</option>{tables.filter((table) => String(table.id) !== String(sessionAction.table.id) && table.is_active !== false && table.status !== "DISABLED").map((table) => <option value={table.id} key={table.id}>{table.display_name || table.table_code} · {table.status === "OCCUPIED" ? "มีบิลอยู่" : "ว่าง"}</option>)}</select></label> : <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">ปิดโต๊ะได้เมื่อไม่มีออเดอร์กำลังทำหรือพร้อมรับ</p>}{sessionAction.action === "split" ? <div className="rounded-xl border border-sky-100 p-3"><p className="mb-2 text-xs font-bold text-slate-700">เลือกออเดอร์ที่จะย้าย</p><div className="max-h-48 space-y-2 overflow-y-auto">{sourceOrders.map((order) => <label className="flex items-center gap-2 text-sm text-slate-700" key={order.id}><input className="accent-sky-600" type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={(event) => setSelectedOrderIds((current) => event.target.checked ? [...current, order.id] : current.filter((id) => id !== order.id))} />#{order.order_no} · คิว {order.queue_no || "-"}</label>)}{!sourceOrders.length ? <p className="text-sm text-slate-500">ยังไม่พบออเดอร์ในบิลนี้</p> : null}</div></div> : null}<div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setSessionAction(null)}>ยกเลิก</Button><Button type="button" variant={sessionAction.action === "release" ? "danger" : "primary"} onClick={executeAction}>{actionLabel[sessionAction.action]}</Button></div></div></Modal> : null}
  </div>;
}

function StockReceivingPanel({ rows, suppliers, receipts, onCreateSupplier, onCreateReceipt, onClose }) {
  const emptyLine = () => ({ ingredient_id: "", quantity: "", unit_cost: "", lot_no: "", expiry_date: "" });
  const [supplierId, setSupplierId] = useState("");
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [note, setNote] = useState("");
  const [receiptItems, setReceiptItems] = useState([emptyLine()]);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", contact_name: "", phone: "" });
  const total = receiptItems.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_cost) || 0),
    0,
  );
  const updateItem = (index, field, value) => {
    setReceiptItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field !== "ingredient_id") return { ...item, [field]: value };
      const ingredient = rows.find((row) => String(row.id) === String(value));
      return {
        ...item,
        ingredient_id: value,
        unit_cost: ingredient ? String(ingredient.cost_per_unit ?? "") : item.unit_cost,
      };
    }));
  };
  const submitSupplier = async (event) => {
    event.preventDefault();
    const saved = await onCreateSupplier?.(supplierForm);
    if (!saved) return;
    setSupplierId(String(saved.id));
    setSupplierForm({ name: "", contact_name: "", phone: "" });
    setShowSupplierModal(false);
  };
  const submitReceipt = async (event) => {
    event.preventDefault();
    const saved = await onCreateReceipt?.({
      supplier_id: supplierId || undefined,
      received_at: receivedAt,
      note,
      items: receiptItems,
    });
    if (!saved) return;
    setReceivedAt(localDateTimeValue());
    setNote("");
    setReceiptItems([emptyLine()]);
    onClose?.();
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">รับวัตถุดิบเข้าคลัง</h2>
          <p className="mt-1 text-sm text-slate-500">บันทึกผู้ขาย จำนวน ต้นทุน และปรับต้นทุนเฉลี่ยให้อัตโนมัติ</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700">รวม {money(total)}</span>
      </div>
      <form className="mt-5 grid gap-4" onSubmit={submitReceipt}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            ผู้ขาย <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <select className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">ไม่ระบุผู้ขาย</option>
              {suppliers.filter((supplier) => supplier.is_active !== false).map((supplier) => (
                <option value={supplier.id} key={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            วันเวลารับของ
            <input className={inputClass} type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
          </label>
          <label className={labelClass}>
            หมายเหตุ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <input className={inputClass} value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="เช่น ใบส่งของ #A-102" />
          </label>
        </div>
        <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/40 p-3 sm:p-4">
          <div className="hidden grid-cols-[minmax(0,1fr)_100px_115px_130px_145px_40px] gap-2 px-1 text-xs font-bold text-slate-500 xl:grid">
            <span>วัตถุดิบ</span><span>จำนวน</span><span>ต้นทุน/หน่วย</span><span>เลขล็อต</span><span>วันหมดอายุ</span><span />
          </div>
          {receiptItems.map((item, index) => {
            const ingredient = rows.find((row) => String(row.id) === String(item.ingredient_id));
            return (
              <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_100px_115px_130px_145px_40px]" key={index}>
                <label className={labelClass}>
                  <span className="xl:hidden">วัตถุดิบ</span>
                  <select className={inputClass} value={item.ingredient_id} onChange={(event) => updateItem(index, "ingredient_id", event.target.value)} required>
                    <option value="">เลือกวัตถุดิบ</option>
                    {rows.map((row) => <option key={row.id} value={row.id}>{row.name} · เหลือ {row.stock_qty} {row.unit}</option>)}
                  </select>
                </label>
                <label className={labelClass}>
                  <span className="xl:hidden">จำนวน</span>
                  <input className={inputClass} type="number" min="0.001" step="0.001" inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} placeholder={ingredient?.unit || "จำนวน"} required />
                </label>
                <label className={labelClass}>
                  <span className="xl:hidden">ต้นทุนต่อหน่วย</span>
                  <input className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" value={item.unit_cost} onChange={(event) => updateItem(index, "unit_cost", event.target.value)} placeholder="0.00" required />
                </label>
                <label className={labelClass}>
                  <span className="xl:hidden">เลขล็อต</span>
                  <input className={inputClass} value={item.lot_no} maxLength="100" onChange={(event) => updateItem(index, "lot_no", event.target.value)} placeholder="เช่น MILK-260902" />
                </label>
                <label className={labelClass}>
                  <span className="xl:hidden">วันหมดอายุ</span>
                  <input className={inputClass} type="date" value={item.expiry_date} onChange={(event) => updateItem(index, "expiry_date", event.target.value)} />
                </label>
                <Button type="button" className="self-end px-2" variant="danger" disabled={receiptItems.length === 1} onClick={() => setReceiptItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</Button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setReceiptItems((current) => [...current, emptyLine()])}>+ เพิ่มรายการ</Button>
            <Button type="submit" disabled={!rows.length}>บันทึกรับเข้าสต็อก</Button>
          </div>
        </div>
      </form>
      <div className="mt-4 border-t border-sky-100 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-800">ผู้ขาย</p>
          <Button className="text-xs" type="button" variant="secondary" onClick={() => setShowSupplierModal(true)}>+ เพิ่มผู้ขาย</Button>
        </div>
        {suppliers.length ? <p className="mt-2 text-xs text-slate-500">{suppliers.filter((supplier) => supplier.is_active !== false).map((supplier) => supplier.name).join(" · ")}</p> : <p className="mt-2 text-xs text-slate-500">ยังไม่มีข้อมูลผู้ขาย</p>}
      </div>
      <div className="mt-4 border-t border-sky-100 pt-4">
        <p className="text-sm font-bold text-slate-800">ประวัติรับของล่าสุด</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {receipts.slice(0, 6).map((receipt) => (
            <div className="rounded-xl border border-sky-100 bg-white p-3" key={receipt.id}>
              <p className="font-bold text-slate-800">{receipt.receipt_no}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{receipt.supplier_name || "ไม่ระบุผู้ขาย"}</p>
              <p className="mt-1 text-sm font-bold text-sky-700">{money(receipt.total_amount)}</p>
              {(receipt.items || []).some((item) => item.expiry_date) ? <p className="mt-1 text-xs text-amber-700">มีล็อตระบุวันหมดอายุ</p> : null}
            </div>
          ))}
          {!receipts.length ? <p className="text-sm text-slate-500">ยังไม่มีประวัติการรับของ</p> : null}
        </div>
      </div>
      {showSupplierModal ? (
        <Modal label="เพิ่มผู้ขาย" maxWidth="max-w-xl" onClose={() => setShowSupplierModal(false)}>
          <Card className="border-sky-200 bg-white">
            <h2 className="text-lg font-bold text-slate-900">เพิ่มผู้ขาย</h2>
            <p className="mt-1 text-sm text-slate-500">บันทึกข้อมูลผู้ขายเพื่อเลือกใช้ในใบรับของครั้งถัดไป</p>
            <form className="mt-5 grid gap-3" onSubmit={submitSupplier}>
              <label className={labelClass}>ชื่อผู้ขาย<input className={inputClass} value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} placeholder="ชื่อผู้ขาย" required /></label>
              <label className={labelClass}>ผู้ติดต่อ<input className={inputClass} value={supplierForm.contact_name} onChange={(event) => setSupplierForm((current) => ({ ...current, contact_name: event.target.value }))} placeholder="ผู้ติดต่อ" /></label>
              <label className={labelClass}>เบอร์โทร<input className={inputClass} value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} placeholder="เบอร์โทร" /></label>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setShowSupplierModal(false)}>ยกเลิก</Button><Button type="submit">บันทึกผู้ขาย</Button></div>
            </form>
          </Card>
        </Modal>
      ) : null}
    </Card>
  );
}

function InventoryAdjustmentPanel({ item, onSubmit, onClose }) {
  const [adjustmentType, setAdjustmentType] = useState("STOCK_COUNT");
  const [actualQuantity, setActualQuantity] = useState(String(item.stock_qty ?? item.stock ?? 0));
  const [wasteQuantity, setWasteQuantity] = useState("");
  const [note, setNote] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    const saved = await onSubmit?.({
      ingredient_id: item.id,
      adjustment_type: adjustmentType,
      actual_quantity: adjustmentType === "STOCK_COUNT" ? actualQuantity : undefined,
      waste_quantity: adjustmentType === "WASTE" ? wasteQuantity : undefined,
      note,
    });
    if (saved) onClose();
  };
  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">ตรวจนับ / บันทึกของเสีย: {item.name}</h2>
          <p className="mt-1 text-sm text-slate-500">ยอดในระบบ {Number(item.stock_qty ?? item.stock ?? 0)} {item.unit || "หน่วย"}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}>ปิด</Button>
      </div>
      <form className="mt-5 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end" onSubmit={submit}>
        <label className={labelClass}>
          รูปแบบ
          <select className={inputClass} value={adjustmentType} onChange={(event) => setAdjustmentType(event.target.value)}>
            <option value="STOCK_COUNT">ตรวจนับยอดจริง</option>
            <option value="WASTE">ของเสีย / ทิ้ง</option>
          </select>
        </label>
        {adjustmentType === "STOCK_COUNT" ? (
          <label className={labelClass}>
            ยอดที่นับได้จริง ({item.unit || "หน่วย"})
            <input className={inputClass} type="number" min="0" step="0.001" inputMode="decimal" value={actualQuantity} onChange={(event) => setActualQuantity(event.target.value)} required />
          </label>
        ) : (
          <label className={labelClass}>
            จำนวนของเสีย ({item.unit || "หน่วย"})
            <input className={inputClass} type="number" min="0.001" step="0.001" inputMode="decimal" value={wasteQuantity} onChange={(event) => setWasteQuantity(event.target.value)} required />
          </label>
        )}
        <Button type="submit">บันทึกยอด</Button>
        <label className={`${labelClass} sm:col-span-3`}>
          {adjustmentType === "WASTE" ? "เหตุผลของของเสีย" : "หมายเหตุการตรวจนับ"}
          <input className={inputClass} maxLength="1000" value={note} onChange={(event) => setNote(event.target.value)} placeholder={adjustmentType === "WASTE" ? "เช่น หมดอายุ / เสียหาย" : "เช่น ตรวจนับประจำวัน"} required={adjustmentType === "WASTE"} />
        </label>
      </form>
    </Card>
  );
}

function InventoryLotsPanel({ item, lots, onClose }) {
  const itemLots = lots.filter((lot) => String(lot.ingredient_id) === String(item.id) && Number(lot.remaining_quantity || 0) > 0);
  return (
    <Card className="border-violet-200 bg-violet-50/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">ล็อตคงเหลือ: {item.name}</h2>
          <p className="mt-1 text-sm text-slate-500">ระบบจะตัดล็อตที่หมดอายุก่อนโดยอัตโนมัติ</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}>ปิด</Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {itemLots.length ? itemLots.map((lot) => {
          const expiry = expiryState(lot.expiry_date);
          return (
            <article className={`rounded-2xl border bg-white p-4 ${expiry?.tone === "rose" ? "border-rose-200" : expiry?.tone === "amber" ? "border-amber-200" : "border-violet-100"}`} key={lot.id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-slate-800">{lot.lot_no || `ล็อต #${lot.id}`}</p>
                <span className="rounded-full bg-violet-50 px-2 py-1 text-xs font-bold text-violet-700">เหลือ {Number(lot.remaining_quantity)} {item.unit}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">รับเข้า {String(lot.received_at || "").slice(0, 10)}</p>
              <p className={`mt-1 text-xs font-bold ${expiry?.tone === "rose" ? "text-rose-700" : expiry?.tone === "amber" ? "text-amber-700" : "text-slate-600"}`}>
                {lot.expiry_date ? `${String(lot.expiry_date).slice(0, 10)} · ${expiry?.label || "ยังไม่ใกล้หมดอายุ"}` : "ไม่ได้ระบุวันหมดอายุ"}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-700">ต้นทุน {money(lot.unit_cost)} / {item.unit}</p>
              {lot.supplier_name ? <p className="mt-1 text-xs text-slate-500">ผู้ขาย: {lot.supplier_name}</p> : null}
            </article>
          );
        }) : <Empty>ยังไม่มีล็อตคงเหลือสำหรับวัตถุดิบนี้</Empty>}
      </div>
    </Card>
  );
}

function IngredientsPage({ rows, suppliers, receipts, lots, onCreate, onUpdate, onDelete, onRestock, onAdjust, onCreateSupplier, onCreateReceipt }) {
  const initial = {
    name: "",
    unit: "",
    stock_qty: "",
    cost_per_unit: "",
    min_stock_alert: "",
    expiry_date: "",
  };
  const [form, setForm] = useState(initial);
  const [editingId, setEditingId] = useState(null);
  const [ingredientModalOpen, setIngredientModalOpen] = useState(false);
  const [receivingOpen, setReceivingOpen] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [viewingLotsItem, setViewingLotsItem] = useState(null);
  const save = async (event) => {
    event.preventDefault();
    const saved = editingId
      ? await onUpdate(editingId, form)
      : await onCreate(form);
    if (saved) {
      showMessage({
        tone: "success",
        title: editingId ? "บันทึกวัตถุดิบแล้ว" : "เพิ่มวัตถุดิบแล้ว",
        message: editingId ? "ยอดคงเหลือและจุดแจ้งเตือนถูกอัปเดตแล้ว" : "รายการนี้แสดงในคลังและใช้สร้างสูตรเมนูได้ทันที",
      });
      setForm(initial);
      setEditingId(null);
      setIngredientModalOpen(false);
    }
  };
  const edit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      unit: item.unit || "",
      stock_qty: item.stock_qty ?? item.stock ?? "",
      cost_per_unit: item.cost_per_unit || "",
      min_stock_alert: item.min_stock_alert || "",
      expiry_date: String(item.expiry_date || "").slice(0, 10),
    });
    setIngredientModalOpen(true);
  };
  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  return (
    <div className="space-y-5">
      <Heading
        title="จัดการวัตถุดิบ"
        description="เพิ่ม แก้ไข และติดตามสต็อกวัตถุดิบ"
        action={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => exportInventory(rows)}>
              ↓ Export Excel
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setForm(initial);
                setEditingId(null);
                setIngredientModalOpen(true);
              }}
            >
              + เพิ่มวัตถุดิบ
            </Button>
          </div>
        }
      />
      <Card className="border-sky-200 bg-sky-50/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">รับวัตถุดิบเข้าคลัง</h2>
            <p className="mt-1 text-sm text-slate-500">บันทึกผู้ขาย จำนวน ต้นทุน และเลขล็อตในหน้าต่างแยก</p>
          </div>
          <Button type="button" onClick={() => setReceivingOpen(true)}>+ รับวัตถุดิบเข้าคลัง</Button>
        </div>
      </Card>
      {receivingOpen ? (
        <Modal label="รับวัตถุดิบเข้าคลัง" maxWidth="max-w-6xl" onClose={() => setReceivingOpen(false)}>
          <StockReceivingPanel
            rows={rows}
            suppliers={suppliers}
            receipts={receipts}
            onCreateSupplier={onCreateSupplier}
            onCreateReceipt={onCreateReceipt}
            onClose={() => setReceivingOpen(false)}
          />
        </Modal>
      ) : null}
      {adjustingItem ? (
        <Modal label="ตรวจนับหรือบันทึกของเสีย" maxWidth="max-w-3xl" onClose={() => setAdjustingItem(null)}>
          <InventoryAdjustmentPanel
            key={adjustingItem.id}
            item={adjustingItem}
            onSubmit={onAdjust}
            onClose={() => setAdjustingItem(null)}
          />
        </Modal>
      ) : null}
      {viewingLotsItem ? (
        <Modal label="ล็อตวัตถุดิบ" maxWidth="max-w-5xl" onClose={() => setViewingLotsItem(null)}>
          <InventoryLotsPanel
            key={viewingLotsItem.id}
            item={viewingLotsItem}
            lots={lots}
            onClose={() => setViewingLotsItem(null)}
          />
        </Modal>
      ) : null}
      <div className="grid gap-5">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">รายการวัตถุดิบ</h2>
            <span className="text-sm text-slate-500">{rows.length} รายการ</span>
          </div>
          <div className="space-y-3">
            {rows.length ? (
              rows.map((item) => {
                const qty = Number(item.stock_qty ?? item.stock ?? 0);
                const low =
                  item.is_low_stock ||
                  item.level === "low" ||
                  (item.min_stock_alert && qty <= Number(item.min_stock_alert));
                const activeLots = lots.filter((lot) => String(lot.ingredient_id) === String(item.id) && Number(lot.remaining_quantity || 0) > 0);
                const nextLotExpiry = activeLots
                  .map((lot) => lot.expiry_date)
                  .filter(Boolean)
                  .sort()[0];
                const expiry = expiryState(nextLotExpiry || item.next_expiry_date || item.expiry_date);
                return (
                  <article
                    className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${expiry?.tone === "rose" ? "border-rose-200 bg-rose-50/30" : expiry?.tone === "amber" ? "border-amber-200 bg-amber-50/30" : "border-sky-100"}`}
                    key={item.id || item.code}
                  >
                    <span
                      className={`h-3 w-3 rounded-full ${expiry?.tone === "rose" ? "bg-rose-500" : low || expiry ? "bg-amber-400" : "bg-emerald-400"}`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-800">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        คงเหลือ {qty} {item.unit || "หน่วย"}
                        {(nextLotExpiry || item.next_expiry_date || item.expiry_date) &&
                          ` · หมดอายุ ${String(nextLotExpiry || item.next_expiry_date || item.expiry_date).slice(0, 10)}`}
                      </p>
                      {activeLots.length ? <p className="mt-1 text-xs font-semibold text-violet-700">{activeLots.length} ล็อตคงเหลือ</p> : null}
                      {expiry ? <p className={`mt-1 text-xs font-bold ${expiry.tone === "rose" ? "text-rose-700" : "text-amber-700"}`}>{expiry.label}</p> : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => onRestock(item)}
                      >
                        เติมสต็อก
                      </Button>
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => setAdjustingItem(item)}
                      >
                        ตรวจนับ / ของเสีย
                      </Button>
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => setViewingLotsItem(item)}
                      >
                        ดูล็อต
                      </Button>
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => edit(item)}
                      >
                        แก้ไข
                      </Button>
                      <Button
                        className="text-xs"
                        variant="danger"
                        onClick={() => onDelete(item)}
                      >
                        ลบ
                      </Button>
                    </div>
                  </article>
                );
              })
            ) : (
              <Empty>ยังไม่มีวัตถุดิบ</Empty>
            )}
          </div>
        </Card>
        {ingredientModalOpen ? (
        <Modal label={editingId ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"} maxWidth="max-w-xl" onClose={() => { setForm(initial); setEditingId(null); setIngredientModalOpen(false); }}>
        <aside>
          <Card>
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              กรอกข้อมูลให้ครบเพื่อบันทึกเข้าคลัง
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500"><RequiredMark /> ช่องจำเป็นต้องกรอกก่อนบันทึก</p>
            <form className="mt-5 grid gap-4" onSubmit={save}>
              <FormSection title="ข้อมูลวัตถุดิบ" description="ชื่อ หน่วยนับ และยอดเริ่มต้นสำหรับติดตามในคลัง">
              <label className={labelClass}>
                ชื่อวัตถุดิบ <RequiredMark />
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={updateField("name")}
                  placeholder="เช่น นมสด"
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                <label className={labelClass}>
                  หน่วยนับ <RequiredMark />
                  <input
                    className={inputClass}
                    value={form.unit}
                    onChange={updateField("unit")}
                    placeholder="เช่น ขวด"
                    required
                  />
                </label>
                <label className={labelClass}>
                  จำนวนคงเหลือ <RequiredMark />
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    value={form.stock_qty}
                    onChange={updateField("stock_qty")}
                    required
                  />
                </label>
                <label className={labelClass}>
                  ต้นทุนต่อหน่วย
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.cost_per_unit}
                    onChange={updateField("cost_per_unit")}
                  />
                </label>
                <label className={labelClass}>
                  แจ้งเตือนเมื่อเหลือ
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    value={form.min_stock_alert}
                    onChange={updateField("min_stock_alert")}
                  />
                </label>
              </div>
              <label className={labelClass}>
                วันหมดอายุ
                <input
                  className={inputClass}
                  type="date"
                  value={form.expiry_date}
                  onChange={updateField("expiry_date")}
                />
              </label>
              </FormSection>
              <div className="flex gap-2">
                <Button className="flex-1" type="submit">
                  {editingId ? "บันทึกการแก้ไข" : "เพิ่มวัตถุดิบ"}
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setForm(initial);
                      setEditingId(null);
                      setIngredientModalOpen(false);
                    }}
                  >
                    ยกเลิก
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </aside>
        </Modal>
        ) : null}
      </div>
    </div>
  );
}

function MenusPage({ products, ingredients, channels, onCreate, onUpdate, onDelete, onSetAvailability }) {
  const { showMessage } = useActionDialog();
  const initial = {
    name: "",
    category: "",
    barcode: "",
    image_url: "",
    image_data: "",
    price_retail: "",
    price_wholesale: "",
    production_station: "BAR",
    prep_minutes: "5",
    counts_as_loyalty_cup: false,
    recipe: [],
    modifiers: [],
    channel_settings: [],
  };
  const [form, setForm] = useState(initial);
  const [editingId, setEditingId] = useState(null);
  const [menuModalOpen, setMenuModalOpen] = useState(false);
  const [selectedMenuIds, setSelectedMenuIds] = useState([]);
  const selectedMenus = products.filter((product) => selectedMenuIds.includes(String(product.id)));
  const allMenusSelected = products.length > 0 && selectedMenus.length === products.length;
  const toggleMenuSelection = (productId) => setSelectedMenuIds((current) => {
    const id = String(productId);
    return current.includes(id) ? current.filter((value) => value !== id) : [...current, id];
  });
  const setAllMenuSelection = (selected) => setSelectedMenuIds(selected ? products.map((product) => String(product.id)) : []);
  const updateSelectedAvailability = async (isSoldOut) => {
    if (!selectedMenus.length) return;
    await Promise.all(selectedMenus.map((product) => onSetAvailability(product, isSoldOut)));
    setSelectedMenuIds([]);
  };
  const selectMenuImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const imageData = await compressMenuImage(file);
      setForm((current) => ({ ...current, image_data: imageData, image_url: "" }));
    } catch (error) {
      showMessage({ tone: "danger", title: "ใช้รูปเมนูไม่ได้", message: error.message });
    }
  };
  const addRecipe = () =>
    setForm((current) => ({
      ...current,
      recipe: [
        ...current.recipe,
        { ingredient_id: ingredients[0]?.id || "", quantity_used: 1 },
      ],
    }));
  const updateRecipe = (index, field, value) =>
    setForm((current) => ({
      ...current,
      recipe: current.recipe.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  const addModifierGroup = () =>
    setForm((current) => ({
      ...current,
      modifiers: [
        ...current.modifiers,
        {
          name: "",
          min_selection: 0,
          max_selection: 1,
          options: [{ name: "", price_adjustment: 0 }],
        },
      ],
    }));
  const updateModifierGroup = (groupIndex, field, value) =>
    setForm((current) => ({
      ...current,
      modifiers: current.modifiers.map((group, index) =>
        index === groupIndex ? { ...group, [field]: value } : group,
      ),
    }));
  const updateModifierOption = (groupIndex, optionIndex, field, value) =>
    setForm((current) => ({
      ...current,
      modifiers: current.modifiers.map((group, index) =>
        index === groupIndex
          ? {
              ...group,
              options: group.options.map((option, currentOptionIndex) =>
                currentOptionIndex === optionIndex
                  ? { ...option, [field]: value }
                  : option,
              ),
            }
          : group,
      ),
    }));
  const addModifierOption = (groupIndex) =>
    setForm((current) => ({
      ...current,
      modifiers: current.modifiers.map((group, index) =>
        index === groupIndex
          ? { ...group, options: [...group.options, { name: "", price_adjustment: 0 }] }
          : group,
      ),
    }));
  const updateChannelSetting = (channelId, patch) =>
    setForm((current) => {
      const currentSetting = current.channel_settings.find(
        (setting) => String(setting.channel_id) === String(channelId),
      );
      const nextSetting = {
        channel_id: Number(channelId),
        is_active: currentSetting?.is_active !== false,
        price_retail: currentSetting?.price_retail ?? "",
        ...patch,
      };
      return {
        ...current,
        channel_settings: currentSetting
          ? current.channel_settings.map((setting) =>
              String(setting.channel_id) === String(channelId) ? nextSetting : setting,
            )
          : [...current.channel_settings, nextSetting],
      };
    });
  const save = async (event) => {
    event.preventDefault();
    if (!form.recipe.length) {
      showMessage({
        tone: "danger",
        title: "บันทึกเมนูไม่ได้",
        message: "กรุณาเลือกวัตถุดิบอย่างน้อย 1 รายการ",
      });
      return;
    }
    const saved = editingId
      ? await onUpdate(editingId, form)
      : await onCreate(form);
    if (saved) {
      showMessage({
        tone: "success",
        title: editingId ? "บันทึกเมนูแล้ว" : "เพิ่มเมนูแล้ว",
        message: editingId ? "การเปลี่ยนแปลงจะแสดงใน POS ทันที" : "เมนูนี้แสดงใน POS ทันทีตามช่องทางขายที่เปิดไว้",
      });
      setForm(initial);
      setEditingId(null);
      setMenuModalOpen(false);
    }
  };
  const edit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      category: product.category || "",
      barcode: product.barcode || "",
      image_url: product.image_url || "",
      image_data: product.image_data || "",
      price_retail: product.price_retail || "",
      price_wholesale: product.price_wholesale || "",
      production_station: product.production_station || "BAR",
      prep_minutes: String(product.prep_minutes || 5),
      counts_as_loyalty_cup: product.counts_as_loyalty_cup === true,
      recipe: (product.recipe || []).map((item) => ({
        ingredient_id: item.ingredient_id,
        quantity_used: item.quantity_used,
      })),
      modifiers: (product.modifier_groups || []).map((group) => ({
        name: group.name,
        min_selection: group.min_selection,
        max_selection: group.max_selection,
        options: (group.options || []).map((option) => ({
          name: option.name,
          price_adjustment: option.price_adjustment,
        })),
      })),
      channel_settings: (product.channel_settings || []).map((setting) => ({
        channel_id: Number(setting.channel_id),
        is_active: setting.is_active !== false,
        price_retail: setting.price_retail ?? "",
      })),
    });
    setMenuModalOpen(true);
  };
  return (
    <div className="space-y-5">
      <Heading
        title="จัดการเมนูสินค้า"
        description="จัดการเมนูขายและสูตรวัตถุดิบ แยกจากหน้าคลังสินค้า"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setForm(initial);
              setEditingId(null);
              setMenuModalOpen(true);
            }}
          >
            + เพิ่มเมนู
          </Button>
        }
      />
      <LowStockMenuAlert products={products} className="mb-5" />
      <div className="grid gap-5">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-900">รายการเมนู</h2><p className="mt-0.5 text-xs text-slate-500">{selectedMenus.length ? `เลือกแล้ว ${selectedMenus.length} รายการ` : `${products.length} รายการ`}</p></div>
            <div className="flex flex-wrap gap-2">
              <Button className="text-xs" type="button" variant="secondary" disabled={!products.length} onClick={() => setAllMenuSelection(!allMenusSelected)}>{allMenusSelected ? "ยกเลิกเลือกทั้งหมด" : "เลือกทั้งหมด"}</Button>
              {selectedMenus.length ? <><Button className="text-xs" type="button" variant="secondary" onClick={() => updateSelectedAvailability(false)}>เปิดขายที่เลือก</Button><Button className="text-xs" type="button" variant="secondary" onClick={() => updateSelectedAvailability(true)}>ปิดขายที่เลือก</Button><Button className="text-xs" type="button" variant="quiet" onClick={() => setAllMenuSelection(false)}>ล้างการเลือก</Button></> : null}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {products.length ? (
              products.map((product) => {
                const availability = menuAvailability(product);
                return (
                  <article
                    className={`rounded-xl border p-3 ${selectedMenuIds.includes(String(product.id)) ? "border-sky-500 bg-sky-50" : "border-sky-100"}`}
                    key={product.id}
                  >
                  <div className="flex items-start gap-2">
                    <ProductVisual product={product} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-bold text-slate-900">
                        {product.name}
                      </h3>
                      <p className="truncate text-[11px] text-slate-500">
                        {product.category || "ไม่มีหมวดหมู่"}
                      </p>
                    </div>
                    <strong className="shrink-0 text-sm text-sky-700">{money(product.price_retail)}</strong>
                    <label className="grid h-7 w-7 shrink-0 cursor-pointer place-items-center rounded-lg border border-sky-200 bg-white" title={`เลือก ${product.name}`}>
                      <input aria-label={`เลือก ${product.name}`} className="h-4 w-4 accent-sky-600" type="checkbox" checked={selectedMenuIds.includes(String(product.id))} onChange={() => toggleMenuSelection(product.id)} />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    <span className="rounded-md bg-slate-100 px-1.5 py-1 text-slate-600">สูตร {product.recipe?.length || 0}</span>
                    <span className="rounded-md bg-violet-50 px-1.5 py-1 text-violet-700">ตัวเลือก {product.modifier_groups?.length || 0}</span>
                    {product.counts_as_loyalty_cup === true ? <span className="rounded-md bg-cyan-50 px-1.5 py-1 text-cyan-700">นับเป็นแก้วสะสมแต้ม</span> : null}
                    {product.barcode ? <span className="max-w-full truncate rounded-md bg-amber-50 px-1.5 py-1 text-amber-800">รหัส {product.barcode}</span> : null}
                    <span className={`rounded-md px-1.5 py-1 font-bold ${availability.isAvailable ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                      {menuAvailabilityLabel(product)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-1">
                    <Button
                      className="rounded-lg !px-2 !py-1.5 text-xs"
                      variant="secondary"
                      onClick={() => edit(product)}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      className="rounded-lg !px-2 !py-1.5 text-xs"
                      variant={availability.manuallySoldOut ? "primary" : "secondary"}
                      onClick={() => onSetAvailability(product, !availability.manuallySoldOut)}
                    >
                      {availability.manuallySoldOut ? "เปิดขาย" : "ปิดขาย"}
                    </Button>
                    <Button
                      className="rounded-lg !px-2 !py-1.5 text-xs"
                      variant="danger"
                      onClick={() => onDelete(product)}
                    >
                      ลบ
                    </Button>
                  </div>
                  </article>
                );
              })
            ) : (
              <Empty>ยังไม่มีเมนูสินค้า</Empty>
            )}
          </div>
        </Card>
        {menuModalOpen ? (
        <Modal label={editingId ? "แก้ไขเมนู" : "เพิ่มเมนู"} maxWidth="max-w-3xl" onClose={() => { setForm(initial); setEditingId(null); setMenuModalOpen(false); }}>
        <aside>
          <Card>
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? "แก้ไขเมนู" : "เพิ่มเมนู"}
            </h2>
            <p className="mt-1 text-xs font-medium text-slate-500"><RequiredMark /> ช่องจำเป็นต้องกรอกก่อนบันทึก</p>
            <form className="mt-5 grid gap-4" onSubmit={save}>
              <FormSection title="ข้อมูลเมนู" description="ชื่อ ราคา และรูปสำหรับแสดงที่หน้าขาย">
              <label className={labelClass}>
                ชื่อเมนู <RequiredMark />
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="เช่น ชานมไข่มุก"
                  required
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={labelClass}>
                  หมวดหมู่
                  <input
                    className={inputClass}
                    value={form.category}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        category: event.target.value,
                      }))
                    }
                    placeholder="เช่น เครื่องดื่ม"
                  />
                </label>
                <label className={labelClass}>
                  บาร์โค้ด / รหัสสแกน <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                  <input
                    className={inputClass}
                    maxLength="80"
                    value={form.barcode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        barcode: event.target.value,
                      }))
                    }
                    placeholder="สแกนหรือกรอกรหัสสินค้า"
                  />
                </label>
                <label className={`${labelClass} sm:col-span-2`}>
                  รูปเมนู <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                  <input
                    className={inputClass}
                    accept="image/jpeg,image/png,image/webp"
                    type="file"
                    onChange={selectMenuImage}
                  />
                  <span className="font-normal text-slate-500">ระบบย่อรูปเป็น WebP ขนาดไม่เกิน 640 px และเก็บไม่เกิน 120 KB ต่อรูป</span>
                  {form.image_data || form.image_url ? <div className="mt-1 flex items-end gap-3"><img alt="ตัวอย่างรูปเมนู" className="h-28 w-28 rounded-xl border border-sky-100 object-cover" src={form.image_data || form.image_url} /><Button className="text-xs" type="button" variant="secondary" onClick={() => setForm((current) => ({ ...current, image_data: "", image_url: "" }))}>ลบรูป</Button></div> : null}
                </label>
                <label className={labelClass}>
                  ราคาขาย <RequiredMark />
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_retail}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        price_retail: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label className={labelClass}>
                  ราคาส่ง
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_wholesale}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        price_wholesale: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={labelClass}>
                  จุดผลิต
                  <select className={inputClass} value={form.production_station} onChange={(event) => setForm((current) => ({ ...current, production_station: event.target.value }))}>
                    <option value="BAR">บาร์เครื่องดื่ม</option>
                    <option value="KITCHEN">ครัวอาหาร</option>
                    <option value="BAKERY">ครัวขนม</option>
                    <option value="OTHER">จุดผลิตอื่น</option>
                  </select>
                </label>
                <label className={labelClass}>
                  เวลาเตรียมมาตรฐาน (นาที)
                  <input className={inputClass} type="number" min="1" max="180" step="1" inputMode="numeric" value={form.prep_minutes} onChange={(event) => setForm((current) => ({ ...current, prep_minutes: event.target.value }))} required />
                </label>
              </div>
              </FormSection>
              <FormSection title="การขายและคะแนนสะสม" description="กำหนดช่องทางที่ขายได้ และตั้งเมนูที่นับเป็นแก้วสะสมแต้ม">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-cyan-100 bg-cyan-50/60 p-3 text-sm text-slate-700">
                <input
                  className="mt-0.5 h-4 w-4 accent-sky-600"
                  type="checkbox"
                  checked={form.counts_as_loyalty_cup === true}
                  onChange={(event) => setForm((current) => ({ ...current, counts_as_loyalty_cup: event.target.checked }))}
                />
                <span><b className="block">นับเป็นแก้วสะสมแต้ม</b><span className="mt-0.5 block text-xs text-slate-500">เมื่อระบบสะสมแต้มแบบแก้ว เปิดเฉพาะเครื่องดื่มหรือสินค้าที่ต้องการให้นับเป็นแก้ว</span></span>
              </label>
              <div className="rounded-xl border border-cyan-100 bg-cyan-50/60 p-3">
                <div>
                  <p className="text-sm font-bold text-slate-700">ช่องทางขายและราคาเฉพาะช่องทาง</p>
                  <p className="mt-1 text-xs text-slate-500">หากเว้นราคาไว้ ระบบจะใช้ราคาขายปกติของเมนู และเมนูที่ปิดจะไม่แสดงใน POS ของช่องทางนั้น</p>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {channels.map((channel) => {
                    const setting = form.channel_settings.find((item) => String(item.channel_id) === String(channel.id));
                    const isActive = setting?.is_active !== false;
                    return (
                      <div className={`rounded-xl border p-3 ${isActive ? "border-cyan-200 bg-white" : "border-slate-200 bg-slate-50"}`} key={channel.id}>
                        <label className="flex cursor-pointer items-center justify-between gap-2 text-sm font-bold text-slate-700">
                          <span className="truncate">{channel.name}</span>
                          <input
                            className="h-4 w-4 accent-sky-600"
                            type="checkbox"
                            checked={isActive}
                            onChange={(event) => updateChannelSetting(channel.id, { is_active: event.target.checked })}
                          />
                        </label>
                        <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-600">
                          ราคาขายช่องทางนี้ <span className="font-normal text-slate-400">(เว้นว่าง = ใช้ราคาปกติ)</span>
                          <input
                            className={inputClass}
                            disabled={!isActive}
                            inputMode="decimal"
                            min="0"
                            placeholder={String(form.price_retail || "0")}
                            step="0.01"
                            type="number"
                            value={setting?.price_retail ?? ""}
                            onChange={(event) => updateChannelSetting(channel.id, { price_retail: event.target.value })}
                          />
                        </label>
                      </div>
                    );
                  })}
                  {!channels.length ? <p className="text-sm text-slate-500">ยังไม่มีช่องทางขาย ให้เพิ่มจากเมนู “ช่องทางขาย” ก่อน</p> : null}
                </div>
              </div>
              </FormSection>
              <FormSection title={<>สูตรวัตถุดิบ <RequiredMark /></>} description="ต้องมีวัตถุดิบอย่างน้อย 1 รายการก่อนบันทึก" className="!border-sky-200 !bg-sky-50/60">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-slate-700">
                    สูตรวัตถุดิบ
                  </p>
                  <Button
                    className="text-xs"
                    type="button"
                    variant="secondary"
                    onClick={addRecipe}
                  >
                    + เพิ่ม
                  </Button>
                </div>
                <div className="mt-3 space-y-3">
                  {form.recipe.map((item, index) => (
                    <div
                      className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_100px_auto]"
                      key={index}
                    >
                      <select
                        className={inputClass}
                        value={item.ingredient_id}
                        onChange={(event) =>
                          updateRecipe(
                            index,
                            "ingredient_id",
                            event.target.value,
                          )
                        }
                        required
                      >
                        <option value="">เลือกวัตถุดิบ</option>
                        {ingredients.map((ingredient) => (
                          <option value={ingredient.id} key={ingredient.id}>
                            {ingredient.name} ({ingredient.unit})
                          </option>
                        ))}
                      </select>
                      <input
                        className={inputClass}
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity_used}
                        onChange={(event) =>
                          updateRecipe(
                            index,
                            "quantity_used",
                            event.target.value,
                          )
                        }
                        required
                      />
                      <Button
                        className="sm:px-2"
                        type="button"
                        variant="danger"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            recipe: current.recipe.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        ลบ
                      </Button>
                    </div>
                  ))}
                  {!form.recipe.length && (
                    <p className="text-sm text-slate-500">
                      กด “เพิ่ม” เพื่อระบุวัตถุดิบ
                    </p>
                  )}
                </div>
              </div>
              </FormSection>
              <FormSection title="ตัวเลือกเมนู" description="เช่น ความหวาน ขนาดแก้ว หรือท็อปปิ้ง เลือกเพิ่มได้ภายหลัง" className="!border-violet-100 !bg-violet-50/60">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-700">ตัวเลือกเมนู</p>
                    <p className="mt-0.5 text-xs text-slate-500">เช่น ระดับหวาน ขนาดแก้ว หรือท็อปปิง</p>
                  </div>
                  <Button className="text-xs" type="button" variant="secondary" onClick={addModifierGroup}>
                    + เพิ่มกลุ่ม
                  </Button>
                </div>
                <div className="mt-3 space-y-4">
                  {form.modifiers.map((group, groupIndex) => (
                    <div className="rounded-xl border border-violet-100 bg-white/80 p-3" key={groupIndex}>
                      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_88px_88px_auto]">
                        <input
                          className={inputClass}
                          value={group.name}
                          onChange={(event) => updateModifierGroup(groupIndex, "name", event.target.value)}
                          placeholder="ชื่อกลุ่ม เช่น ระดับหวาน"
                          required
                        />
                        <input
                          className={inputClass}
                          type="number"
                          min="0"
                          value={group.min_selection}
                          onChange={(event) => updateModifierGroup(groupIndex, "min_selection", event.target.value)}
                          aria-label="จำนวนขั้นต่ำ"
                          title="จำนวนที่ต้องเลือกขั้นต่ำ"
                        />
                        <input
                          className={inputClass}
                          type="number"
                          min="1"
                          value={group.max_selection}
                          onChange={(event) => updateModifierGroup(groupIndex, "max_selection", event.target.value)}
                          aria-label="จำนวนสูงสุด"
                          title="จำนวนที่เลือกได้สูงสุด"
                        />
                        <Button
                          className="sm:px-2"
                          type="button"
                          variant="danger"
                          onClick={() => setForm((current) => ({
                            ...current,
                            modifiers: current.modifiers.filter((_, index) => index !== groupIndex),
                          }))}
                        >
                          ลบ
                        </Button>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">ช่องตัวเลข: ต้องเลือกขั้นต่ำ / เลือกได้สูงสุด</p>
                      <div className="mt-3 space-y-2">
                        {group.options.map((option, optionIndex) => (
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_auto]" key={optionIndex}>
                            <input
                              className={inputClass}
                              value={option.name}
                              onChange={(event) => updateModifierOption(groupIndex, optionIndex, "name", event.target.value)}
                              placeholder="ตัวเลือก เช่น หวาน 50%"
                              required
                            />
                            <input
                              className={inputClass}
                              type="number"
                              step="0.01"
                              value={option.price_adjustment}
                              onChange={(event) => updateModifierOption(groupIndex, optionIndex, "price_adjustment", event.target.value)}
                              placeholder="เพิ่มราคา"
                              title="ส่วนเพิ่ม/ลดราคา"
                            />
                            <Button
                              className="sm:px-2"
                              type="button"
                              variant="danger"
                              disabled={group.options.length === 1}
                              onClick={() => setForm((current) => ({
                                ...current,
                                modifiers: current.modifiers.map((currentGroup, index) =>
                                  index === groupIndex
                                    ? { ...currentGroup, options: currentGroup.options.filter((_, index) => index !== optionIndex) }
                                    : currentGroup,
                                ),
                              }))}
                            >
                              ลบ
                            </Button>
                          </div>
                        ))}
                      </div>
                      <Button className="mt-3 text-xs" type="button" variant="secondary" onClick={() => addModifierOption(groupIndex)}>
                        + เพิ่มตัวเลือก
                      </Button>
                    </div>
                  ))}
                  {!form.modifiers.length ? <p className="text-sm text-slate-500">ยังไม่มีตัวเลือก เมนูนี้จะถูกเพิ่มลงตะกร้าทันที</p> : null}
                </div>
              </div>
              </FormSection>
              <div className="flex gap-2">
                <Button className="flex-1" type="submit">
                  {editingId ? "บันทึกการแก้ไข" : "เพิ่มเมนู"}
                </Button>
                {editingId && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setForm(initial);
                      setEditingId(null);
                      setMenuModalOpen(false);
                    }}
                  >
                    ยกเลิก
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </aside>
        </Modal>
        ) : null}
      </div>
    </div>
  );
}

function LegacyFinancePage({
  metrics,
  expenses,
  expenseRows,
  orders,
  channels,
  products,
  diningTables,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateSales,
  onUpdateSales,
  onDeleteSales,
}) {
  const newSales = () => ({
    order_no: `MAN-${Date.now()}`,
    channel_id: channels[0]?.id || "",
    status: "COMPLETED",
    items: [
      {
        product_id: products[0]?.id || "",
        qty: 1,
        price: products[0]?.price_retail || "",
      },
    ],
  });
  const [sales, setSales] = useState(newSales);
  const [salesEditingId, setSalesEditingId] = useState(null);
  const [expense, setExpense] = useState({
    amount: "",
    category: "OPERATING_EXPENSE",
    description: "",
  });
  const [expenseEditingId, setExpenseEditingId] = useState(null);
  const statCards = [
    ["ยอดขายรวม", metrics.gross],
    ["ยอดสุทธิ", metrics.net],
    ["ต้นทุนสินค้า", metrics.cogs],
    ["ค่าใช้จ่าย", expenses],
    ["กำไรสุทธิ", metrics.profit],
  ];
  const updateSalesItem = (index, field, value) =>
    setSales((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === "product_id") {
          const product = products.find(
            (row) => String(row.id) === String(value),
          );
          return {
            ...item,
            product_id: value,
            price: product?.price_retail ?? item.price,
          };
        }
        return { ...item, [field]: value };
      }),
    }));
  const saveSales = async (event) => {
    event.preventDefault();
    const record = {
      ...sales,
      channel_id: Number(sales.channel_id),
      items: sales.items.map((item) => ({
        product_id: Number(item.product_id),
        qty: Number(item.qty),
        price: Number(item.price),
      })),
    };
    const saved = salesEditingId
      ? await onUpdateSales(salesEditingId, record)
      : await onCreateSales(record);
    if (saved) {
      setSalesEditingId(null);
      setSales(newSales());
    }
  };
  const editSales = (order) => {
    const rawItems = order.rawItems || [];
    if (!rawItems.length) return;
    setSalesEditingId(order.id);
    setSales({
      order_no: order.order_no,
      channel_id: order.channel_id,
      status: order.status === "CANCELLED" ? "COMPLETED" : order.status,
      items: rawItems.map((item) => ({
        product_id: item.product_id,
        qty: item.quantity ?? item.qty,
        price: item.unit_price ?? item.price,
      })),
    });
  };
  const saveExpense = async (event) => {
    event.preventDefault();
    const saved = expenseEditingId
      ? await onUpdateExpense(
          expenseEditingId,
          expense.amount,
          expense.category,
          expense.description,
        )
      : await onCreateExpense(
          expense.amount,
          expense.category,
          expense.description,
        );
    if (saved) {
      setExpense({
        amount: "",
        category: "OPERATING_EXPENSE",
        description: "",
      });
      setExpenseEditingId(null);
    }
  };
  return (
    <div className="space-y-5">
      <Heading
        title="ข้อมูลการเงินและยอดขาย"
        description="ติดตามยอดขาย เพิ่มรายการขาย และจัดการค่าใช้จ่าย"
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {statCards.map(([label, value]) => (
          <Card className="p-4" key={label}>
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <strong className="mt-2 block text-xl text-sky-700">
              {money(value)}
            </strong>
          </Card>
        ))}
      </div>
      <div className="grid gap-5 2xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-slate-900">
            {salesEditingId ? "แก้ไขรายการขาย" : "เพิ่มรายการขาย"}
          </h2>
          <form className="mt-4 grid gap-4" onSubmit={saveSales}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>
                เลขที่ออเดอร์
                <input
                  className={inputClass}
                  value={sales.order_no}
                  onChange={(event) =>
                    setSales((current) => ({
                      ...current,
                      order_no: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className={labelClass}>
                ช่องทาง
                <select
                  className={inputClass}
                  value={sales.channel_id}
                  onChange={(event) =>
                    setSales((current) => ({
                      ...current,
                      channel_id: event.target.value,
                    }))
                  }
                >
                  {channels.map((channel) => (
                    <option value={channel.id} key={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                สถานะ
                <select
                  className={inputClass}
                  value={sales.status}
                  onChange={(event) =>
                    setSales((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="COMPLETED">สำเร็จ</option>
                  <option value="COOKING">กำลังดำเนินการ</option>
                </select>
              </label>
            </div>
            <div className="space-y-3">
              {sales.items.map((item, index) => (
                <div
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_120px_auto]"
                  key={index}
                >
                  <select
                    className={inputClass}
                    value={item.product_id}
                    onChange={(event) =>
                      updateSalesItem(index, "product_id", event.target.value)
                    }
                    required
                  >
                    {products.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(event) =>
                      updateSalesItem(index, "qty", event.target.value)
                    }
                    required
                  />
                  <input
                    className={inputClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(event) =>
                      updateSalesItem(index, "price", event.target.value)
                    }
                    required
                  />
                  {sales.items.length > 1 && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        setSales((current) => ({
                          ...current,
                          items: current.items.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                    >
                      ลบ
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSales((current) => ({
                    ...current,
                    items: [
                      ...current.items,
                      {
                        product_id: products[0]?.id || "",
                        qty: 1,
                        price: products[0]?.price_retail || "",
                      },
                    ],
                  }))
                }
              >
                + เพิ่มสินค้า
              </Button>
              <Button type="submit">
                {salesEditingId ? "บันทึกรายการ" : "เพิ่มยอดขาย"}
              </Button>
              {salesEditingId && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setSalesEditingId(null);
                    setSales(newSales());
                  }}
                >
                  ยกเลิก
                </Button>
              )}
            </div>
          </form>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-slate-900">
            {expenseEditingId ? "แก้ไขค่าใช้จ่าย" : "เพิ่มค่าใช้จ่าย"}
          </h2>
          <form className="mt-4 grid gap-4" onSubmit={saveExpense}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                จำนวนเงิน
                <input
                  className={inputClass}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={expense.amount}
                  onChange={(event) =>
                    setExpense((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className={labelClass}>
                ประเภท
                <select
                  className={inputClass}
                  value={expense.category}
                  onChange={(event) =>
                    setExpense((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  <option value="OPERATING_EXPENSE">ค่าใช้จ่ายดำเนินงาน</option>
                  <option value="DELIVERY_COST">ค่าขนส่ง</option>
                </select>
              </label>
            </div>
            <label className={labelClass}>
              รายละเอียด
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={expense.description}
                onChange={(event) =>
                  setExpense((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="เช่น ค่าขนส่งวัตถุดิบ"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit">
                {expenseEditingId ? "บันทึกการแก้ไข" : "เพิ่มค่าใช้จ่าย"}
              </Button>
              {expenseEditingId && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setExpenseEditingId(null);
                    setExpense({
                      amount: "",
                      category: "OPERATING_EXPENSE",
                      description: "",
                    });
                  }}
                >
                  ยกเลิก
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <h2 className="text-lg font-bold text-slate-900">Sales records</h2>
          <div className="mt-4 space-y-3">
            {orders.length ? (
              orders.map((order) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-sky-100 p-3 sm:flex-row sm:items-center"
                  key={order.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">
                      #{order.order_no} ·{" "}
                      <span className="text-sky-700">
                        {money(order.net_revenue)}
                      </span>
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {order.channel_name} · {order.items}
                    </p>
                    {(order.customer_name || order.customer_nickname || order.customer_phone) ? <p className="mt-1 truncate text-xs text-violet-700">ลูกค้า: {order.customer_name || order.customer_nickname || "ไม่ระบุชื่อ"}{order.customer_phone ? ` · สมาชิก ${maskPhone(order.customer_phone)}` : ""}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Status status={order.status} />
                    {order.rawItems?.length > 0 && (
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => editSales(order)}
                      >
                        แก้ไข
                      </Button>
                    )}
                    <Button
                      className="text-xs"
                      variant="danger"
                      onClick={() => onDeleteSales(order)}
                    >
                      ลบ
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <Empty>ยังไม่มีรายการขาย</Empty>
            )}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-slate-900">Expense ledger</h2>
          <div className="mt-4 space-y-3">
            {expenseRows.length ? (
              expenseRows.map((item) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-sky-100 p-3 sm:flex-row sm:items-center"
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">
                      {money(item.amount)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {item.category === "DELIVERY_COST"
                        ? "ค่าขนส่ง"
                        : "ค่าใช้จ่ายดำเนินงาน"}
                      {item.description ? ` · ${item.description}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="text-xs"
                      variant="secondary"
                      onClick={() => {
                        setExpenseEditingId(item.id);
                        setExpense({
                          amount: item.amount,
                          category: item.category,
                          description: item.description || "",
                        });
                      }}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      className="text-xs"
                      variant="danger"
                      onClick={() => onDeleteExpense(item)}
                    >
                      ลบ
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <Empty>ยังไม่มีรายการค่าใช้จ่าย</Empty>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

const bangkokDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
};

const todayInBangkok = () => bangkokDate(new Date());
const shiftRecordDate = (value, days) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const firstDayOfMonth = (value) => `${String(value).slice(0, 8)}01`;
const dateLabel = (date) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
const dateTimeLabel = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};
const rowMatchesDate = (row, selectedDate) =>
  Boolean(row?.created_at) && bangkokDate(row.created_at) === selectedDate;
const inventoryIsLow = (item) => {
  const quantity = Number(item.stock_qty ?? item.stock ?? 0);
  return (
    item.is_low_stock ||
    item.level === "low" ||
    (item.min_stock_alert && quantity <= Number(item.min_stock_alert))
  );
};

const storeAlertsFor = ({ products = [], inventoryRows = [], inventoryLots = [] }) => {
  const alerts = [];
  products.forEach((product) => {
    const availability = menuAvailability(product);
    if (!availability.isLowStock) return;
    alerts.push({
      id: `menu-${product.id}`,
      severity: "warning",
      category: "เมนูใกล้หมด",
      title: product.name || "เมนูไม่ระบุชื่อ",
      detail: `ทำได้อีกประมาณ ${availability.availableQuantity} แก้วจากล็อตที่ยังไม่หมดอายุ`,
      target: "menu",
      action: "ดูเมนู",
    });
  });
  inventoryRows.forEach((item) => {
    if (!inventoryIsLow(item)) return;
    const quantity = Number(item.stock_qty ?? item.stock ?? 0);
    const minimum = Number(item.min_stock_alert || 0);
    alerts.push({
      id: `ingredient-${item.id || item.code || item.name}`,
      severity: "warning",
      category: "วัตถุดิบใกล้หมด",
      title: item.name || "วัตถุดิบไม่ระบุชื่อ",
      detail: `คงเหลือ ${quantity} ${item.unit || "หน่วย"}${minimum > 0 ? ` · จุดแจ้งเตือน ${minimum}` : ""}`,
      target: "inventory",
      action: "ดูวัตถุดิบ",
    });
  });
  inventoryLots.forEach((lot) => {
    const expiry = expiryState(lot.expiry_date);
    if (!expiry) return;
    alerts.push({
      id: `lot-${lot.id}`,
      severity: expiry.tone === "rose" ? "critical" : "warning",
      category: expiry.tone === "rose" ? "ล็อตหมดอายุ" : "ล็อตใกล้หมดอายุ",
      title: `${lot.ingredient_name || "วัตถุดิบ"} · ${lot.lot_no || `ล็อต #${lot.id}`}`,
      detail: `${expiry.label} · เหลือ ${Number(lot.remaining_quantity || 0)} ${lot.unit || "หน่วย"}`,
      target: "inventory",
      action: "ดูวัตถุดิบ",
    });
  });
  const priority = { critical: 0, warning: 1 };
  return alerts.sort((left, right) => priority[left.severity] - priority[right.severity] || left.title.localeCompare(right.title, "th"));
};

const purchaseOrderStatusLabel = (status) => ({
  DRAFT: "ฉบับร่าง",
  SENT: "ส่งให้ผู้ขายแล้ว",
  RECEIVED: "รับของแล้ว",
  CANCELLED: "ยกเลิกแล้ว",
}[status] || status);

function PurchaseRecommendationPanel({ inventoryRows, suppliers, onNavigate, onCreatePurchaseOrder }) {
  const { showMessage } = useActionDialog();
  const recommendations = useMemo(
    () => inventoryRows.filter(inventoryIsLow).map((item) => {
      const currentQuantity = Number(item.stock_qty ?? item.stock ?? 0);
      const minimumQuantity = Math.max(0, Number(item.min_stock_alert || 0));
      const targetQuantity = minimumQuantity > 0 ? Math.max(minimumQuantity * 2, minimumQuantity + 1) : 1;
      return {
        id: String(item.id || item.code || item.name),
        ingredientId: item.id,
        name: item.name || "วัตถุดิบไม่ระบุชื่อ",
        unit: item.unit || "หน่วย",
        currentQuantity,
        minimumQuantity,
        unitCost: Number(item.cost_per_unit || 0),
        suggestedQuantity: Math.max(1, targetQuantity - currentQuantity),
      };
    }),
    [inventoryRows],
  );
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [quantityById, setQuantityById] = useState({});
  useEffect(() => {
    setQuantityById((current) => Object.fromEntries(
      recommendations.map((item) => [item.id, current[item.id] ?? item.suggestedQuantity]),
    ));
  }, [recommendations]);
  const exportRecommendations = () => {
    const supplier = suppliers.find((item) => String(item.id) === String(supplierId));
    exportExcel({
      filename: `stockpos-purchase-recommendation-${todayInBangkok()}.xlsx`,
      sheets: [{
        name: "รายการสั่งซื้อแนะนำ",
        columns: [
          { key: "name", label: "วัตถุดิบ" },
          { key: "current", label: "คงเหลือ" },
          { key: "minimum", label: "จุดแจ้งเตือน" },
          { key: "quantity", label: "แนะนำให้สั่ง" },
          { key: "unit", label: "หน่วย" },
          { key: "supplier", label: "ผู้ขาย" },
        ],
        rows: recommendations.map((item) => ({
          name: item.name,
          current: item.currentQuantity,
          minimum: item.minimumQuantity,
          quantity: Math.max(0, Number(quantityById[item.id] ?? item.suggestedQuantity) || 0),
          unit: item.unit,
          supplier: supplier?.name || "ไม่ระบุผู้ขาย",
        })),
      }],
    });
  };
  const savePurchaseOrder = async () => {
    const items = recommendations
      .map((item) => ({
        ingredient_id: item.ingredientId,
        quantity: Math.max(0, Number(quantityById[item.id] ?? item.suggestedQuantity) || 0),
        unit_cost: item.unitCost,
      }))
      .filter((item) => item.ingredient_id && item.quantity > 0);
    if (!items.length) {
      showMessage({
        tone: "danger",
        title: "สร้างใบสั่งซื้อไม่ได้",
        message: "กรุณาระบุจำนวนที่จะสั่งอย่างน้อย 1 รายการ",
      });
      return;
    }
    const created = await onCreatePurchaseOrder({
      supplier_id: supplierId || null,
      expected_date: expectedDate || null,
      note: "สร้างจากรายการสั่งซื้อแนะนำ",
      items,
    });
    if (created) setExpectedDate("");
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">รายการสั่งซื้อแนะนำ</h2>
          <p className="mt-1 text-sm text-slate-500">ระบบคำนวณให้กลับไปมีอย่างน้อย 2 เท่าของจุดแจ้งเตือน</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="text-xs" onClick={() => onNavigate("inventory")}>รับของเข้าคลัง</Button>
          <Button type="button" className="text-xs" disabled={!recommendations.length} onClick={exportRecommendations}>Export Excel</Button>
          <Button type="button" className="text-xs" disabled={!recommendations.length} onClick={savePurchaseOrder}>บันทึกใบสั่งซื้อ</Button>
        </div>
      </div>
      {recommendations.length ? (
        <>
          <label className="mt-4 grid gap-1.5 text-xs font-semibold text-slate-600 sm:max-w-sm">
            ผู้ขายสำหรับรายการนี้ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <select className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">ไม่ระบุผู้ขาย</option>
              {suppliers.filter((supplier) => supplier.is_active !== false).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className="mt-4 grid gap-1.5 text-xs font-semibold text-slate-600 sm:max-w-sm">
            วันที่คาดว่าจะได้รับ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <input className={inputClass} type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recommendations.map((item) => (
              <article className="rounded-2xl border border-sky-100 bg-sky-50/45 p-4" key={item.id}>
                <p className="truncate font-bold text-slate-900">{item.name}</p>
                <p className="mt-1 text-xs text-slate-500">คงเหลือ {item.currentQuantity} {item.unit} · จุดเตือน {item.minimumQuantity}</p>
                <label className="mt-3 grid gap-1 text-xs font-semibold text-slate-600">
                  จำนวนที่จะสั่ง
                  <input className={inputClass} type="number" min="0" step="0.001" value={quantityById[item.id] ?? item.suggestedQuantity} onChange={(event) => setQuantityById((current) => ({ ...current, [item.id]: event.target.value }))} />
                </label>
              </article>
            ))}
          </div>
        </>
      ) : <Empty>ยังไม่มีวัตถุดิบที่ต้องสั่งเพิ่ม</Empty>}
    </Card>
  );
}

function ReceivePurchaseOrderPanel({ order, onClose, onReceive }) {
  const { confirmAction } = useActionDialog();
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [note, setNote] = useState("");
  const [items, setItems] = useState(() => (order.items || []).map((item) => ({
    ingredient_id: item.ingredient_id,
    ingredient_name: item.ingredient_name,
    unit: item.unit,
    quantity: String(item.quantity ?? ""),
    unit_cost: String(item.unit_cost ?? ""),
    lot_no: "",
    expiry_date: "",
  })));
  const total = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_cost) || 0),
    0,
  );
  const updateItem = (index, field, value) => {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  };
  const submit = async (event) => {
    event.preventDefault();
    const confirmed = await confirmAction({
      tone: "success",
      title: "ยืนยันรับสินค้าเข้าคลัง?",
      message: `ต้องการรับของตาม ${order.po_no} เข้าคลังใช่หรือไม่\nระบบจะสร้างล็อตและปรับยอดคงเหลือทันที`,
      confirmLabel: "ยืนยันรับเข้าคลัง",
    });
    if (!confirmed) return;
    const saved = await onReceive?.(order, { received_at: receivedAt, note, items });
    if (saved) onClose();
  };
  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">ตรวจรับสินค้า: {order.po_no}</h2>
          <p className="mt-1 text-sm text-slate-600">ตรวจจำนวนและต้นทุนจริงก่อนรับเข้า พร้อมระบุเลขล็อตหรือวันหมดอายุได้</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-800">รวม {money(total)}</span>
          <Button type="button" variant="secondary" onClick={onClose}>ปิด</Button>
        </div>
      </div>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            วันเวลารับของ
            <input className={inputClass} type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required />
          </label>
          <label className={labelClass}>
            หมายเหตุ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <input className={inputClass} value={note} maxLength="1000" onChange={(event) => setNote(event.target.value)} placeholder="เช่น ใบส่งของ #A-102" />
          </label>
        </div>
        <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white/80 p-3 sm:p-4">
          <div className="hidden grid-cols-[minmax(0,1fr)_100px_115px_130px_145px] gap-2 px-1 text-xs font-bold text-slate-500 xl:grid">
            <span>วัตถุดิบ</span><span>จำนวนจริง</span><span>ต้นทุน/หน่วย</span><span>เลขล็อต</span><span>วันหมดอายุ</span>
          </div>
          {items.map((item, index) => (
            <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_100px_115px_130px_145px]" key={item.ingredient_id}>
              <label className={labelClass}>
                <span className="xl:hidden">วัตถุดิบ</span>
                <div className="flex min-h-[42px] items-center rounded-xl border border-sky-100 bg-slate-50 px-3 text-sm font-semibold text-slate-700">{item.ingredient_name} <span className="ml-1 font-normal text-slate-400">({item.unit || "หน่วย"})</span></div>
              </label>
              <label className={labelClass}>
                <span className="xl:hidden">จำนวนจริง ({item.unit || "หน่วย"})</span>
                <input className={inputClass} type="number" min="0.001" step="0.001" inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} required />
              </label>
              <label className={labelClass}>
                <span className="xl:hidden">ต้นทุนต่อหน่วย</span>
                <input className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" value={item.unit_cost} onChange={(event) => updateItem(index, "unit_cost", event.target.value)} required />
              </label>
              <label className={labelClass}>
                <span className="xl:hidden">เลขล็อต</span>
                <input className={inputClass} value={item.lot_no} maxLength="100" onChange={(event) => updateItem(index, "lot_no", event.target.value)} placeholder="เว้นว่างเพื่อให้ระบบสร้าง" />
              </label>
              <label className={labelClass}>
                <span className="xl:hidden">วันหมดอายุ</span>
                <input className={inputClass} type="date" value={item.expiry_date} onChange={(event) => updateItem(index, "expiry_date", event.target.value)} />
              </label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
          <span>เมื่อยืนยันแล้ว ระบบจะสร้างใบรับของ เพิ่มล็อต และปรับยอดวัตถุดิบในคลังทันที</span>
          <Button type="submit" className="shrink-0">ยืนยันรับเข้าคลัง</Button>
        </div>
      </form>
    </Card>
  );
}

function PurchaseOrderHistory({ orders, onUpdateStatus, onReceive }) {
  const [receivingOrder, setReceivingOrder] = useState(null);
  if (!orders.length) return null;
  return (
    <div className="grid gap-5">
      {receivingOrder ? (
        <Modal label="ตรวจรับสินค้าตามใบสั่งซื้อ" maxWidth="max-w-6xl" onClose={() => setReceivingOrder(null)}>
          <ReceivePurchaseOrderPanel key={receivingOrder.id} order={receivingOrder} onClose={() => setReceivingOrder(null)} onReceive={onReceive} />
        </Modal>
      ) : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">ใบสั่งซื้อล่าสุด</h2>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-700">{orders.length} ฉบับ</span>
        </div>
        <div className="mt-4 grid gap-3">
          {orders.slice(0, 10).map((order) => (
            <article className="flex flex-col gap-3 rounded-2xl border border-sky-100 bg-white p-4 sm:flex-row sm:items-center" key={order.id}>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-slate-900">{order.po_no}</h3>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${order.status === "RECEIVED" ? "bg-emerald-50 text-emerald-700" : order.status === "CANCELLED" ? "bg-slate-100 text-slate-600" : order.status === "SENT" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>{purchaseOrderStatusLabel(order.status)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{order.supplier_name || "ไม่ระบุผู้ขาย"} · {order.items?.length || 0} รายการ{order.expected_date ? ` · คาดว่าจะได้ ${String(order.expected_date).slice(0, 10)}` : ""}</p>
                {order.receipt_no ? <p className="mt-1 text-xs font-semibold text-emerald-700">รับเข้าคลังแล้ว: {order.receipt_no}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {order.status === "DRAFT" ? <Button type="button" variant="secondary" className="text-xs" onClick={() => onUpdateStatus(order, "SENT")}>ส่งให้ผู้ขาย</Button> : null}
                {["DRAFT", "SENT"].includes(order.status) ? <Button type="button" className="text-xs" onClick={() => setReceivingOrder(order)}>ตรวจรับของ</Button> : null}
                {["DRAFT", "SENT"].includes(order.status) ? <Button type="button" variant="danger" className="text-xs" onClick={() => onUpdateStatus(order, "CANCELLED")}>ยกเลิก</Button> : null}
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}

function PurchaseOrderCreateDialog({ rows, suppliers, onClose, onCreate }) {
  const emptyItem = () => ({ ingredient_id: "", quantity: "", unit_cost: "" });
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState([emptyItem()]);
  const selectedIngredientIds = new Set(items.map((item) => String(item.ingredient_id)).filter(Boolean));
  const total = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_cost) || 0),
    0,
  );
  const updateItem = (index, field, value) => {
    setItems((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      if (field !== "ingredient_id") return { ...item, [field]: value };
      const ingredient = rows.find((row) => String(row.id) === String(value));
      return {
        ...item,
        ingredient_id: value,
        unit_cost: ingredient ? String(ingredient.cost_per_unit ?? "") : item.unit_cost,
      };
    }));
  };
  const submit = async (event) => {
    event.preventDefault();
    const saved = await onCreate?.({
      supplier_id: supplierId || null,
      expected_date: expectedDate || null,
      note,
      items,
    });
    if (saved) onClose();
  };
  return (
    <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto border-sky-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">สร้างใบสั่งซื้อ</h2>
          <p className="mt-1 text-sm text-slate-500">ระบุผู้ขาย วัตถุดิบ จำนวน และต้นทุนที่คาดไว้ก่อนส่งสั่งซื้อ</p>
        </div>
        <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700">รวม {money(total)}</span>
      </div>
      <form className="mt-5 grid gap-4" onSubmit={submit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            ผู้ขาย <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <select className={inputClass} value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">ไม่ระบุผู้ขาย</option>
              {suppliers.filter((supplier) => supplier.is_active !== false).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label className={labelClass}>
            วันที่คาดว่าจะได้รับ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <input className={inputClass} type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
          </label>
          <label className={`${labelClass} sm:col-span-2`}>
            หมายเหตุ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
            <input className={inputClass} maxLength="1000" value={note} onChange={(event) => setNote(event.target.value)} placeholder="เช่น รบกวนส่งช่วงเช้า / เครดิต 30 วัน" />
          </label>
        </div>
        <div className="space-y-3 rounded-2xl border border-sky-100 bg-sky-50/45 p-3 sm:p-4">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_130px_44px] gap-2 px-1 text-xs font-bold text-slate-500 lg:grid">
            <span>วัตถุดิบ</span><span>จำนวนสั่ง</span><span>ต้นทุน/หน่วย</span><span />
          </div>
          {items.map((item, index) => {
            const ingredient = rows.find((row) => String(row.id) === String(item.ingredient_id));
            return (
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_110px_130px_44px]" key={index}>
                <label className={labelClass}>
                  <span className="lg:hidden">วัตถุดิบ</span>
                  <select className={inputClass} value={item.ingredient_id} onChange={(event) => updateItem(index, "ingredient_id", event.target.value)} required>
                    <option value="">เลือกวัตถุดิบ</option>
                    {rows.map((row) => (
                      <option disabled={selectedIngredientIds.has(String(row.id)) && String(item.ingredient_id) !== String(row.id)} key={row.id} value={row.id}>
                        {row.name} · เหลือ {Number(row.stock_qty ?? row.stock ?? 0)} {row.unit}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  <span className="lg:hidden">จำนวนสั่ง ({ingredient?.unit || "หน่วย"})</span>
                  <input className={inputClass} type="number" min="0.001" step="0.001" inputMode="decimal" value={item.quantity} onChange={(event) => updateItem(index, "quantity", event.target.value)} required />
                </label>
                <label className={labelClass}>
                  <span className="lg:hidden">ต้นทุนต่อหน่วย</span>
                  <input className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" value={item.unit_cost} onChange={(event) => updateItem(index, "unit_cost", event.target.value)} required />
                </label>
                <Button type="button" className="self-end px-2" variant="danger" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</Button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sky-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setItems((current) => [...current, emptyItem()])}>+ เพิ่มรายการ</Button>
            <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button><Button type="submit" disabled={!rows.length}>บันทึกใบสั่งซื้อ</Button></div>
          </div>
        </div>
      </form>
    </Card>
  );
}

function SupplierEditorDialog({ supplier, onClose, onSave }) {
  const [form, setForm] = useState({
    name: supplier?.name || "",
    contact_name: supplier?.contact_name || "",
    phone: supplier?.phone || "",
    email: supplier?.email || "",
    address: supplier?.address || "",
    is_active: supplier?.is_active !== false,
  });
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    const saved = await onSave?.(form);
    if (saved) onClose();
  };
  return (
    <Card className="border-sky-200 bg-white">
      <h2 className="text-lg font-bold text-slate-900">{supplier?.id ? "แก้ไขผู้ขาย" : "เพิ่มผู้ขาย"}</h2>
      <p className="mt-1 text-sm text-slate-500">เก็บข้อมูลติดต่อไว้สำหรับใบสั่งซื้อและประวัติการรับวัตถุดิบ</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className={labelClass}>ชื่อผู้ขาย<input className={inputClass} value={form.name} onChange={update("name")} placeholder="ชื่อผู้ขาย" required /></label>
        <label className={labelClass}>ผู้ติดต่อ<input className={inputClass} value={form.contact_name} onChange={update("contact_name")} placeholder="ชื่อผู้ติดต่อ" /></label>
        <label className={labelClass}>เบอร์โทร<input className={inputClass} inputMode="tel" value={form.phone} onChange={update("phone")} placeholder="เบอร์โทรศัพท์" /></label>
        <label className={labelClass}>อีเมล<input className={inputClass} type="email" value={form.email} onChange={update("email")} placeholder="อีเมล" /></label>
        <label className={`${labelClass} sm:col-span-2`}>ที่อยู่<textarea className={`${inputClass} min-h-24 resize-y`} value={form.address} onChange={update("address")} placeholder="ที่อยู่ / รายละเอียดการจัดส่ง" /></label>
        {supplier?.id ? <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 sm:col-span-2"><input className="h-4 w-4 accent-sky-600" type="checkbox" checked={form.is_active} onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} /> เปิดใช้งานผู้ขายรายนี้</label> : null}
        <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button><Button type="submit">บันทึกผู้ขาย</Button></div>
      </form>
    </Card>
  );
}

function SupplierManagementPanel({ suppliers, onCreateSupplier, onUpdateSupplier, onFetchSupplierHistory }) {
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [historySupplier, setHistorySupplier] = useState(null);
  const [history, setHistory] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const saveSupplier = async (form) => editingSupplier?.id
    ? onUpdateSupplier?.(editingSupplier.id, form)
    : onCreateSupplier?.(form);
  const openHistory = async (supplier) => {
    setHistorySupplier(supplier);
    setHistory(null);
    setLoadingHistory(true);
    const data = await onFetchSupplierHistory?.(supplier.id);
    setHistory(data || null);
    setLoadingHistory(false);
  };
  return (
    <>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-900">ผู้ขายวัตถุดิบ</h2><p className="mt-1 text-sm text-slate-500">เก็บรายชื่อ ข้อมูลติดต่อ และดูประวัติการสั่งซื้อรายผู้ขาย</p></div>
          <Button type="button" onClick={() => setCreatingSupplier(true)}>+ เพิ่มผู้ขาย</Button>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {suppliers.length ? suppliers.map((supplier) => (
            <article className={`rounded-2xl border p-4 ${supplier.is_active === false ? "border-slate-200 bg-slate-50 opacity-75" : "border-sky-100 bg-white"}`} key={supplier.id}>
              <div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate font-bold text-slate-900">{supplier.name}</h3><p className="mt-1 truncate text-xs text-slate-500">{supplier.contact_name || "ยังไม่ระบุผู้ติดต่อ"}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${supplier.is_active === false ? "bg-slate-200 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{supplier.is_active === false ? "ปิดใช้งาน" : "ใช้งาน"}</span></div>
              <p className="mt-3 truncate text-sm text-slate-700">{supplier.phone || supplier.email || "ยังไม่มีข้อมูลติดต่อ"}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-xl bg-sky-50 p-2 text-sky-800"><b className="block text-sm">{Number(supplier.purchase_order_count || 0)}</b>ใบสั่งซื้อ</span><span className="rounded-xl bg-violet-50 p-2 text-violet-800"><b className="block text-sm">{Number(supplier.receipt_count || 0)}</b>ใบรับของ</span><span className="rounded-xl bg-amber-50 p-2 text-amber-900"><b className="block text-sm">{money(supplier.total_purchased)}</b>ยอดซื้อ</span></div>
              {supplier.last_received_at ? <p className="mt-3 text-xs text-slate-500">รับของล่าสุด {dateTimeLabel(supplier.last_received_at)}</p> : null}
              <div className="mt-3 flex gap-2"><Button type="button" variant="secondary" className="flex-1 text-xs" onClick={() => setEditingSupplier(supplier)}>แก้ไข</Button><Button type="button" variant="secondary" className="flex-1 text-xs" onClick={() => openHistory(supplier)}>ประวัติ</Button></div>
            </article>
          )) : <Empty>ยังไม่มีผู้ขาย กด “เพิ่มผู้ขาย” เพื่อเริ่มสร้างฐานข้อมูลผู้ขาย</Empty>}
        </div>
      </Card>
      {creatingSupplier || editingSupplier ? <Modal label={editingSupplier ? "แก้ไขผู้ขาย" : "เพิ่มผู้ขาย"} maxWidth="max-w-2xl" onClose={() => { setCreatingSupplier(false); setEditingSupplier(null); }}><SupplierEditorDialog key={editingSupplier?.id || "new"} supplier={editingSupplier} onSave={saveSupplier} onClose={() => { setCreatingSupplier(false); setEditingSupplier(null); }} /></Modal> : null}
      {historySupplier ? <Modal label={`ประวัติผู้ขาย ${historySupplier.name}`} maxWidth="max-w-5xl" onClose={() => setHistorySupplier(null)}><Card className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-white"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">ประวัติ: {historySupplier.name}</h2><p className="mt-1 text-sm text-slate-500">ใบสั่งซื้อและใบรับวัตถุดิบทั้งหมดของผู้ขายรายนี้</p></div>{history?.supplier ? <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700">ยอดซื้อสะสม {money(history.supplier.total_purchased)}</span> : null}</div>{loadingHistory ? <p className="py-10 text-center text-sm text-slate-500">กำลังโหลดประวัติ…</p> : history ? <div className="mt-5 grid gap-5 lg:grid-cols-2"><section><h3 className="font-bold text-slate-800">ใบสั่งซื้อ ({history.purchase_orders?.length || 0})</h3><div className="mt-3 space-y-2">{history.purchase_orders?.length ? history.purchase_orders.map((order) => <article className="rounded-xl border border-sky-100 p-3" key={order.id}><div className="flex justify-between gap-2"><b>{order.po_no}</b><span className="text-xs font-bold text-sky-700">{purchaseOrderStatusLabel(order.status)}</span></div><p className="mt-1 text-xs text-slate-500">{dateTimeLabel(order.created_at)} · {order.item_count} รายการ</p><p className="mt-1 font-bold text-slate-700">{money(order.total_amount)}</p></article>) : <p className="text-sm text-slate-500">ยังไม่มีใบสั่งซื้อ</p>}</div></section><section><h3 className="font-bold text-slate-800">รับวัตถุดิบเข้า ({history.receipts?.length || 0})</h3><div className="mt-3 space-y-2">{history.receipts?.length ? history.receipts.map((receipt) => <article className="rounded-xl border border-emerald-100 p-3" key={receipt.id}><div className="flex justify-between gap-2"><b>{receipt.receipt_no}</b><span className="text-xs font-bold text-emerald-700">{receipt.item_count} รายการ</span></div><p className="mt-1 text-xs text-slate-500">{dateTimeLabel(receipt.received_at)}</p><p className="mt-1 font-bold text-slate-700">{money(receipt.total_amount)}</p>{receipt.note ? <p className="mt-1 text-xs text-slate-500">{receipt.note}</p> : null}</article>) : <p className="text-sm text-slate-500">ยังไม่มีประวัติรับสินค้า</p>}</div></section></div> : <p className="py-10 text-center text-sm text-rose-600">โหลดประวัติไม่สำเร็จ</p>}</Card></Modal> : null}
    </>
  );
}

function ReceiptHistoryPanel({ receipts }) {
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">ประวัติรับวัตถุดิบล่าสุด</h2><p className="mt-1 text-sm text-slate-500">ทุกการรับของจะบันทึกต้นทุน เลขล็อต และวันหมดอายุไว้ในคลัง</p></div><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{receipts.length} ใบรับของ</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{receipts.length ? receipts.map((receipt) => <article className="rounded-2xl border border-emerald-100 bg-emerald-50/25 p-4" key={receipt.id}><div className="flex items-start justify-between gap-2"><b className="text-slate-900">{receipt.receipt_no}</b><span className="shrink-0 text-sm font-bold text-emerald-700">{money(receipt.total_amount)}</span></div><p className="mt-1 truncate text-sm text-slate-600">{receipt.supplier_name || "ไม่ระบุผู้ขาย"}</p><p className="mt-2 text-xs text-slate-500">{dateTimeLabel(receipt.received_at)} · {receipt.items?.length || 0} รายการ</p>{receipt.note ? <p className="mt-2 line-clamp-2 text-xs text-slate-500">{receipt.note}</p> : null}</article>) : <Empty>ยังไม่มีประวัติรับวัตถุดิบ</Empty>}</div>
    </Card>
  );
}

function ProcurementPage({ inventoryRows, suppliers, receipts, purchaseOrders, onNavigate, onCreateSupplier, onUpdateSupplier, onFetchSupplierHistory, onCreateReceipt, onCreatePurchaseOrder, onUpdatePurchaseOrderStatus, onReceivePurchaseOrder }) {
  const [purchaseOrderOpen, setPurchaseOrderOpen] = useState(false);
  const [receivingOpen, setReceivingOpen] = useState(false);
  const activeSuppliers = suppliers.filter((supplier) => supplier.is_active !== false).length;
  const pendingOrders = purchaseOrders.filter((order) => ["DRAFT", "SENT"].includes(order.status)).length;
  const recentPurchaseTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.total_amount || 0), 0);
  return (
    <div className="space-y-5">
      <Heading title="การจัดซื้อและผู้จำหน่าย" description="สร้างใบสั่งซื้อ รับวัตถุดิบเป็นล็อต และติดตามต้นทุนจากผู้จำหน่ายในหน้าเดียว" action={<div className="flex flex-wrap gap-2"><Button type="button" variant="secondary" onClick={() => setReceivingOpen(true)}>+ รับวัตถุดิบเข้า</Button><Button type="button" onClick={() => setPurchaseOrderOpen(true)}>+ สร้างใบสั่งซื้อ</Button></div>} />
      <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-sky-100 bg-sky-50 p-4"><p className="text-xs font-bold text-sky-700">ผู้ขายที่ใช้งาน</p><b className="mt-1 block text-3xl text-slate-900">{activeSuppliers}</b><p className="mt-1 text-xs text-slate-500">ราย</p></div><div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><p className="text-xs font-bold text-amber-800">ใบสั่งซื้อที่รอดำเนินการ</p><b className="mt-1 block text-3xl text-slate-900">{pendingOrders}</b><p className="mt-1 text-xs text-slate-500">ฉบับ</p></div><div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4"><p className="text-xs font-bold text-emerald-700">มูลค่ารับของล่าสุด</p><b className="mt-1 block text-3xl text-slate-900">{money(recentPurchaseTotal)}</b><p className="mt-1 text-xs text-slate-500">จาก {receipts.length} ใบรับของล่าสุด</p></div></section>
      <PurchaseRecommendationPanel inventoryRows={inventoryRows} suppliers={suppliers} onNavigate={onNavigate} onCreatePurchaseOrder={onCreatePurchaseOrder} />
      <PurchaseOrderHistory orders={purchaseOrders} onUpdateStatus={onUpdatePurchaseOrderStatus} onReceive={onReceivePurchaseOrder} />
      <div className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]"><SupplierManagementPanel suppliers={suppliers} onCreateSupplier={onCreateSupplier} onUpdateSupplier={onUpdateSupplier} onFetchSupplierHistory={onFetchSupplierHistory} /><ReceiptHistoryPanel receipts={receipts} /></div>
      {purchaseOrderOpen ? <Modal label="สร้างใบสั่งซื้อ" maxWidth="max-w-5xl" onClose={() => setPurchaseOrderOpen(false)}><PurchaseOrderCreateDialog rows={inventoryRows} suppliers={suppliers} onCreate={onCreatePurchaseOrder} onClose={() => setPurchaseOrderOpen(false)} /></Modal> : null}
      {receivingOpen ? <Modal label="รับวัตถุดิบเข้าคลัง" maxWidth="max-w-6xl" onClose={() => setReceivingOpen(false)}><StockReceivingPanel rows={inventoryRows} suppliers={suppliers} receipts={receipts} onCreateSupplier={onCreateSupplier} onCreateReceipt={onCreateReceipt} onClose={() => setReceivingOpen(false)} /></Modal> : null}
    </div>
  );
}

function AlertsPage({ products, inventoryRows, inventoryLots, suppliers, purchaseOrders, onNavigate, onCreatePurchaseOrder, onUpdatePurchaseOrderStatus, onReceivePurchaseOrder }) {
  const [filter, setFilter] = useState("all");
  const alerts = useMemo(
    () => storeAlertsFor({ products, inventoryRows, inventoryLots }),
    [products, inventoryRows, inventoryLots],
  );
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = alerts.filter((alert) => alert.severity === "warning").length;
  const visibleAlerts = filter === "all" ? alerts : alerts.filter((alert) => alert.severity === filter);
  const filters = [
    ["all", "ทั้งหมด", alerts.length],
    ["critical", "เร่งด่วน", criticalCount],
    ["warning", "ต้องติดตาม", warningCount],
  ];
  return (
    <div className="space-y-5">
      <Heading
        title="การแจ้งเตือน"
        description="รวมสัญญาณที่ต้องดำเนินการจากเมนู วัตถุดิบ และล็อตคงเหลือ"
        action={<span className={`rounded-full px-3 py-2 text-xs font-bold ${criticalCount ? "bg-rose-50 text-rose-700" : alerts.length ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{criticalCount ? `${criticalCount} รายการเร่งด่วน` : alerts.length ? `${alerts.length} รายการต้องติดตาม` : "● ทุกอย่างปกติ"}</span>}
      />
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["ทั้งหมด", alerts.length, "bg-sky-50 text-sky-700"],
          ["เร่งด่วน", criticalCount, "bg-rose-50 text-rose-700"],
          ["ต้องติดตาม", warningCount, "bg-amber-50 text-amber-700"],
        ].map(([label, count, tone]) => (
          <div className={`rounded-2xl p-4 ${tone}`} key={label}>
            <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-75">{label}</p>
            <strong className="mt-1 block text-3xl">{count}</strong>
            <p className="mt-1 text-xs">รายการ</p>
          </div>
        ))}
      </section>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">รายการที่ต้องดำเนินการ</h2>
            <p className="mt-1 text-sm text-slate-500">ข้อมูลจะเปลี่ยนตามยอดสต็อกและล็อตล่าสุด</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map(([value, label, count]) => (
              <Button key={value} type="button" variant={filter === value ? "primary" : "secondary"} className="text-xs" onClick={() => setFilter(value)}>
                {label} {count}
              </Button>
            ))}
          </div>
        </div>
        <div className="mt-5 grid gap-3">
          {visibleAlerts.length ? visibleAlerts.map((alert) => {
            const critical = alert.severity === "critical";
            return (
              <article className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center ${critical ? "border-rose-200 bg-rose-50/50" : "border-amber-200 bg-amber-50/45"}`} key={alert.id}>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg ${critical ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{critical ? "!" : "⚠"}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${critical ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{alert.category}</span>
                    <h3 className="truncate font-bold text-slate-900">{alert.title}</h3>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{alert.detail}</p>
                </div>
                <Button type="button" variant="secondary" className="shrink-0 text-xs" onClick={() => onNavigate(alert.target)}>{alert.action}</Button>
              </article>
            );
          }) : <Empty>ไม่มีรายการในตัวกรองนี้</Empty>}
        </div>
      </Card>
      <PurchaseRecommendationPanel inventoryRows={inventoryRows} suppliers={suppliers} onNavigate={onNavigate} onCreatePurchaseOrder={onCreatePurchaseOrder} />
      <PurchaseOrderHistory orders={purchaseOrders} onUpdateStatus={onUpdatePurchaseOrderStatus} onReceive={onReceivePurchaseOrder} />
    </div>
  );
}

const exportInventory = (rows) =>
  exportExcel({
    filename: `stockpos-inventory-${todayInBangkok()}.xlsx`,
    sheets: [
      {
        name: "วัตถุดิบ",
        columns: [
          { key: "id", label: "รหัส" },
          { key: "name", label: "ชื่อวัตถุดิบ" },
          { key: "unit", label: "หน่วย" },
          { key: "quantity", label: "จำนวนคงเหลือ" },
          { key: "cost", label: "ต้นทุนต่อหน่วย" },
          { key: "value", label: "มูลค่าคงเหลือ" },
          { key: "minimum", label: "แจ้งเตือนเมื่อเหลือ" },
          { key: "status", label: "สถานะ" },
          { key: "expiry", label: "วันหมดอายุ" },
        ],
        rows: rows.map((item) => {
          const quantity = Number(item.stock_qty ?? item.stock ?? 0);
          const cost = Number(item.cost_per_unit || 0);
          return {
            id: item.id ?? item.code ?? "",
            name: item.name || "",
            unit: item.unit || "",
            quantity,
            cost,
            value: quantity * cost,
            minimum: Number(item.min_stock_alert || 0),
            status: inventoryIsLow(item) ? "ใกล้หมด" : "ปกติ",
            expiry: String(item.expiry_date || "").slice(0, 10),
          };
        }),
      },
    ],
  });

const exportFinance = ({ selectedDate, orders, expenses, summary, salesBreakdown }) =>
  exportExcel({
    filename: `stockpos-finance-${selectedDate}.xlsx`,
    sheets: [
      {
        name: "สรุปการเงิน",
        columns: [
          { key: "label", label: "รายการ" },
          { key: "value", label: "จำนวนเงิน / ค่า" },
        ],
        rows: [
          { label: "วันที่", value: selectedDate },
          { label: "จำนวนรายการขาย", value: orders.length },
          { label: "ยอดขายรวม", value: summary.gross },
          { label: "ยอดสุทธิ", value: summary.net },
          { label: "ต้นทุนสินค้า", value: summary.cogs },
          { label: "ค่าใช้จ่าย", value: summary.expenses },
          { label: "กำไรสุทธิ", value: summary.profit },
        ],
      },
      {
        name: "รายการขาย",
        columns: [
          { key: "date", label: "วันที่" },
          { key: "orderNo", label: "เลขที่ออเดอร์" },
          { key: "channel", label: "ช่องทาง" },
          { key: "status", label: "สถานะ" },
          { key: "items", label: "รายการสินค้า" },
          { key: "gross", label: "ยอดขายรวม" },
          { key: "net", label: "ยอดสุทธิ" },
          { key: "cogs", label: "ต้นทุนสินค้า" },
          { key: "profit", label: "กำไร" },
        ],
        rows: orders.map((order) => {
          const totals = orderNetAmounts(order);
          return {
            date: bangkokDate(order.created_at) || selectedDate,
            orderNo: order.order_no || "",
            channel: order.channel_name || "",
            status: order.status || "",
            items: order.items || "",
            gross: totals.gross,
            net: totals.net,
            cogs: totals.cogs,
            profit: totals.profit,
          };
        }),
      },
      {
        name: "ค่าใช้จ่าย",
        columns: [
          { key: "date", label: "วันที่" },
          { key: "category", label: "ประเภท" },
          { key: "description", label: "รายละเอียด" },
          { key: "amount", label: "จำนวนเงิน" },
        ],
        rows: expenses.map((item) => ({
          date: bangkokDate(item.created_at) || selectedDate,
          category:
            item.category === "DELIVERY_COST"
              ? "ค่าขนส่ง"
              : "ค่าใช้จ่ายดำเนินงาน",
          description: item.description || "",
          amount: Number(item.amount || 0),
        })),
      },
      {
        name: "ยอดตามช่องทาง",
        columns: [
          { key: "channel", label: "ช่องทางขาย" },
          { key: "orders", label: "จำนวนออเดอร์" },
          { key: "gross", label: "ยอดขายรวม" },
          { key: "net", label: "รายรับสุทธิ" },
        ],
        rows: (salesBreakdown?.channels || []).map((item) => ({
          channel: item.channel_name || "ไม่ระบุช่องทาง",
          orders: Number(item.order_count || 0),
          gross: Number(item.gross_amount || 0),
          net: Number(item.net_revenue || 0),
        })),
      },
      {
        name: "วิธีชำระเงิน",
        columns: [
          { key: "method", label: "วิธีชำระเงิน" },
          { key: "orders", label: "จำนวนออเดอร์" },
          { key: "amount", label: "ยอดรับชำระ" },
          { key: "change", label: "เงินทอน" },
        ],
        rows: (salesBreakdown?.payments || []).map((item) => ({
          method: paymentMethodLabel(item.payment_method),
          orders: Number(item.order_count || 0),
          amount: Number(item.payment_amount || 0),
          change: Number(item.change_amount || 0),
        })),
      },
    ],
  });

const paymentMethodLabel = (value) => ({
  CASH: "เงินสด",
  QR: "QR พร้อมเพย์",
  TRANSFER: "โอนเงิน",
  CARD: "บัตร",
  OTHER: "อื่น ๆ",
}[value] || "อื่น ๆ");

const blankCoupon = () => ({
  code: "",
  discount_type: "PERCENT",
  discount_value: "",
  min_order_amount: "",
  max_discount_amount: "",
  usage_limit: "",
  valid_from: "",
  valid_until: "",
  is_active: true,
});

function CouponManagementPanel({ coupons, onCreate, onUpdate }) {
  const [coupon, setCoupon] = useState(blankCoupon);
  const [editingId, setEditingId] = useState(null);
  const [couponModalOpen, setCouponModalOpen] = useState(false);
  const today = todayInBangkok();
  const couponPayload = (value) => ({
    code: value.code.trim().toUpperCase(),
    discount_type: value.discount_type,
    discount_value: Number(value.discount_value),
    min_order_amount: Number(value.min_order_amount || 0),
    max_discount_amount: value.max_discount_amount === "" ? null : Number(value.max_discount_amount),
    usage_limit: value.usage_limit === "" ? null : Number(value.usage_limit),
    valid_from: value.valid_from ? `${value.valid_from}T00:00:00+07:00` : null,
    valid_until: value.valid_until ? `${value.valid_until}T23:59:59+07:00` : null,
    is_active: Boolean(value.is_active),
  });
  const submit = async (event) => {
    event.preventDefault();
    const saved = editingId
      ? await onUpdate?.(editingId, couponPayload(coupon))
      : await onCreate?.(couponPayload(coupon));
    if (!saved) return;
    setCoupon(blankCoupon());
    setEditingId(null);
    setCouponModalOpen(false);
  };
  const edit = (item) => {
    setEditingId(item.id);
    setCoupon({
      code: item.code || "",
      discount_type: item.discount_type || "PERCENT",
      discount_value: String(item.discount_value ?? ""),
      min_order_amount: String(item.min_order_amount ?? ""),
      max_discount_amount: item.max_discount_amount == null ? "" : String(item.max_discount_amount),
      usage_limit: item.usage_limit == null ? "" : String(item.usage_limit),
      valid_from: item.valid_from ? bangkokDate(item.valid_from) : "",
      valid_until: item.valid_until ? bangkokDate(item.valid_until) : "",
      is_active: item.is_active !== false,
    });
    setCouponModalOpen(true);
  };
  const setValue = (field, value) => setCoupon((current) => ({ ...current, [field]: value }));
  const openCreate = () => {
    setCoupon(blankCoupon());
    setEditingId(null);
    setCouponModalOpen(true);
  };
  const toggleAvailability = async (item) => {
    await onUpdate?.(item.id, {
      code: item.code,
      discount_type: item.discount_type,
      discount_value: Number(item.discount_value),
      min_order_amount: Number(item.min_order_amount || 0),
      max_discount_amount: item.max_discount_amount ?? null,
      usage_limit: item.usage_limit ?? null,
      valid_from: item.valid_from || null,
      valid_until: item.valid_until || null,
      is_active: !item.is_active,
    });
  };
  return (
    <section className="space-y-5">
      {couponModalOpen ? (
      <Modal label={editingId ? "แก้ไขคูปอง" : "สร้างคูปอง"} maxWidth="max-w-2xl" onClose={() => { setCoupon(blankCoupon()); setEditingId(null); setCouponModalOpen(false); }}>
      <Card className="border-violet-200 bg-violet-50/30">
        <h2 className="text-lg font-bold text-slate-900">{editingId ? "แก้ไขคูปอง" : "สร้างคูปอง"}</h2>
        <p className="mt-1 text-sm text-slate-500">กำหนดส่วนลด เงื่อนไข และช่วงเวลาการใช้งาน</p>
        <form className="mt-4 grid gap-3" onSubmit={submit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>
              รหัสคูปอง
              <input className={inputClass} value={coupon.code} maxLength="64" onChange={(event) => setValue("code", event.target.value.toUpperCase())} placeholder="เช่น WELCOME10" required />
            </label>
            <label className={labelClass}>
              รูปแบบส่วนลด
              <select className={inputClass} value={coupon.discount_type} onChange={(event) => setValue("discount_type", event.target.value)}>
                <option value="PERCENT">เปอร์เซ็นต์ (%)</option>
                <option value="AMOUNT">จำนวนเงิน (บาท)</option>
              </select>
            </label>
            <label className={labelClass}>
              {coupon.discount_type === "PERCENT" ? "ส่วนลด (%)" : "ส่วนลด (บาท)"}
              <input className={inputClass} type="number" min="0.01" max={coupon.discount_type === "PERCENT" ? "100" : undefined} step="0.01" inputMode="decimal" value={coupon.discount_value} onChange={(event) => setValue("discount_value", event.target.value)} required />
            </label>
            <label className={labelClass}>
              ยอดสั่งซื้อขั้นต่ำ (บาท)
              <input className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" value={coupon.min_order_amount} onChange={(event) => setValue("min_order_amount", event.target.value)} placeholder="ไม่กำหนด" />
            </label>
            <label className={labelClass}>
              ลดสูงสุด (บาท) <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
              <input className={inputClass} type="number" min="0.01" step="0.01" inputMode="decimal" value={coupon.max_discount_amount} onChange={(event) => setValue("max_discount_amount", event.target.value)} placeholder="ไม่กำหนด" />
            </label>
            <label className={labelClass}>
              จำนวนสิทธิ์ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
              <input className={inputClass} type="number" min="1" step="1" inputMode="numeric" value={coupon.usage_limit} onChange={(event) => setValue("usage_limit", event.target.value)} placeholder="ไม่จำกัด" />
            </label>
            <label className={labelClass}>
              เริ่มใช้วันที่ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
              <input className={inputClass} type="date" value={coupon.valid_from} onChange={(event) => setValue("valid_from", event.target.value)} />
            </label>
            <label className={labelClass}>
              ใช้ได้ถึงวันที่ <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
              <input className={inputClass} type="date" value={coupon.valid_until} onChange={(event) => setValue("valid_until", event.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input className="h-4 w-4 accent-violet-600" type="checkbox" checked={coupon.is_active} onChange={(event) => setValue("is_active", event.target.checked)} />
            เปิดใช้คูปองทันที
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" className="bg-violet-600 hover:bg-violet-700 focus:ring-violet-200">{editingId ? "บันทึกการแก้ไข" : "สร้างคูปอง"}</Button>
            <Button type="button" variant="secondary" onClick={() => { setCoupon(blankCoupon()); setEditingId(null); setCouponModalOpen(false); }}>ยกเลิก</Button>
          </div>
        </form>
      </Card>
      </Modal>
      ) : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">คูปองในระบบ</h2>
          </div>
          <div className="flex items-center gap-2"><span className="rounded-full bg-violet-50 px-3 py-1.5 text-sm font-bold text-violet-700">{coupons.length} รายการ</span><Button type="button" onClick={openCreate}>+ สร้างคูปอง</Button></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {coupons.length ? coupons.map((item) => {
            const startsLater = item.valid_from && bangkokDate(item.valid_from) > today;
            const expired = item.valid_until && bangkokDate(item.valid_until) < today;
            const exhausted = item.usage_limit !== null && Number(item.used_count || 0) >= Number(item.usage_limit);
            const available = item.is_active && !startsLater && !expired && !exhausted;
            return (
              <article className="rounded-2xl border border-violet-100 bg-white p-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-base font-black tracking-wide text-violet-700">{item.code}</p>
                    <p className="mt-1 text-sm font-bold text-slate-800">ลด {item.discount_type === "PERCENT" ? `${Number(item.discount_value)}%` : money(item.discount_value)}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${available ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{available ? "ใช้งานได้" : expired ? "หมดอายุ" : startsLater ? "รอเริ่ม" : exhausted ? "ใช้ครบ" : "ปิดใช้งาน"}</span>
                </div>
                <p className="mt-3 text-xs text-slate-500">ขั้นต่ำ {money(item.min_order_amount)}{Number(item.max_discount_amount || 0) > 0 ? ` · ลดสูงสุด ${money(item.max_discount_amount)}` : ""}</p>
                <p className="mt-1 text-xs text-slate-500">ใช้แล้ว {Number(item.used_count || 0)}{item.usage_limit !== null ? ` / ${item.usage_limit}` : " ครั้ง · ไม่จำกัดสิทธิ์"}</p>
                <p className="mt-1 text-xs text-slate-500">{item.valid_from || item.valid_until ? `${item.valid_from ? `เริ่ม ${dateLabel(bangkokDate(item.valid_from))}` : "เริ่มได้ทันที"}${item.valid_until ? ` · ถึง ${dateLabel(bangkokDate(item.valid_until))}` : ""}` : "ไม่กำหนดช่วงเวลา"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" className="text-xs" onClick={() => edit(item)}>แก้ไข</Button>
                  <Button type="button" variant={item.is_active ? "danger" : "secondary"} className="text-xs" onClick={() => toggleAvailability(item)}>{item.is_active ? "ปิดใช้" : "เปิดใช้"}</Button>
                </div>
              </article>
            );
          }) : <Empty>ยังไม่มีคูปอง กด “สร้างคูปอง” เพื่อเพิ่มรายการแรก</Empty>}
        </div>
      </Card>
    </section>
  );
}

function CouponPage({ coupons, onCreateCoupon, onUpdateCoupon }) {
  return (
    <div className="space-y-5">
      <Heading
        title="จัดการคูปอง"
        description="สร้าง แก้ไข เปิดหรือปิดคูปอง และกำหนดเงื่อนไขการใช้งาน"
      />
      <CouponManagementPanel
        coupons={coupons}
        onCreate={onCreateCoupon}
        onUpdate={onUpdateCoupon}
      />
    </div>
  );
}

function LoyaltySettingsPage({ settings, onSave }) {
  const defaults = { is_enabled: true, earn_enabled: true, redeem_enabled: true, earn_mode: "SPEND", spend_per_point: 25, cups_per_point: 1, baht_per_point: 0.1, max_redeem_percent: 50 };
  const [form, setForm] = useState({ ...defaults, ...settings });
  const [saving, setSaving] = useState(false);
  useEffect(() => setForm({ ...defaults, ...settings }), [settings]);
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await onSave?.({
        is_enabled: Boolean(form.earn_enabled || form.redeem_enabled),
        earn_enabled: Boolean(form.earn_enabled),
        redeem_enabled: Boolean(form.redeem_enabled),
        earn_mode: form.earn_mode,
        spend_per_point: Number(form.spend_per_point),
        cups_per_point: Number(form.cups_per_point),
        baht_per_point: Number(form.baht_per_point),
        max_redeem_percent: Number(form.max_redeem_percent),
      });
    } finally {
      setSaving(false);
    }
  };
  const spendPerPoint = Math.max(0.01, Number(form.spend_per_point) || 0);
  const cupsPerPoint = Math.max(1, Number(form.cups_per_point) || 0);
  const bahtPerPoint = Math.max(0, Number(form.baht_per_point) || 0);
  const maxRedeemPercent = Math.max(0, Math.min(100, Number(form.max_redeem_percent) || 0));
  return (
    <section className="space-y-5">
      <Heading
        title="ตั้งค่าคะแนนสะสม"
        description="กำหนดกติกาการได้รับและใช้คะแนนสำหรับคำสั่งซื้อใหม่"
      />
      <form onSubmit={save}>
        <Card className="max-w-3xl border-violet-100 bg-white">
          <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-2xl bg-violet-50 p-4 text-sm text-slate-700">
            <input
              className="mt-0.5 h-4 w-4 accent-violet-600"
              type="checkbox"
              checked={form.earn_enabled !== false}
              onChange={(event) => setForm((current) => ({ ...current, earn_enabled: event.target.checked }))}
            />
            <span><strong className="block text-violet-900">เปิดรับคะแนนสะสม</strong><span className="mt-1 block text-xs text-violet-700">เมื่อปิด คำสั่งซื้อใหม่จะไม่เพิ่มคะแนนให้ลูกค้า</span></span>
          </label>
          <label className="flex items-start gap-3 rounded-2xl bg-violet-50 p-4 text-sm text-slate-700">
            <input
              className="mt-0.5 h-4 w-4 accent-violet-600"
              type="checkbox"
              checked={form.redeem_enabled !== false}
              onChange={(event) => setForm((current) => ({ ...current, redeem_enabled: event.target.checked }))}
            />
            <span><strong className="block text-violet-900">เปิดใช้คะแนนเป็นส่วนลด</strong><span className="mt-1 block text-xs text-violet-700">เมื่อปิด ลูกค้ายังมีคะแนนเดิม แต่ใช้แลกส่วนลดไม่ได้</span></span>
          </label>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <label className={labelClass}>
              รูปแบบการได้รับคะแนน
              <select className={inputClass} value={form.earn_mode} onChange={(event) => setForm((current) => ({ ...current, earn_mode: event.target.value }))} disabled={form.earn_enabled === false}>
                <option value="SPEND">สะสมตามยอดซื้อ</option>
                <option value="CUP">สะสมตามจำนวนแก้ว</option>
              </select>
            </label>
            {form.earn_mode === "CUP" ? (
              <label className={labelClass}>
                จำนวนแก้วที่ได้รับ 1 คะแนน
                <input className={inputClass} type="number" min="1" max="100000" step="1" inputMode="numeric" value={form.cups_per_point ?? ""} onChange={(event) => setForm((current) => ({ ...current, cups_per_point: event.target.value }))} required disabled={form.earn_enabled === false} />
              </label>
            ) : (
            <label className={labelClass}>
              ยอดซื้อที่ได้รับ 1 คะแนน (บาท)
              <input className={inputClass} type="number" min="0.01" max="1000000" step="0.01" inputMode="decimal" value={form.spend_per_point ?? ""} onChange={(event) => setForm((current) => ({ ...current, spend_per_point: event.target.value }))} required disabled={form.earn_enabled === false} />
            </label>
            )}
            <label className={labelClass}>
              มูลค่าส่วนลดต่อ 1 คะแนน (บาท)
              <input className={inputClass} type="number" min="0.01" max="100000" step="0.01" inputMode="decimal" value={form.baht_per_point ?? ""} onChange={(event) => setForm((current) => ({ ...current, baht_per_point: event.target.value }))} required disabled={form.redeem_enabled === false} />
            </label>
            <label className={labelClass}>
              ใช้คะแนนลดได้สูงสุดต่อคำสั่งซื้อ (%)
              <input className={inputClass} type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.max_redeem_percent ?? ""} onChange={(event) => setForm((current) => ({ ...current, max_redeem_percent: event.target.value }))} required disabled={form.redeem_enabled === false} />
            </label>
          </div>
          <div className="mt-5 rounded-2xl border border-sky-100 bg-sky-50/70 p-4 text-sm text-sky-900">
            {`${form.earn_enabled === false ? "ปิดรับคะแนน" : form.earn_mode === "CUP" ? `ซื้อ ${cupsPerPoint} แก้ว ได้ 1 คะแนน` : `ยอดซื้อ ${money(spendPerPoint)} ได้ 1 คะแนน`} · ${form.redeem_enabled === false ? "ปิดใช้คะแนนเป็นส่วนลด" : `10 คะแนนลดได้ ${money(bahtPerPoint * 10)} · ใช้ส่วนลดได้ไม่เกิน ${maxRedeemPercent}%`}`}
          </div>
          <div className="mt-5 flex justify-end"><Button type="submit" disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}</Button></div>
        </Card>
      </form>
    </section>
  );
}

function LoyaltyMembersPage({ members, onRefresh, onCreate, onUpdate, onDelete }) {
  const blankMember = () => ({ customer_name: "", customer_phone: "", points_balance: "0", opening_points: "0" });
  const [search, setSearch] = useState("");
  const [member, setMember] = useState(blankMember);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const refresh = async () => { setLoading(true); try { await onRefresh?.(search); } finally { setLoading(false); } };
  const openCreate = () => { setMember(blankMember()); setEditingId(null); setFormOpen(true); };
  const openEdit = (item) => {
    setEditingId(item.id);
    setMember({ customer_name: item.customer_name || "", customer_phone: item.customer_phone || "", points_balance: String(item.points_balance || 0), opening_points: "0" });
    setFormOpen(true);
  };
  const save = async (event) => {
    event.preventDefault();
    const payload = {
      customer_name: member.customer_name.trim(),
      customer_phone: member.customer_phone,
      ...(editingId ? { points_balance: Number(member.points_balance) } : { opening_points: Number(member.opening_points) }),
    };
    const saved = editingId ? await onUpdate?.(editingId, payload) : await onCreate?.(payload);
    if (saved) { setFormOpen(false); setEditingId(null); }
  };
  return (
    <section className="space-y-5">
      <Heading title="จัดการสมาชิก" description="ค้นหา เพิ่ม แก้ไข หรือลบข้อมูลสมาชิกและยอดคะแนนสะสม" action={<div className="flex gap-2"><Button type="button" variant="secondary" onClick={refresh} disabled={loading}>{loading ? "กำลังโหลด..." : "รีเฟรช"}</Button><Button type="button" onClick={openCreate}>+ เพิ่มสมาชิก</Button></div>} />
      <Card>
        <div className="flex flex-wrap gap-2">
          <input className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") refresh(); }} placeholder="ค้นหาชื่อหรือเบอร์สมาชิก" />
          <Button type="button" variant="secondary" onClick={refresh}>ค้นหา</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.length ? members.map((item) => (
            <article className="rounded-2xl border border-violet-100 bg-violet-50/35 p-4" key={item.id}>
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold text-slate-900">{item.customer_name || "ไม่ระบุชื่อ"}</h2><p className="mt-1 text-sm text-slate-600">{item.customer_phone}</p></div><strong className="shrink-0 text-lg text-violet-700">{Number(item.points_balance || 0).toLocaleString()} คะแนน</strong></div>
              <p className="mt-3 text-xs text-slate-500">สะสมทั้งหมด {Number(item.lifetime_points || 0).toLocaleString()} คะแนน · ซื้อ {Number(item.order_count || 0).toLocaleString()} ครั้ง</p>
              <div className="mt-3 flex flex-wrap gap-2"><Button type="button" className="text-xs" variant="secondary" onClick={() => openEdit(item)}>แก้ไข</Button><Button type="button" className="text-xs" variant="danger" onClick={() => onDelete?.(item)}>ลบ</Button></div>
            </article>
          )) : <Empty>ไม่พบข้อมูลสมาชิก</Empty>}
        </div>
      </Card>
      {formOpen ? <Modal label={editingId ? "แก้ไขสมาชิก" : "เพิ่มสมาชิก"} maxWidth="max-w-xl" onClose={() => setFormOpen(false)}><Card>
        <h2 className="text-lg font-bold text-slate-900">{editingId ? "แก้ไขสมาชิก" : "เพิ่มสมาชิก"}</h2>
        <form className="mt-5 grid gap-4" onSubmit={save}>
          <label className={labelClass}>ชื่อสมาชิก<input className={inputClass} value={member.customer_name} maxLength="120" onChange={(event) => setMember((current) => ({ ...current, customer_name: event.target.value }))} placeholder="ไม่บังคับ" /></label>
          <label className={labelClass}>เบอร์สมาชิก<input className={inputClass} inputMode="tel" value={member.customer_phone} maxLength="20" onChange={(event) => setMember((current) => ({ ...current, customer_phone: event.target.value }))} required /></label>
          {editingId ? <label className={labelClass}>คะแนนคงเหลือ<input className={inputClass} type="number" min="0" step="1" value={member.points_balance} onChange={(event) => setMember((current) => ({ ...current, points_balance: event.target.value }))} required /></label> : <label className={labelClass}>คะแนนเริ่มต้น<input className={inputClass} type="number" min="0" step="1" value={member.opening_points} onChange={(event) => setMember((current) => ({ ...current, opening_points: event.target.value }))} required /></label>}
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>ยกเลิก</Button><Button type="submit">บันทึก</Button></div>
        </form>
      </Card></Modal> : null}
    </section>
  );
}

function RolePermissionsPage({ profiles, users, onRefresh, onSave, onCreate, onDelete, onRefreshUsers, onAssignUserRole }) {
  const menus = [
    ["pos", "การขายหน้าร้าน"],
    ["orders", "คำสั่งซื้อ"],
    ["kitchen", "จอเตรียมสินค้า"],
    ["operations", "ภาพรวมการดำเนินงาน"],
    ["cash-shifts", "กะเงินสด"], ["alerts", "การแจ้งเตือน"], ["inventory", "วัตถุดิบ"], ["menu", "เมนูสินค้า"], ["procurement", "การจัดซื้อ"], ["sales-channels", "ช่องทางการขาย"], ["coupons", "คูปอง"], ["loyalty-settings", "ตั้งค่าคะแนน"], ["loyalty-members", "สมาชิก"], ["role-permissions", "จัดการสิทธิ์บทบาท"], ["audit-logs", "ประวัติการแก้ไข"], ["finance", "การเงิน"], ["business-reports", "รายงาน"],
  ];
  const actions = [["view", "ดู"], ["create", "สร้าง"], ["update", "แก้ไข"], ["delete", "ลบ"]];
  const [selectedRole, setSelectedRole] = useState("STAFF");
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ role: "", display_name: "", base_role: "STAFF" });
  const profile = profiles.find((item) => item.role === selectedRole);
  useEffect(() => setPermissions(profile?.permissions || {}), [profile]);
  const toggle = (menu, action) => setPermissions((current) => ({ ...current, [menu]: { ...(current[menu] || {}), [action]: !current?.[menu]?.[action] } }));
  const save = async () => { setSaving(true); try { await onSave?.(selectedRole, permissions); } finally { setSaving(false); } };
  const create = async (event) => { event.preventDefault(); const created = await onCreate?.(newRole); if (created) { setSelectedRole(created.role); setCreateOpen(false); setNewRole({ role: "", display_name: "", base_role: "STAFF" }); } };
  const isSystemRole = ["ADMIN", "STAFF", "USER"].includes(selectedRole);
  return (
    <section className="space-y-5">
      <Heading title="จัดการสิทธิ์บทบาท" description="สร้างบทบาทกำหนดเอง กำหนดสิทธิ์ และนำไปใช้กับบัญชีผู้ใช้งาน" action={<div className="flex gap-2"><Button type="button" variant="secondary" onClick={onRefresh}>รีเฟรช</Button><Button type="button" onClick={() => setCreateOpen(true)}>+ เพิ่มบทบาท</Button></div>} />
      <Card className="max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3"><label className={`${labelClass} max-w-xs`}>บทบาท<select className={inputClass} value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>{profiles.map((item) => <option value={item.role} key={item.role}>{item.display_name || item.role} ({item.role})</option>)}</select></label><div className="flex items-center gap-2"><p className="text-xs text-slate-500">{isSystemRole ? "บทบาทระบบไม่สามารถลบได้" : `พื้นฐาน ${profile?.base_role || "STAFF"}`}</p>{!isSystemRole ? <Button type="button" variant="danger" className="text-xs" onClick={() => onDelete?.(profile)}>ลบบทบาท</Button> : null}</div></div>
        <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr className="border-b border-sky-100 text-left text-xs text-slate-500"><th className="p-3">เมนู</th>{actions.map(([, label]) => <th className="p-3 text-center" key={label}>{label}</th>)}</tr></thead><tbody>{menus.map(([menu, label]) => <tr className="border-b border-slate-100" key={menu}><td className="p-3 font-semibold text-slate-800">{label}</td>{actions.map(([action]) => <td className="p-3 text-center" key={action}><input className="h-4 w-4 accent-sky-600" type="checkbox" checked={permissions?.[menu]?.[action] === true} onChange={() => toggle(menu, action)} /></td>)}</tr>)}</tbody></table></div>
        <div className="mt-5 flex justify-end"><Button type="button" disabled={saving} onClick={save}>{saving ? "กำลังบันทึก..." : "บันทึกสิทธิ์"}</Button></div>
      </Card>
      <Card className="max-w-5xl">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">กำหนดบทบาทให้บัญชี</h2><p className="mt-1 text-xs text-slate-500">การเปลี่ยนบทบาทจะมีผลเมื่อบัญชีนั้นเข้าสู่ระบบใหม่</p></div><Button type="button" variant="secondary" onClick={onRefreshUsers}>รีเฟรชบัญชี</Button></div>
        <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b border-sky-100 text-left text-xs text-slate-500"><th className="p-3">บัญชี</th><th className="p-3">เบอร์โทร</th><th className="p-3">บทบาท</th></tr></thead><tbody>{users.map((user) => <tr className="border-b border-slate-100" key={user.id}><td className="p-3"><b className="text-slate-800">{user.name}</b><span className="ml-2 text-xs text-slate-500">@{user.username}</span></td><td className="p-3 text-slate-600">{user.phone || "-"}</td><td className="p-3"><select className={`${inputClass} max-w-xs py-2`} value={String(user.role_key || user.role).toUpperCase()} onChange={(event) => onAssignUserRole?.(user.id, event.target.value)}>{profiles.map((item) => <option value={item.role} key={item.role}>{item.display_name || item.role}</option>)}</select></td></tr>)}</tbody></table></div>
      </Card>
      {createOpen ? <Modal label="เพิ่มบทบาท" maxWidth="max-w-xl" onClose={() => setCreateOpen(false)}><Card><h2 className="text-lg font-bold text-slate-900">เพิ่มบทบาท</h2><form className="mt-5 grid gap-4" onSubmit={create}><label className={labelClass}>ชื่อบทบาท<input className={inputClass} value={newRole.display_name} maxLength="80" onChange={(event) => setNewRole((current) => ({ ...current, display_name: event.target.value }))} placeholder="เช่น แคชเชียร์" required /></label><label className={labelClass}>รหัสบทบาท<input className={inputClass} value={newRole.role} maxLength="32" onChange={(event) => setNewRole((current) => ({ ...current, role: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") }))} placeholder="CASHIER" required /></label><label className={labelClass}>บทบาทพื้นฐาน<select className={inputClass} value={newRole.base_role} onChange={(event) => setNewRole((current) => ({ ...current, base_role: event.target.value }))}><option value="ADMIN">Admin</option><option value="STAFF">Staff</option><option value="USER">User</option></select><span className="text-xs font-normal text-slate-500">เลือก Admin เฉพาะบทบาทผู้จัดการ แล้วกำหนดสิทธิ์รายเมนูให้เหมาะสม</span></label><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>ยกเลิก</Button><Button type="submit">เพิ่มบทบาท</Button></div></form></Card></Modal> : null}
    </section>
  );
}

function DeletedSnapshotModal({ item, onClose }) {
  const snapshot = item?.request_summary?.deleted || {};
  const resource = String(item?.resource || "");
  const isOrder = resource.startsWith("orders/");
  const isProduct = resource.startsWith("products/");
  const isInventory = resource.startsWith("inventory/");
  const isExpense = resource.startsWith("expenses/");
  const isMember = resource === "admin/loyalty-members";
  const isRole = resource === "admin/role-permissions";
  const display = (value, fallback = "ไม่ระบุ") => value === null || value === undefined || value === "" ? fallback : String(value);
  const field = (label, value, className = "") => <div className={`rounded-xl border border-sky-100 bg-sky-50/50 p-3 ${className}`} key={label}><p className="text-[11px] font-bold text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{display(value)}</p></div>;
  const items = Array.isArray(snapshot.items) ? snapshot.items : [];
  const title = isOrder ? `คำสั่งซื้อ ${display(snapshot.order_no, "")}` : isProduct ? `เมนู ${display(snapshot.name, "")}` : isInventory ? `วัตถุดิบ ${display(snapshot.name, "")}` : isExpense ? "รายการค่าใช้จ่าย" : isMember ? `สมาชิก ${display(snapshot.customer_name, "")}` : isRole ? `บทบาท ${display(snapshot.display_name || snapshot.role, "")}` : "ข้อมูลก่อนลบ";

  return (
    <Modal label="ข้อมูลก่อนลบ" maxWidth="max-w-3xl" onClose={onClose}>
      <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto bg-white">
        <div className="pr-10">
          <p className="text-xs font-bold text-rose-600">รายการที่ถูกลบ</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">บันทึกเมื่อ {dateTimeLabel(item?.created_at)} · โดย {item?.actor_name || "ระบบ"}</p>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {isOrder ? <>
            {field("เลขออเดอร์", snapshot.order_no)}
            {field("คิว", snapshot.queue_no ? `คิว ${snapshot.queue_no}` : null)}
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3"><p className="text-[11px] font-bold text-slate-500">สถานะก่อนลบ</p><div className="mt-2"><Status status={snapshot.status} /></div></div>
            {field("ลูกค้า", snapshot.customer_name)}
            {field("เบอร์โทร", snapshot.customer_phone)}
            {field("ช่องทางขาย", snapshot.channel_name || (snapshot.channel_id ? `ช่องทาง #${snapshot.channel_id}` : null))}
            {field("ยอดก่อนลด", money(snapshot.gross_amount))}
            {field("ส่วนลด", money(snapshot.discount_amount))}
            {field("ยอดสุทธิ", money(snapshot.net_amount))}
          </> : null}
          {isProduct ? <>
            {field("ชื่อเมนู", snapshot.name)}
            {field("หมวดหมู่", snapshot.category)}
            {field("บาร์โค้ด", snapshot.barcode)}
            {field("ราคาขายปลีก", money(snapshot.price_retail))}
            {field("ราคาขายส่ง", money(snapshot.price_wholesale))}
            {field("สถานะขาย", snapshot.is_sold_out ? "ปิดการขาย" : "พร้อมขาย")}
            {field("นับเป็นแก้วสะสมแต้ม", snapshot.counts_as_loyalty_cup ? "นับ" : "ไม่นับ")}
          </> : null}
          {isInventory ? <>
            {field("ชื่อวัตถุดิบ", snapshot.name)}
            {field("หน่วย", snapshot.unit)}
            {field("คงเหลือ", `${display(snapshot.stock_qty, "0")} ${snapshot.unit || ""}`)}
            {field("ต้นทุนต่อหน่วย", money(snapshot.cost_per_unit))}
            {field("แจ้งเตือนเมื่อเหลือ", `${display(snapshot.min_stock_alert, "0")} ${snapshot.unit || ""}`)}
            {field("วันหมดอายุ", snapshot.expiry_date ? dateTimeLabel(snapshot.expiry_date) : null)}
          </> : null}
          {isExpense ? <>
            {field("หมวดค่าใช้จ่าย", snapshot.category)}
            {field("จำนวนเงิน", money(snapshot.amount))}
            {field("รายละเอียด", snapshot.description, "sm:col-span-2")}
            {field("วันที่บันทึก", snapshot.created_at ? dateTimeLabel(snapshot.created_at) : null)}
          </> : null}
          {isMember ? <>
            {field("ชื่อลูกค้า", snapshot.customer_name)}
            {field("เบอร์โทร", snapshot.customer_phone)}
            {field("เลขสมาชิก", snapshot.member_code)}
            {field("คะแนนคงเหลือ", snapshot.points_balance)}
            {field("ยอดใช้จ่ายสะสม", money(snapshot.lifetime_spend))}
            {field("จำนวนคำสั่งซื้อ", snapshot.order_count)}
          </> : null}
          {isRole ? <>
            {field("ชื่อบทบาท", snapshot.display_name)}
            {field("รหัสบทบาท", snapshot.role)}
            {field("อ้างอิงสิทธิ์พื้นฐาน", snapshot.base_role)}
            {field("สิทธิ์ที่กำหนด", Array.isArray(snapshot.permissions) ? `${snapshot.permissions.length} รายการ` : null)}
          </> : null}
          {!isOrder && !isProduct && !isInventory && !isExpense && !isMember && !isRole ? field("ข้อมูลอ้างอิง", snapshot.name || snapshot.id || "บันทึกข้อมูลเดิมแล้ว") : null}
        </div>

        {isOrder && items.length ? <section className="mt-5 rounded-2xl border border-sky-100 p-3 sm:p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-bold text-slate-800">รายการสินค้า</h3><span className="text-xs text-slate-500">{items.length} รายการ</span></div><div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1">{items.map((line, index) => { const modifiers = Array.isArray(line.modifiers) ? line.modifiers : []; return <div className="rounded-xl bg-slate-50 p-3" key={`${line.product_name || "item"}-${index}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-800">{line.product_name || "สินค้า"}</p>{modifiers.length ? <p className="mt-1 text-xs text-slate-500">{modifiers.map((modifier) => modifier.option_name || modifier.name).filter(Boolean).join(" · ")}</p> : null}</div><p className="shrink-0 text-sm font-bold text-sky-700">{display(line.quantity, "0")} × {money(line.unit_price)}</p></div></div>; })}</div></section> : null}
      </Card>
    </Modal>
  );
}

function AuditLogPage({ onLoad }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detailItem, setDetailItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    setLoading(true);
    const nextLogs = await onLoad?.(200, {
      scope: "all",
      search: search.trim() || undefined,
      from: from || undefined,
      to: to || undefined,
    });
    setLogs(Array.isArray(nextLogs) ? nextLogs : []);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, [onLoad]);
  const eventFor = (item) => {
    const resource = String(item.resource || "");
    if (item.action === "DELETE") {
      if (resource === "admin/loyalty-members") return { key: "DELETE", label: "ลบสมาชิก" };
      if (resource === "admin/role-permissions") return { key: "DELETE", label: "ลบบทบาท" };
      if (resource.startsWith("products/")) return { key: "DELETE", label: "ลบเมนูสินค้า" };
      if (resource.startsWith("inventory/")) return { key: "DELETE", label: "ลบวัตถุดิบ" };
      if (resource.startsWith("expenses/")) return { key: "DELETE", label: "ลบค่าใช้จ่าย" };
      if (resource.startsWith("orders/")) return { key: "DELETE", label: "ลบคำสั่งซื้อ" };
      return { key: "DELETE", label: `ลบข้อมูล · ${resource}` };
    }
    if (resource === "admin/loyalty-members") return { key: "LOYALTY", label: item.action === "DELETE" ? "ลบสมาชิก" : "แก้ไขข้อมูลหรือคะแนนสมาชิก" };
    if (resource === "admin/users") return { key: "ROLE", label: "เปลี่ยนบทบาทผู้ใช้งาน" };
    if (resource.startsWith("products/")) return { key: "PRICE", label: "แก้ไขราคาเมนู" };
    if (resource.startsWith("orders/")) return { key: "ORDER", label: "เปลี่ยนหรือยกเลิกคำสั่งซื้อ" };
    return { key: "OTHER", label: `${item.action} · ${resource}` };
  };
  const detailFor = (item) => {
    const details = item.request_summary && typeof item.request_summary === "object" ? item.request_summary : {};
    const deleted = details.deleted && typeof details.deleted === "object" ? details.deleted : null;
    const resource = String(item.resource || "");
    if (deleted) {
      const title = deleted.name || deleted.display_name || deleted.customer_name || deleted.order_no || deleted.category || deleted.role || deleted.id;
      return `ลบ ${title || "ข้อมูล"} · เก็บรายละเอียดเดิมแล้ว`;
    }
    if (resource === "admin/loyalty-members") return [details.customer_name, details.customer_phone, details.points_balance !== undefined ? `คะแนน ${details.points_balance}` : ""].filter(Boolean).join(" · ") || "อัปเดตข้อมูลสมาชิก";
    if (resource === "admin/users") return details.role_key ? `กำหนดบทบาท ${details.role_key}` : "อัปเดตบทบาทบัญชี";
    if (resource.startsWith("products/")) return details.price_retail !== undefined ? `ราคาขาย ${money(details.price_retail)}` : "อัปเดตเมนูสินค้า";
    if (resource.startsWith("orders/")) return details.status ? `สถานะ ${details.status}` : "อัปเดตคำสั่งซื้อ";
    return "อัปเดตข้อมูล";
  };
  const visibleLogs = logs.filter((item) => filter === "ALL" || eventFor(item).key === filter);
  const clearFilters = async () => {
    setSearch("");
    setFrom("");
    setTo("");
    setLoading(true);
    const nextLogs = await onLoad?.(200, { scope: "all" });
    setLogs(Array.isArray(nextLogs) ? nextLogs : []);
    setLoading(false);
  };
  return (
    <section className="space-y-5">
      <Heading title="ประวัติการแก้ไขข้อมูลสำคัญ" description="ติดตามการแก้คะแนนสมาชิก เปลี่ยนบทบาท ลบสมาชิก แก้ราคา และคำสั่งซื้อย้อนหลัง" action={<Button type="button" variant="secondary" onClick={refresh} disabled={loading}>{loading ? "กำลังโหลด..." : "รีเฟรช"}</Button>} />
      <Card>
        <form className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_170px_170px_auto_auto]" onSubmit={(event) => { event.preventDefault(); refresh(); }}>
          <input aria-label="ค้นหาประวัติการแก้ไข" className={inputClass} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาผู้ใช้ รายการ เลขอ้างอิง หรือข้อมูลเดิม" />
          <input aria-label="วันที่เริ่มต้น" className={inputClass} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <input aria-label="วันที่สิ้นสุด" className={inputClass} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Button type="submit" disabled={loading}>ค้นหา</Button>
          <Button type="button" variant="secondary" onClick={clearFilters}>ล้าง</Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">{[["ALL", "ทั้งหมด"], ["DELETE", "รายการที่ลบ"], ["LOYALTY", "สมาชิกและคะแนน"], ["ROLE", "บทบาท"], ["PRICE", "ราคาเมนู"], ["ORDER", "คำสั่งซื้อ"]].map(([key, label]) => <Button key={key} type="button" className="text-xs" variant={filter === key ? "primary" : "secondary"} onClick={() => setFilter(key)}>{label}</Button>)}</div>
        <p className="mt-3 text-xs text-slate-500">พบ {visibleLogs.length} รายการ · รายการที่ลบหลังจากอัปเดตระบบนี้จะแสดงข้อมูลก่อนลบให้ตรวจสอบได้</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[780px] text-sm"><thead><tr className="border-b border-sky-100 text-left text-xs text-slate-500"><th className="p-3">เหตุการณ์</th><th className="p-3">รายละเอียด</th><th className="p-3">ผู้ดำเนินการ</th><th className="p-3">เวลา</th><th className="p-3"></th></tr></thead><tbody>{visibleLogs.length ? visibleLogs.map((item) => { const event = eventFor(item); const hasSnapshot = Boolean(item.request_summary?.deleted); return <tr className="border-b border-slate-100" key={item.id}><td className="p-3 font-semibold text-slate-800">{event.label}</td><td className="max-w-xs p-3 text-slate-600">{detailFor(item)}</td><td className="p-3 text-slate-600">{item.actor_name || "ระบบ"}</td><td className="p-3 whitespace-nowrap text-slate-500">{dateTimeLabel(item.created_at)}</td><td className="p-3">{hasSnapshot ? <Button type="button" className="whitespace-nowrap text-xs" variant="secondary" onClick={() => setDetailItem(item)}>ดูข้อมูลเดิม</Button> : null}</td></tr>; }) : <tr><td className="p-8 text-center text-slate-500" colSpan="5">{loading ? "กำลังโหลดประวัติ..." : "ยังไม่มีประวัติที่ตรงกับตัวกรอง"}</td></tr>}</tbody></table></div>
      </Card>
      {detailItem ? <DeletedSnapshotModal item={detailItem} onClose={() => setDetailItem(null)} /> : null}
    </section>
  );
}

function SalesChannelsPage({ channels, onCreateChannel, onUpdateChannel }) {
  const blankChannel = () => ({ name: "", gp_percent: "0", is_active: true });
  const [channel, setChannel] = useState(blankChannel);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const resetForm = () => {
    setChannel(blankChannel());
    setEditingId(null);
    setFormOpen(false);
  };
  const save = async (event) => {
    event.preventDefault();
    const payload = {
      name: channel.name.trim(),
      gp_percent: Number(channel.gp_percent),
      is_active: Boolean(channel.is_active),
    };
    const saved = editingId
      ? await onUpdateChannel?.(editingId, payload)
      : await onCreateChannel?.(payload);
    if (saved) resetForm();
  };
  const edit = (item) => {
    setEditingId(item.id);
    setChannel({
      name: item.name || "",
      gp_percent: String(item.gp_percent ?? 0),
      is_active: item.is_active !== false,
    });
    setFormOpen(true);
  };
  const toggleActive = (item) => onUpdateChannel?.(item.id, {
    name: item.name,
    gp_percent: Number(item.gp_percent || 0),
    is_active: item.is_active === false,
  });
  return (
    <div className="space-y-5">
      <Heading
        title="จัดการช่องทางการขาย"
        description="กำหนดช่องทางที่เลือกได้ใน POS และเปอร์เซ็นต์ค่าธรรมเนียมที่หักจากรายรับ"
        action={<Button type="button" onClick={() => { setChannel(blankChannel()); setEditingId(null); setFormOpen(true); }}>+ เพิ่มช่องทางขาย</Button>}
      />
      <Card className="border-amber-200 bg-amber-50/50">
        <p className="text-sm font-semibold text-amber-900">ค่าธรรมเนียมมีผลกับรายรับสุทธิของออเดอร์ใหม่ เช่น GrabFood หรือ LINE MAN</p>
        <p className="mt-1 text-xs text-amber-700">การปิดใช้งานจะซ่อนช่องทางนั้นจากหน้า POS ของพนักงาน โดยไม่กระทบข้อมูลออเดอร์เดิม</p>
      </Card>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {channels.length ? channels.map((item) => {
          const active = item.is_active !== false;
          return (
            <Card className={active ? "" : "border-slate-200 bg-slate-50/70"} key={item.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{item.name}</h2>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
              </div>
              <div className="mt-4 rounded-xl bg-sky-50/70 p-3">
                <p className="text-xs text-slate-500">ค่าธรรมเนียมช่องทาง</p>
                <strong className="mt-1 block text-2xl text-sky-700">{Number(item.gp_percent || 0)}%</strong>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" className="text-xs" variant="secondary" onClick={() => edit(item)}>แก้ไข</Button>
                <Button type="button" className="text-xs" variant={active ? "danger" : "secondary"} onClick={() => toggleActive(item)}>{active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</Button>
              </div>
            </Card>
          );
        }) : <Empty>ยังไม่มีช่องทางขาย เพิ่มรายการแรกเพื่อใช้งานใน POS</Empty>}
      </section>
      {formOpen ? (
        <Modal label={editingId ? "แก้ไขช่องทางขาย" : "เพิ่มช่องทางขาย"} maxWidth="max-w-xl" onClose={resetForm}>
          <Card className="border-sky-200 bg-white">
            <h2 className="text-lg font-bold text-slate-900">{editingId ? "แก้ไขช่องทางขาย" : "เพิ่มช่องทางขาย"}</h2>
            <p className="mt-1 text-sm text-slate-500">ตั้งชื่อช่องทางและค่าธรรมเนียมที่ระบบใช้คำนวณรายรับสุทธิ</p>
            <form className="mt-5 grid gap-4" onSubmit={save}>
              <label className={labelClass}>ชื่อช่องทางขาย<input className={inputClass} value={channel.name} maxLength="120" onChange={(event) => setChannel((current) => ({ ...current, name: event.target.value }))} placeholder="เช่น ShopeeFood" required /></label>
              <label className={labelClass}>ค่าธรรมเนียมช่องทาง (%)<input className={inputClass} type="number" min="0" max="100" step="0.01" inputMode="decimal" value={channel.gp_percent} onChange={(event) => setChannel((current) => ({ ...current, gp_percent: event.target.value }))} required /></label>
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input className="h-4 w-4 accent-sky-600" type="checkbox" checked={channel.is_active} onChange={(event) => setChannel((current) => ({ ...current, is_active: event.target.checked }))} />เปิดใช้งานใน POS ทันที</label>
              <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={resetForm}>ยกเลิก</Button><Button type="submit">{editingId ? "บันทึกการแก้ไข" : "เพิ่มช่องทางขาย"}</Button></div>
            </form>
          </Card>
        </Modal>
      ) : null}
    </div>
  );
}

function CashShiftPage({ currentShift, shifts, onOpenCashShift, onCloseCashShift, onRefresh }) {
  const { showMessage } = useActionDialog();
  const [refreshing, setRefreshing] = useState(false);
  const [cashShiftDialog, setCashShiftDialog] = useState(null);
  const expectedCash = currentShift
    ? Number(currentShift.opening_cash || 0) + Number(currentShift.cash_sales || 0)
    : 0;
  const openShift = () => setCashShiftDialog({ mode: "open", shift: null });
  const closeShift = (shift) => setCashShiftDialog({ mode: "close", shift });
  const saveCashShift = async ({ cash, note }) => {
    if (cashShiftDialog?.mode === "close" && cashShiftDialog.shift) {
      const closed = await onCloseCashShift?.(cashShiftDialog.shift.id, cash, note);
      if (closed) showMessage({ tone: "success", title: "ปิดกะเงินสดแล้ว", message: `ยอดคาดการณ์ ${money(closed.expected_cash)}\nยอดต่าง ${money(closed.difference_amount)}` });
      return closed;
    }
    const opened = await onOpenCashShift?.(cash, note);
    if (opened) showMessage({ tone: "success", title: "เปิดกะเงินสดแล้ว", message: `เงินทอนเริ่มกะ ${money(opened.opening_cash)}` });
    return opened;
  };
  const refresh = async () => {
    setRefreshing(true);
    await onRefresh?.();
    setRefreshing(false);
  };
  const printShift = (shift) => {
    if (printCashShiftSummary(shift)) return;
    showMessage({ tone: "danger", title: "เปิดรายงานไม่ได้", message: "กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อพิมพ์สรุปปิดกะ" });
  };
  return (
    <div className="space-y-5">
      <Heading
        title="จัดการกะเงินสด"
        description="จัดการเงินทอนเริ่มกะ ตรวจยอดขายเงินสด และบันทึกยอดนับเมื่อปิดกะ"
        action={<Button type="button" variant="secondary" disabled={refreshing} onClick={refresh}>{refreshing ? "กำลังรีเฟรช…" : "รีเฟรชข้อมูล"}</Button>}
      />
      <Card className={currentShift ? "border-emerald-200 bg-emerald-50/45" : "border-amber-200 bg-amber-50/45"}>
        {currentShift ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">● กะกำลังเปิด</span>
              <h2 className="mt-3 text-lg font-bold text-slate-900">กะ #{currentShift.id}</h2>
              <p className="mt-1 text-sm text-slate-600">เปิดเมื่อ {dateTimeLabel(currentShift.opened_at)}</p>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:max-w-lg">
                <div className="rounded-xl bg-white/80 p-3"><p className="text-[11px] text-slate-500">เงินทอนเริ่มกะ</p><strong className="mt-1 block text-sm text-slate-800">{money(currentShift.opening_cash)}</strong></div>
                <div className="rounded-xl bg-white/80 p-3"><p className="text-[11px] text-slate-500">ขายเงินสด</p><strong className="mt-1 block text-sm text-sky-700">{money(currentShift.cash_sales)}</strong></div>
                <div className="rounded-xl bg-white/80 p-3"><p className="text-[11px] text-slate-500">ยอดที่ควรมี</p><strong className="mt-1 block text-sm text-emerald-700">{money(expectedCash)}</strong></div>
              </div>
            </div>
            <Button type="button" variant="secondary" onClick={() => closeShift(currentShift)}>ปิดกะเงินสด</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">รอเปิดกะ</span>
              <h2 className="mt-3 text-lg font-bold text-slate-900">ยังไม่มีกะเงินสดที่เปิดอยู่</h2>
              <p className="mt-1 text-sm text-slate-600">เปิดกะก่อนรับชำระเงินสดจากหน้า POS</p>
            </div>
            <Button type="button" onClick={openShift}>เปิดกะเงินสด</Button>
          </div>
        )}
      </Card>
      <CashShiftAuditPanel shifts={shifts} onCloseShift={closeShift} onPrintShift={printShift} />
      {cashShiftDialog ? <CashShiftDialog mode={cashShiftDialog.mode} shift={cashShiftDialog.shift} onClose={() => setCashShiftDialog(null)} onSubmit={saveCashShift} /> : null}
    </div>
  );
}

function CashShiftAuditPanel({ shifts, onCloseShift, onPrintShift }) {
  const history = Array.isArray(shifts) ? shifts : [];
  const closedShifts = history.filter((shift) => shift.status === "CLOSED");
  const cashSales = history.reduce((total, shift) => total + Number(shift.cash_sales || 0), 0);
  const differences = closedShifts.reduce(
    (total, shift) => total + Number(shift.difference_amount || 0),
    0,
  );
  return (
    <section className="grid gap-5 2xl:grid-cols-[0.75fr_1.25fr]">
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
        <h2 className="text-lg font-bold text-slate-900">ตรวจสอบกะเงินสด</h2>
        <p className="mt-1 text-sm text-slate-600">
          ดูประวัติ 50 กะล่าสุด พร้อมยอดคาดการณ์และยอดต่างก่อนส่งเงิน
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-white/80 p-3">
            <p className="text-xs font-semibold text-slate-500">กะที่เปิดอยู่</p>
            <strong className="mt-1 block text-xl text-amber-700">
              {history.filter((shift) => shift.status === "OPEN").length} กะ
            </strong>
          </div>
          <div className="rounded-xl bg-white/80 p-3">
            <p className="text-xs font-semibold text-slate-500">ขายเงินสดรวม</p>
            <strong className="mt-1 block text-base text-slate-900">{money(cashSales)}</strong>
          </div>
          <div className="col-span-2 rounded-xl bg-white/80 p-3">
            <p className="text-xs font-semibold text-slate-500">ผลต่างสะสมจากกะที่ปิดแล้ว</p>
            <strong className={`mt-1 block text-xl ${differences === 0 ? "text-emerald-700" : differences > 0 ? "text-sky-700" : "text-rose-700"}`}>
              {differences > 0 ? "+" : ""}{money(differences)}
            </strong>
          </div>
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">ประวัติปิดกะ</h2>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-sm font-bold text-slate-700">
            {history.length} รายการ
          </span>
        </div>
        <div className="mt-4 grid gap-3">
          {history.length ? history.map((shift) => {
            const isOpen = shift.status === "OPEN";
            const expected = Number(
              shift.expected_cash ?? Number(shift.opening_cash || 0) + Number(shift.cash_sales || 0),
            );
            const difference = Number(shift.difference_amount || 0);
            const differenceClass = difference === 0 ? "text-emerald-700" : difference > 0 ? "text-sky-700" : "text-rose-700";
            return (
              <article className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4" key={shift.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-slate-900">กะ #{shift.id} · {shift.opened_by_name || "ไม่ระบุผู้เปิดกะ"}</p>
                    <p className="mt-1 text-xs text-slate-500">เปิดกะ {dateTimeLabel(shift.opened_at)}</p>
                    {!isOpen ? <p className="mt-1 text-xs text-slate-500">ปิดกะ {dateTimeLabel(shift.closed_at)} · {shift.closed_by_name || "ไม่ระบุผู้ปิดกะ"}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isOpen ? "bg-amber-100 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
                      {isOpen ? "กำลังเปิดกะ" : "ปิดกะแล้ว"}
                    </span>
                    {isOpen && onCloseShift ? <Button type="button" className="!px-2 !py-1 text-xs" variant="secondary" onClick={() => onCloseShift(shift)}>ปิดกะ</Button> : null}
                    {!isOpen && onPrintShift ? <Button type="button" className="!px-2 !py-1 text-xs" variant="secondary" onClick={() => onPrintShift(shift)}>พิมพ์สรุป</Button> : null}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                  <div><p className="text-xs text-slate-500">เงินทอนเริ่มกะ</p><strong className="text-slate-800">{money(shift.opening_cash)}</strong></div>
                  <div><p className="text-xs text-slate-500">ขายเงินสด</p><strong className="text-slate-800">{money(shift.cash_sales)}</strong></div>
                  <div><p className="text-xs text-slate-500">ยอดที่ควรมี</p><strong className="text-slate-800">{money(expected)}</strong></div>
                  <div><p className="text-xs text-slate-500">{isOpen ? "สถานะยอดนับ" : "ยอดนับจริง / ส่วนต่าง"}</p><strong className={isOpen ? "text-amber-700" : differenceClass}>{isOpen ? "รอปิดกะ" : `${money(shift.closing_cash)} · ${difference > 0 ? "+" : ""}${money(difference)}`}</strong></div>
                </div>
                {(shift.opening_note || shift.closing_note) ? <p className="mt-3 border-t border-slate-200 pt-3 text-xs text-slate-500">{shift.opening_note ? `เปิดกะ: ${shift.opening_note}` : ""}{shift.opening_note && shift.closing_note ? " · " : ""}{shift.closing_note ? `ปิดกะ: ${shift.closing_note}` : ""}</p> : null}
              </article>
            );
          }) : <Empty>ยังไม่มีประวัติกะเงินสด</Empty>}
        </div>
      </Card>
    </section>
  );
}

function SalesBreakdownPanel({ data, selectedDate }) {
  const channels = Array.isArray(data?.channels) ? data.channels : [];
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const channelTotal = channels.reduce((total, item) => total + Number(item.gross_amount || 0), 0);
  const paymentTotal = payments.reduce((total, item) => total + Number(item.payment_amount || 0), 0);
  return (
    <section className="grid gap-5 xl:grid-cols-2">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">ยอดขายตามช่องทาง</h2>
          </div>
          <strong className="text-base text-sky-700">{money(channelTotal)}</strong>
        </div>
        <div className="mt-4 space-y-3">
          {channels.length ? channels.map((item) => {
            const gross = Number(item.gross_amount || 0);
            const percent = channelTotal > 0 ? Math.round((gross / channelTotal) * 100) : 0;
            return (
              <div key={item.channel_name}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-slate-800">{item.channel_name}</span>
                  <span className="font-bold text-sky-700">{money(gross)} · {percent}%</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-sky-50"><div className="h-full rounded-full bg-sky-500" style={{ width: `${percent}%` }} /></div>
                <p className="mt-1 text-xs text-slate-500">{Number(item.order_count || 0)} ออเดอร์ · รายรับสุทธิ {money(item.net_revenue)}</p>
              </div>
            );
          }) : <Empty>ยังไม่มีรายการขายในวันที่ {dateLabel(selectedDate)}</Empty>}
        </div>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">ยอดตามวิธีชำระเงิน</h2>
          </div>
          <strong className="text-base text-violet-700">{money(paymentTotal)}</strong>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {payments.length ? payments.map((item) => (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-3" key={item.payment_method}>
              <p className="text-sm font-bold text-slate-800">{paymentMethodLabel(item.payment_method)}</p>
              <strong className="mt-1 block text-lg text-violet-700">{money(item.payment_amount)}</strong>
              <p className="mt-1 text-xs text-slate-500">{Number(item.order_count || 0)} ออเดอร์{Number(item.change_amount || 0) > 0 ? ` · เงินทอน ${money(item.change_amount)}` : ""}</p>
            </div>
          )) : <Empty>ยังไม่มีข้อมูลรับชำระในวันที่ {dateLabel(selectedDate)}</Empty>}
        </div>
      </Card>
    </section>
  );
}

function ReportChange({ current, previous }) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) {
    return <span className="text-xs font-semibold text-slate-400">{currentValue ? "เริ่มมีข้อมูล" : "ไม่มีข้อมูลเทียบ"}</span>;
  }
  const change = Math.round(((currentValue - previousValue) / Math.abs(previousValue)) * 100);
  const tone = change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-500";
  return <span className={`text-xs font-bold ${tone}`}>{change > 0 ? "+" : ""}{change}% เทียบช่วงก่อน</span>;
}

function ManagementReportPanel({ onLoad }) {
  const [from, setFrom] = useState(() => firstDayOfMonth(todayInBangkok()));
  const [to, setTo] = useState(todayInBangkok);
  const [reportSearch, setReportSearch] = useState("");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    onLoad?.(from, to)
      .then((data) => {
        if (!active) return;
        setReport(data || null);
        if (!data) setError("ยังไม่สามารถโหลดรายงานได้");
      })
      .catch(() => {
        if (active) {
          setReport(null);
          setError("ยังไม่สามารถโหลดรายงานได้");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [from, onLoad, to]);
  const setRange = (nextFrom, nextTo) => {
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const today = todayInBangkok();
  const summary = report?.summary || {};
  const previous = report?.previous_summary || {};
  const daily = Array.isArray(report?.daily) ? report.daily : [];
  const topProducts = Array.isArray(report?.top_products) ? report.top_products : [];
  const productMetrics = Array.isArray(report?.product_metrics) ? report.product_metrics : topProducts;
  const channelMetrics = Array.isArray(report?.channel_metrics) ? report.channel_metrics : [];
  const hourlySales = Array.isArray(report?.hourly_sales) ? report.hourly_sales : [];
  const inventoryUsage = Array.isArray(report?.inventory_usage) ? report.inventory_usage : [];
  const reportQuery = reportSearch.trim().toLowerCase();
  const matchesReportSearch = (item) => !reportQuery || Object.values(item || {})
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase()
    .includes(reportQuery);
  const visibleTopProducts = topProducts.filter(matchesReportSearch);
  const visibleProductMetrics = productMetrics.filter(matchesReportSearch);
  const visibleChannelMetrics = channelMetrics.filter(matchesReportSearch);
  const visibleInventoryUsage = inventoryUsage.filter(matchesReportSearch);
  const highestDailySales = Math.max(1, ...daily.map((item) => Number(item.net_revenue || 0)));
  const highestHourlySales = Math.max(1, ...hourlySales.map((item) => Number(item.net_revenue || 0)));
  const peakHour = hourlySales.reduce((best, item) => (
    Number(item.net_revenue || 0) > Number(best?.net_revenue || 0) ? item : best
  ), null);
  const reportCards = [
    ["ยอดขายก่อนลด", summary.subtotal_amount, previous.subtotal_amount, "text-slate-800"],
    ["ส่วนลดรวม", summary.discount_amount, previous.discount_amount, "text-amber-700"],
    ["GP ช่องทาง", summary.gp_amount, previous.gp_amount, "text-violet-700"],
    ["กำไรหลัง GP/ส่วนลด", summary.net_profit, previous.net_profit, "text-emerald-700"],
    ["กำไรหลังค่าใช้จ่าย", summary.operating_profit, previous.operating_profit, "text-sky-700"],
    ["จำนวนออเดอร์", summary.order_count, previous.order_count, "text-violet-700"],
  ];
  return (
    <section className="space-y-5">
      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">รายงานเชิงธุรกิจ</h2>
            <p className="mt-1 text-sm text-slate-500">วิเคราะห์เมนู ช่องทางขาย ชั่วโมงขายดี และกำไรหลังหักส่วนลด, GP และต้นทุนจริง</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="text-xs" variant="secondary" onClick={() => setRange(today, today)}>วันนี้</Button>
              <Button type="button" className="text-xs" variant="secondary" onClick={() => setRange(shiftRecordDate(today, -6), today)}>7 วัน</Button>
              <Button type="button" className="text-xs" variant="secondary" onClick={() => setRange(firstDayOfMonth(today), today)}>เดือนนี้</Button>
            </div>
            <label className={labelClass}>
              ตั้งแต่
              <input className={inputClass} type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value || from)} />
            </label>
            <label className={labelClass}>
              ถึง
              <input className={inputClass} type="date" value={to} min={from} max={today} onChange={(event) => setTo(event.target.value || to)} />
            </label>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input aria-label="ค้นหารายงาน" className={inputClass} value={reportSearch} onChange={(event) => setReportSearch(event.target.value)} placeholder="ค้นหาเมนู ช่องทางขาย หรือวัตถุดิบในรายงาน" />
          <Button type="button" variant="secondary" disabled={!reportSearch} onClick={() => setReportSearch("")}>ล้างคำค้น</Button>
        </div>
        <p className="mt-4 rounded-xl bg-white/75 px-3 py-2 text-xs font-semibold text-slate-600">
          ช่วงรายงาน: {dateLabel(from)} – {dateLabel(to)} · เปรียบเทียบกับ {report?.period ? `${dateLabel(report.period.previous_from)} – ${dateLabel(report.period.previous_to)}` : "ช่วงก่อนหน้าที่มีจำนวนวันเท่ากัน"}
        </p>
      </Card>

      {loading ? <Card><p className="text-sm text-slate-500">กำลังจัดทำรายงาน…</p></Card> : error ? <Empty>{error}</Empty> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {reportCards.map(([label, value, previousValue, tone]) => (
              <Card className="p-4" key={label}>
                <p className="text-xs font-semibold text-slate-500">{label}</p>
                <strong className={`mt-2 block text-xl ${tone}`}>{label === "จำนวนออเดอร์" ? `${Number(value || 0).toLocaleString()} รายการ` : money(value)}</strong>
                <div className="mt-2"><ReportChange current={value} previous={previousValue} /></div>
              </Card>
            ))}
          </div>
          <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">ยอดขายสุทธิรายวัน</h3>
                </div>
                <strong className="text-sm text-sky-700">รวม {money(summary.net_revenue)}</strong>
              </div>
              <div className="mt-5 flex min-h-40 items-end gap-2 overflow-x-auto pb-1">
                {daily.length ? daily.map((item) => {
                  const height = Math.max(8, Math.round((Number(item.net_revenue || 0) / highestDailySales) * 112));
                  return (
                    <div className="flex min-w-12 flex-1 flex-col items-center gap-2" key={item.record_date} title={`${dateLabel(item.record_date)} · ${money(item.net_revenue)}`}>
                      <span className="text-[10px] font-bold text-sky-700">{money(item.net_revenue).replace("฿", "")}</span>
                      <div className="flex h-28 w-full items-end rounded-t-lg bg-sky-50 px-1"><div className="w-full rounded-t-md bg-gradient-to-t from-sky-600 to-cyan-400" style={{ height }} /></div>
                      <span className="whitespace-nowrap text-[10px] text-slate-500">{String(item.record_date).slice(8, 10)}/{String(item.record_date).slice(5, 7)}</span>
                    </div>
                  );
                }) : <Empty>ยังไม่มีรายการขายในช่วงเวลานี้</Empty>}
              </div>
            </Card>
            <Card>
              <div>
                <h3 className="text-lg font-bold text-slate-900">เมนูขายดี</h3>
              </div>
              <div className="mt-4 space-y-3">
                {visibleTopProducts.length ? visibleTopProducts.map((item, index) => (
                  <div className="flex items-center gap-3" key={item.product_id || item.product_name}>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-sm font-black text-amber-800">{index + 1}</span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.product_name}</p><p className="text-xs text-slate-500">{Number(item.quantity_sold || 0).toLocaleString()} ชิ้น · {Number(item.order_count || 0)} ออเดอร์</p></div>
                    <strong className="shrink-0 text-sm text-amber-700">{money(item.sales_amount)}</strong>
                  </div>
                )) : <Empty>ยังไม่มีเมนูขายในช่วงเวลานี้</Empty>}
              </div>
            </Card>
          </section>
          <section className="grid gap-5 xl:grid-cols-2">
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">ผลลัพธ์ตามช่องทางขาย</h3>
                  <p className="mt-1 text-xs text-slate-500">ยอดหลังส่วนลด, GP และต้นทุนของแต่ละช่องทาง</p>
                </div>
                <strong className="text-sm text-sky-700">รับสุทธิ {money(summary.net_revenue)}</strong>
              </div>
              <div className="mt-4 space-y-3">
                {visibleChannelMetrics.length ? visibleChannelMetrics.map((item) => {
                  const share = Math.min(100, Math.max(0, Number(item.net_revenue || 0) / Math.max(1, Number(summary.net_revenue || 0)) * 100));
                  return (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/40 p-3" key={item.channel_name}>
                      <div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-bold text-slate-800">{item.channel_name}</p><strong className="shrink-0 text-sm text-sky-700">{money(item.net_revenue)}</strong></div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-sky-500" style={{ width: `${share}%` }} /></div>
                      <p className="mt-2 text-xs text-slate-500">{Number(item.order_count || 0).toLocaleString()} ออเดอร์ · GP {money(item.gp_amount)} · กำไร {money(item.net_profit)}</p>
                    </div>
                  );
                }) : <Empty>ยังไม่มีข้อมูลช่องทางขายในช่วงเวลานี้</Empty>}
              </div>
            </Card>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">ชั่วโมงขายดี</h3>
                  <p className="mt-1 text-xs text-slate-500">อ้างอิงเวลาประเทศไทย</p>
                </div>
                {peakHour ? <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">พีค {String(peakHour.hour).padStart(2, "0")}:00 · {money(peakHour.net_revenue)}</span> : null}
              </div>
              <div className="mt-5 flex min-h-40 items-end gap-2 overflow-x-auto pb-1">
                {hourlySales.length ? hourlySales.map((item) => {
                  const height = Math.max(8, Math.round((Number(item.net_revenue || 0) / highestHourlySales) * 112));
                  return (
                    <div className="flex min-w-11 flex-1 flex-col items-center gap-2" key={item.hour} title={`${String(item.hour).padStart(2, "0")}:00 · ${money(item.net_revenue)} · ${Number(item.order_count || 0)} ออเดอร์`}>
                      <span className="text-[10px] font-bold text-amber-700">{Number(item.order_count || 0)}</span>
                      <div className="flex h-28 w-full items-end rounded-t-lg bg-amber-50 px-1"><div className="w-full rounded-t-md bg-gradient-to-t from-amber-500 to-yellow-300" style={{ height }} /></div>
                      <span className="text-[10px] text-slate-500">{String(item.hour).padStart(2, "0")}:00</span>
                    </div>
                  );
                }) : <Empty>ยังไม่มีข้อมูลเวลาออเดอร์ในช่วงเวลานี้</Empty>}
              </div>
            </Card>
          </section>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">กำไรตามเมนู</h3>
                <p className="mt-1 text-xs text-slate-500">รายได้ถูกเฉลี่ยตามส่วนลดและ GP ของออเดอร์ ส่วนต้นทุนอ้างอิงล็อตวัตถุดิบที่ตัดจริง</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">{visibleProductMetrics.length} เมนู</span>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs text-slate-500"><tr><th className="px-2 py-3">เมนู</th><th className="px-2 py-3 text-right">ขายได้</th><th className="px-2 py-3 text-right">ยอดก่อนลด</th><th className="px-2 py-3 text-right">ส่วนลด</th><th className="px-2 py-3 text-right">GP</th><th className="px-2 py-3 text-right">ต้นทุน</th><th className="px-2 py-3 text-right">กำไรหลัง GP/ส่วนลด</th></tr></thead>
                <tbody>
                  {visibleProductMetrics.length ? visibleProductMetrics.map((item) => (
                    <tr className="border-b border-slate-100 last:border-0" key={item.product_id || item.product_name}>
                      <td className="px-2 py-3 font-bold text-slate-800">{item.product_name}</td>
                      <td className="px-2 py-3 text-right text-slate-600">{Number(item.quantity_sold || 0).toLocaleString()}</td>
                      <td className="px-2 py-3 text-right text-slate-600">{money(item.list_sales_amount)}</td>
                      <td className="px-2 py-3 text-right text-amber-700">-{money(item.discount_amount)}</td>
                      <td className="px-2 py-3 text-right text-violet-700">-{money(item.gp_amount)}</td>
                      <td className="px-2 py-3 text-right text-slate-600">-{money(item.total_cogs)}</td>
                      <td className={`px-2 py-3 text-right font-bold ${Number(item.net_profit || 0) >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(item.net_profit)}</td>
                    </tr>
                  )) : <tr><td className="px-2 py-6 text-center text-slate-500" colSpan="7">ยังไม่มีเมนูขายในช่วงเวลานี้</td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">วัตถุดิบที่ใช้ตามออเดอร์</h3>
              </div>
              <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">ใช้จริงจากล็อตสต็อก</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {visibleInventoryUsage.length ? visibleInventoryUsage.map((item) => (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50/45 p-3" key={item.ingredient_id}>
                  <p className="truncate text-sm font-bold text-slate-800">{item.ingredient_name}</p>
                  <p className="mt-1 text-base font-bold text-emerald-700">{Number(item.quantity_used || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit || "หน่วย"}</p>
                  <p className="mt-1 text-xs text-slate-500">ต้นทุนที่ใช้ {money(item.usage_cost)}</p>
                </div>
              )) : <Empty>ยังไม่มีข้อมูลการตัดวัตถุดิบในช่วงเวลานี้</Empty>}
            </div>
          </Card>
        </>
      )}
    </section>
  );
}

const goLiveChecklist = [
  {
    key: "database_backup",
    title: "สำรองข้อมูลธุรกิจ",
    description: "ดาวน์โหลดไฟล์สำรอง JSON แล้วเปิดตรวจสอบไฟล์ และเก็บในพื้นที่เข้ารหัสที่ทีมเข้าถึงได้",
  },
  {
    key: "audit_log_review",
    title: "ตรวจสอบประวัติการแก้ไข",
    description: "ยืนยันว่าการเพิ่ม แก้ไข ลบ และเปลี่ยนสถานะล่าสุดแสดงผู้ทำรายการอย่างถูกต้อง",
  },
  {
    key: "admin_access",
    title: "ทดสอบสิทธิ์ Admin",
    description: "เข้าสู่ระบบด้วยบัญชี Admin แล้วตรวจการตั้งค่า เมนู วัตถุดิบ การเงิน รายงาน และการจัดการข้อมูล",
  },
  {
    key: "staff_access",
    title: "ทดสอบสิทธิ์ Staff",
    description: "เข้าสู่ระบบด้วยบัญชี Staff แล้วสร้างออเดอร์ เปลี่ยนสถานะ และยืนยันว่าไม่เข้าถึงการเงินหรือการตั้งค่าระบบ",
  },
  {
    key: "user_access",
    title: "ทดสอบสิทธิ์ User",
    description: "เข้าสู่ระบบด้วยบัญชี User แล้วตรวจประวัติและสถานะของตนเอง โดยต้องไม่แก้ไขข้อมูลร้านได้",
  },
  {
    key: "sales_flow",
    title: "ทดสอบขายครบเส้นทาง",
    description: "เปิดกะ → เลือกเมนู/ความหวาน/ท็อปปิ้ง → ส่วนลดหรือคูปอง → ชำระเงิน → ตัดสต็อก → คิวครัว → ส่งมอบ → ตรวจยอดการเงิน",
  },
  {
    key: "print_flow",
    title: "ทดสอบการพิมพ์",
    description: "ทดสอบใบเสร็จและใบครัวกับเครื่องจริง รวมถึงขนาดกระดาษ 58 หรือ 80 มม. ที่ใช้หน้าร้าน",
  },
];

function GoLiveReadinessPage({ onLoadReadiness, onLoadChecks, onSaveCheck, onLoadAuditLogs, onDownloadBackup }) {
  const { showMessage } = useActionDialog();
  const [readiness, setReadiness] = useState(null);
  const [checks, setChecks] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const refresh = async () => {
    setLoading(true);
    const [nextReadiness, nextChecks, nextAuditLogs] = await Promise.all([
      onLoadReadiness?.(),
      onLoadChecks?.(),
      onLoadAuditLogs?.(12),
    ]);
    setReadiness(nextReadiness || null);
    setChecks(Array.isArray(nextChecks) ? nextChecks : []);
    setAuditLogs(Array.isArray(nextAuditLogs) ? nextAuditLogs : []);
    setLoading(false);
  };
  useEffect(() => {
    refresh();
  }, [onLoadAuditLogs, onLoadChecks, onLoadReadiness]);
  const checksByKey = Object.fromEntries(checks.map((item) => [item.check_key, item]));
  const passedCount = goLiveChecklist.filter((item) => checksByKey[item.key]?.status === "PASSED").length;
  const saveCheck = async (key, status) => {
    setSavingKey(key);
    const saved = await onSaveCheck?.(key, status);
    setSavingKey("");
    if (!saved) return;
    setChecks((current) => {
      const index = current.findIndex((item) => item.check_key === key);
      return index >= 0 ? current.map((item) => item.check_key === key ? saved : item) : [...current, saved];
    });
    showMessage({
      tone: status === "PASSED" ? "success" : "info",
      title: status === "PASSED" ? "บันทึกว่าทดสอบผ่านแล้ว" : "เปิดรายการตรวจสอบอีกครั้ง",
      message: "ระบบบันทึกผู้ตรวจสอบและเวลาที่อัปเดตไว้ในประวัติการแก้ไขแล้ว",
    });
  };
  const downloadBackup = async () => {
    const downloaded = await onDownloadBackup?.();
    if (!downloaded) return;
    showMessage({ tone: "success", title: "ดาวน์โหลดข้อมูลสำรองแล้ว", message: "กรุณาเก็บไฟล์ในพื้นที่เข้ารหัส และทดสอบเปิดไฟล์ก่อนทำเครื่องหมายว่าผ่าน" });
    window.setTimeout(() => refresh(), 400);
  };
  const roleCounts = readiness?.role_counts || {};
  const readinessCards = [
    ["Admin", Number(roleCounts.admin || 0), "บัญชีผู้ดูแลระบบ"],
    ["Staff", Number(roleCounts.staff || 0), "บัญชีพนักงานหน้าร้าน"],
    ["User", Number(roleCounts.user || 0), "บัญชีลูกค้า"],
    ["เมนูพร้อมขาย", Number(readiness?.active_products || 0), "รายการที่ยังเปิดขาย"],
    ["ช่องทางขาย", Number(readiness?.active_channels || 0), "ช่องทางที่เปิดใช้งาน"],
    ["วัตถุดิบใกล้หมด", Number(readiness?.low_stock_count || 0), "ควรตรวจให้พร้อมก่อนเปิดร้าน"],
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Heading
        title="ความพร้อมก่อนเปิดใช้จริง"
        description="ตรวจข้อมูลสำรอง สิทธิ์ผู้ใช้ และการขายครบเส้นทางก่อนเปิดหน้าร้าน"
        action={<Button type="button" variant="secondary" onClick={refresh} disabled={loading}>{loading ? "กำลังตรวจสอบ…" : "↻ ตรวจสอบใหม่"}</Button>}
      />
      <Card className="border-sky-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-sky-800">ผลการตรวจรับ {passedCount}/{goLiveChecklist.length} รายการ</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{passedCount === goLiveChecklist.length ? "พร้อมเปิดใช้จริง" : "ยังมีรายการที่ต้องทดสอบ"}</h2>
            <p className="mt-1 text-sm text-slate-600">การทำเครื่องหมายผ่านเป็นการรับรองโดยผู้ดูแลหลังทดสอบกับบัญชีและอุปกรณ์จริง</p>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-white sm:w-56"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500 transition-all" style={{ width: `${(passedCount / goLiveChecklist.length) * 100}%` }} /></div>
        </div>
      </Card>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {readinessCards.map(([label, value, description]) => (
          <Card className="p-4" key={label}><p className="text-xs font-semibold text-slate-500">{label}</p><strong className="mt-2 block text-2xl text-slate-900">{value.toLocaleString()}</strong><p className="mt-1 text-xs text-slate-500">{description}</p></Card>
        ))}
      </section>
      <Card className="border-violet-200 bg-violet-50/50">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">สำรองข้อมูลธุรกิจ</h2>
            <p className="mt-1 text-sm text-slate-600">Snapshot ครอบคลุมยอดขาย สต็อก เมนู คูปอง กะเงินสด ผู้ขาย และประวัติการแก้ไขล่าสุด</p>
            <p className="mt-1 text-xs text-violet-700">สำรองล่าสุด: {readiness?.last_backup_at ? dateTimeLabel(readiness.last_backup_at) : "ยังไม่มี"}</p>
          </div>
          <Button type="button" onClick={downloadBackup}>↓ ดาวน์โหลดข้อมูลสำรอง</Button>
        </div>
        <p className="mt-3 rounded-xl border border-violet-100 bg-white/80 p-3 text-xs leading-5 text-slate-600">ไฟล์นี้ไม่รวม password hash และไม่แทนที่ backup ระดับผู้ให้บริการฐานข้อมูลหรือ pg_dump จึงควรเปิดระบบสำรองของผู้ให้บริการควบคู่กัน</p>
      </Card>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <Card>
          <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-slate-900">รายการทดสอบก่อนเปิดใช้</h2><p className="mt-1 text-xs text-slate-500">ทดสอบกับข้อมูลและอุปกรณ์จริง แล้วค่อยทำเครื่องหมายผ่าน</p></div><span className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-bold text-sky-700">{passedCount} ผ่านแล้ว</span></div>
          <div className="mt-4 space-y-3">
            {goLiveChecklist.map((item) => {
              const saved = checksByKey[item.key];
              const passed = saved?.status === "PASSED";
              return (
                <div className={`rounded-2xl border p-3 ${passed ? "border-emerald-200 bg-emerald-50/45" : "border-slate-200 bg-white"}`} key={item.key}>
                  <div className="flex gap-3"><button aria-label={`สลับผล ${item.title}`} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border text-sm font-black ${passed ? "border-emerald-600 bg-emerald-600 text-white" : "border-slate-300 bg-white text-transparent"}`} type="button" disabled={savingKey === item.key} onClick={() => saveCheck(item.key, passed ? "PENDING" : "PASSED")}>✓</button><div className="min-w-0 flex-1"><p className="text-sm font-bold text-slate-800">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>{saved?.updated_at ? <p className="mt-2 text-[11px] font-semibold text-slate-500">{passed ? "ผ่านโดย" : "อัปเดตโดย"} {saved.checked_by_name || "ผู้ดูแลระบบ"} · {dateTimeLabel(saved.updated_at)}</p> : null}</div></div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <div><h2 className="text-lg font-bold text-slate-900">ประวัติการแก้ไขล่าสุด</h2><p className="mt-1 text-xs text-slate-500">แสดงผู้ทำรายการและรายการที่เปลี่ยนแปลงจากระบบ</p></div>
          <div className="mt-4 space-y-3">
            {auditLogs.length ? auditLogs.map((item) => (
              <div className="border-b border-slate-100 pb-3 last:border-0 last:pb-0" key={item.id}>
                <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold text-slate-800">{item.action} · {item.resource}</p><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${Number(item.status_code) < 300 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{item.status_code}</span></div>
                <p className="mt-1 text-xs text-slate-500">{item.actor_name || "ผู้ใช้งาน"} · {dateTimeLabel(item.created_at)}</p>
              </div>
            )) : <Empty>{loading ? "กำลังโหลดประวัติ…" : "ยังไม่มีประวัติการแก้ไข"}</Empty>}
          </div>
        </Card>
      </section>
    </div>
  );
}

function DailyClosingPanel({ businessDate, onLoad, onCloseBusinessDay }) {
  const { confirmAction, showMessage } = useActionDialog();
  const [closing, setClosing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setClosing(null);
    onLoad?.(businessDate)
      .then((data) => {
        if (active) setClosing(data || null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [businessDate, onLoad]);
  const closeBusinessDay = async () => {
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ปิดยอดประจำวัน?",
      message: `ต้องการปิดยอดของวันที่ ${dateLabel(businessDate)} ใช่หรือไม่\nระบบจะบันทึกยอดขาย ค่าใช้จ่าย และกำไร ณ ขณะนี้ แล้วล็อกรายการของวันดังกล่าวไม่ให้แก้ไข`,
      confirmLabel: "ยืนยันปิดยอด",
    });
    if (!confirmed) return;
    setSaving(true);
    const saved = await onCloseBusinessDay?.(businessDate);
    setSaving(false);
    if (!saved) return;
    setClosing(saved);
    showMessage({
      tone: "success",
      title: "ปิดยอดประจำวันแล้ว",
      message: `บันทึกยอดของวันที่ ${dateLabel(businessDate)} เรียบร้อย รายการขายและค่าใช้จ่ายของวันนี้จะไม่สามารถแก้ไขได้`,
    });
  };
  const canClose = businessDate <= todayInBangkok();
  return (
    <Card className={closing ? "border-emerald-200 bg-emerald-50/45" : "border-amber-200 bg-amber-50/45"}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">{closing ? "ปิดยอดประจำวันแล้ว" : "พร้อมปิดยอดประจำวัน"}</h2>
          {loading ? <p className="mt-1 text-sm text-slate-500">กำลังตรวจสอบสถานะปิดยอด…</p> : closing ? (
            <p className="mt-1 text-sm text-slate-600">ปิดโดย {closing.closed_by_name || "ผู้ดูแลระบบ"} เมื่อ {dateTimeLabel(closing.closed_at)}</p>
          ) : <p className="mt-1 text-sm text-slate-600">ปิดยอดวันที่ {dateLabel(businessDate)} เพื่อเก็บ snapshot และล็อกรายการขายกับค่าใช้จ่ายของวันนั้น</p>}
        </div>
        {!closing ? <Button type="button" disabled={loading || saving || !canClose} variant="secondary" onClick={closeBusinessDay}>{saving ? "กำลังปิดยอด…" : "ปิดยอดประจำวัน"}</Button> : <span className="rounded-full bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">✓ ปิดยอดแล้ว</span>}
      </div>
      {closing ? (
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-200 pt-4 sm:grid-cols-4">
          <div><p className="text-xs text-slate-500">ยอดขายสุทธิ</p><strong className="text-sm text-emerald-700">{money(closing.net_revenue)}</strong></div>
          <div><p className="text-xs text-slate-500">ค่าใช้จ่าย</p><strong className="text-sm text-slate-800">{money(closing.expenses)}</strong></div>
          <div><p className="text-xs text-slate-500">กำไรหลังค่าใช้จ่าย</p><strong className="text-sm text-emerald-700">{money(closing.operating_profit)}</strong></div>
          <div><p className="text-xs text-slate-500">ออเดอร์</p><strong className="text-sm text-slate-800">{Number(closing.order_count || 0).toLocaleString()} รายการ</strong></div>
        </div>
      ) : !canClose ? <p className="mt-3 text-xs font-semibold text-amber-700">สามารถปิดยอดได้ถึงวันปัจจุบันเท่านั้น</p> : null}
    </Card>
  );
}

function FinancePage({
  expenseRows,
  orders,
  channels,
  products,
  salesBreakdown,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateSales,
  onUpdateSales,
  onDeleteSales,
  onUpdateOrderStatus,
  onRefreshSalesBreakdown,
  onRefreshSalesReport,
  onFetchDailyClosing,
  onCloseBusinessDay,
}) {
  const { confirmAction, showMessage } = useActionDialog();
  const [selectedDate, setSelectedDate] = useState(todayInBangkok);
  const [financeSearch, setFinanceSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderNoFilter, setOrderNoFilter] = useState("ALL");
  const newSales = () => ({
    order_no: `MAN-${Date.now()}`,
    channel_id: channels[0]?.id || "",
    status: "COMPLETED",
    items: [
      {
        product_id: products[0]?.id || "",
        qty: 1,
        price: products[0]?.price_retail || "",
      },
    ],
  });
  const [sales, setSales] = useState(newSales);
  const [salesEditingId, setSalesEditingId] = useState(null);
  const [salesModalOpen, setSalesModalOpen] = useState(false);
  const [expense, setExpense] = useState({
    amount: "",
    category: "OPERATING_EXPENSE",
    description: "",
  });
  const [expenseEditingId, setExpenseEditingId] = useState(null);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState(null);
  useEffect(() => {
    onRefreshSalesBreakdown?.(selectedDate);
  }, [onRefreshSalesBreakdown, selectedDate]);
  const dateOrders = useMemo(
    () => orders.filter((order) => rowMatchesDate(order, selectedDate)),
    [orders, selectedDate],
  );
  const financeQuery = financeSearch.trim().toLowerCase();
  const matchesFinanceSearch = (item) => !financeQuery || Object.values(item || {})
    .filter((value) => typeof value === "string" || typeof value === "number")
    .join(" ")
    .toLowerCase()
    .includes(financeQuery);
  const searchedDateOrders = useMemo(
    () => dateOrders.filter(matchesFinanceSearch),
    [dateOrders, financeQuery],
  );
  const orderNumbers = useMemo(
    () => [...new Set(dateOrders.map((order) => String(order.order_no || "").trim()).filter(Boolean))],
    [dateOrders],
  );
  const visibleOrders = useMemo(() => {
    const query = orderSearch.trim().toLowerCase();
    return searchedDateOrders.filter((order) => {
      const orderNo = String(order.order_no || "").toLowerCase();
      const searchable = [
        order.order_no,
        order.customer_name,
        order.customer_nickname,
        order.customer_phone,
      ].filter(Boolean).join(" ").toLowerCase();
      return (!query || searchable.includes(query))
        && (orderNoFilter === "ALL" || String(order.order_no) === orderNoFilter);
    });
  }, [orderNoFilter, orderSearch, searchedDateOrders]);
  const financialOrders = useMemo(
    () => searchedDateOrders.filter((order) => String(order.status).toUpperCase() !== "CANCELLED"),
    [searchedDateOrders],
  );
  const filteredExpenses = useMemo(
    () => expenseRows.filter((item) => rowMatchesDate(item, selectedDate) && matchesFinanceSearch(item)),
    [expenseRows, financeQuery, selectedDate],
  );
  const summary = useMemo(() => {
    const salesTotals = financialOrders.reduce(
      (totals, order) => {
        const current = orderNetAmounts(order);
        return {
          gross: totals.gross + current.gross,
          net: totals.net + current.net,
          cogs: totals.cogs + current.cogs,
          profit: totals.profit + current.profit,
        };
      },
      { gross: 0, net: 0, cogs: 0, profit: 0 },
    );
    const expenseTotal = filteredExpenses.reduce(
      (total, item) => total + Number(item.amount || 0),
      0,
    );
    return {
      ...salesTotals,
      expenses: expenseTotal,
      profit: salesTotals.profit - expenseTotal,
    };
  }, [filteredExpenses, financialOrders]);
  const statCards = [
    { label: "ยอดขายสุทธิ", value: money(summary.net), tone: "text-sky-700" },
    { label: "กำไรสุทธิ", value: money(summary.profit), tone: summary.profit >= 0 ? "text-emerald-700" : "text-rose-600" },
    { label: "ค่าใช้จ่าย", value: money(summary.expenses), tone: "text-rose-600" },
    { label: "ออเดอร์", value: `${financialOrders.length.toLocaleString()} รายการ`, tone: "text-violet-700" },
  ];
  const cashflowMax = Math.max(1, Math.abs(summary.net), Math.abs(summary.expenses), Math.abs(summary.profit));
  const cashflowRows = [
    ["ยอดขายสุทธิ", summary.net, "bg-sky-500"],
    ["ค่าใช้จ่าย", summary.expenses, "bg-rose-400"],
    ["กำไรสุทธิ", summary.profit, summary.profit >= 0 ? "bg-emerald-500" : "bg-amber-500"],
  ];
  const updateSalesItem = (index, field, value) =>
    setSales((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) => {
        if (itemIndex !== index) return item;
        if (field === "product_id") {
          const product = products.find(
            (row) => String(row.id) === String(value),
          );
          return {
            ...item,
            product_id: value,
            price: product?.price_retail ?? item.price,
          };
        }
        return { ...item, [field]: value };
      }),
    }));
  const saveSales = async (event) => {
    event.preventDefault();
    const record = {
      ...sales,
      record_date: selectedDate,
      channel_id: Number(sales.channel_id),
      items: sales.items.map((item) => ({
        product_id: Number(item.product_id),
        qty: Number(item.qty),
        price: Number(item.price),
      })),
    };
    const saved = salesEditingId
      ? await onUpdateSales(salesEditingId, record)
      : await onCreateSales(record);
    if (saved) {
      setSalesEditingId(null);
      setSales(newSales());
      setSalesModalOpen(false);
    }
  };
  const editSales = (order) => {
    const rawItems = order.rawItems || [];
    if (!rawItems.length) return;
    setDetailModal(null);
    setSalesEditingId(order.id);
    setSales({
      order_no: order.order_no,
      channel_id: order.channel_id,
      status: order.status === "CANCELLED" ? "COMPLETED" : order.status,
      items: rawItems.map((item) => ({
        product_id: item.product_id,
        qty: item.quantity ?? item.qty,
        price: item.unit_price ?? item.price,
      })),
    });
    setSalesModalOpen(true);
  };
  const saveExpense = async (event) => {
    event.preventDefault();
    const saved = expenseEditingId
      ? await onUpdateExpense(
          expenseEditingId,
          expense.amount,
          expense.category,
          expense.description,
          selectedDate,
        )
      : await onCreateExpense(
          expense.amount,
          expense.category,
          expense.description,
          selectedDate,
        );
    if (saved) {
      setExpense({
        amount: "",
        category: "OPERATING_EXPENSE",
        description: "",
      });
      setExpenseEditingId(null);
      setExpenseModalOpen(false);
    }
  };
  const resetSales = () => {
    setSalesEditingId(null);
    setSales(newSales());
    setSalesModalOpen(false);
  };
  const resetExpense = () => {
    setExpenseEditingId(null);
    setExpense({ amount: "", category: "OPERATING_EXPENSE", description: "" });
    setExpenseModalOpen(false);
  };
  const cancelSalesOrder = async (order) => {
    if (String(order.status || "").toUpperCase() === "CANCELLED") return;
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ยกเลิกคำสั่งซื้อ?",
      message: `ต้องการยกเลิกออเดอร์ #${order.order_no} ใช่หรือไม่\nระบบจะคืนสต็อก ปรับยอดการเงิน และบันทึกประวัติการแก้ไข`,
      confirmLabel: "ยืนยันยกเลิก",
    });
    if (!confirmed) return;
    const saved = await onUpdateOrderStatus?.(order.id, "CANCELLED");
    if (saved) {
      setDetailModal(null);
      showMessage({
        tone: "success",
        title: "ยกเลิกคำสั่งซื้อแล้ว",
        message: `ออเดอร์ #${order.order_no} ถูกยกเลิกและปรับข้อมูลที่เกี่ยวข้องแล้ว`,
      });
    }
  };
  return (
    <div className="space-y-5">
      <Heading
        title="ข้อมูลการเงิน"
        description={`สรุปข้อมูลวันที่ ${dateLabel(selectedDate)}`}
        action={
          <div className="flex flex-wrap items-end gap-2">
            <label className={labelClass}>
              กรองวันที่
              <input
                className={inputClass}
                type="date"
                value={selectedDate}
                onChange={(event) =>
                  setSelectedDate(event.target.value || todayInBangkok())
                }
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSelectedDate(todayInBangkok())}
            >
              วันนี้
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => exportFinance({ selectedDate, orders: financialOrders, expenses: filteredExpenses, summary, salesBreakdown })}
            >
              ↓ Export Excel
            </Button>
            <Button type="button" variant="secondary" onClick={() => { resetSales(); setSalesModalOpen(true); }}>
              + เพิ่มยอดขาย
            </Button>
            <Button type="button" onClick={() => { resetExpense(); setExpenseModalOpen(true); }}>
              + เพิ่มค่าใช้จ่าย
            </Button>
          </div>
        }
      />
      <Card className="!p-3 sm:!p-4">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <input aria-label="ค้นหาข้อมูลการเงิน" className={inputClass} value={financeSearch} onChange={(event) => setFinanceSearch(event.target.value)} placeholder="ค้นหาเลขออเดอร์ ลูกค้า ช่องทาง เมนู หรือค่าใช้จ่าย" />
          <Button type="button" variant="secondary" disabled={!financeSearch} onClick={() => setFinanceSearch("")}>ล้างคำค้น</Button>
        </div>
        {financeSearch ? <p className="mt-2 text-xs text-slate-500">กำลังแสดงข้อมูลที่ตรงกับ “{financeSearch}” ของวันที่เลือก</p> : null}
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((item) => (
          <Card className="!p-4" key={item.label}>
            <p className="text-xs font-semibold text-slate-500">{item.label}</p>
            <strong className={`mt-1 block text-xl ${item.tone}`}>{item.value}</strong>
          </Card>
        ))}
      </div>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">ภาพรวมกระแสเงิน</h2>
              <p className="mt-1 text-xs text-slate-500">ยอดขาย ค่าใช้จ่าย และกำไรของวันที่เลือก</p>
            </div>
            <strong className={summary.profit >= 0 ? "text-lg text-emerald-700" : "text-lg text-rose-600"}>{money(summary.profit)}</strong>
          </div>
          <div className="mt-5 space-y-4">
            {cashflowRows.map(([label, value, tone]) => {
              const percent = Math.min(100, Math.round((Math.abs(Number(value) || 0) / cashflowMax) * 100));
              return (
                <div key={label}>
                  <div className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold text-slate-700">{label}</span><strong className="text-slate-900">{money(value)}</strong></div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${tone}`} style={{ width: `${percent}%` }} /></div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <h2 className="text-lg font-bold text-slate-900">รายการวันนี้</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <button className="rounded-xl border border-sky-100 bg-sky-50/55 p-3 text-left transition hover:border-sky-300 hover:bg-sky-50" type="button" onClick={() => setDetailModal("sales")}>
              <span className="text-xs font-semibold text-slate-500">รายการขาย</span>
              <strong className="mt-1 block text-lg text-sky-700">{dateOrders.length} รายการ</strong>
              <span className="mt-1 block text-xs font-bold text-sky-700">ดูและแก้ไขรายการ →</span>
            </button>
            <button className="rounded-xl border border-rose-100 bg-rose-50/55 p-3 text-left transition hover:border-rose-300 hover:bg-rose-50" type="button" onClick={() => setDetailModal("expenses")}>
              <span className="text-xs font-semibold text-slate-500">ค่าใช้จ่าย</span>
              <strong className="mt-1 block text-lg text-rose-600">{filteredExpenses.length} รายการ</strong>
              <span className="mt-1 block text-xs font-bold text-rose-600">ดูและแก้ไขรายการ →</span>
            </button>
          </div>
        </Card>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <button className="rounded-2xl border border-sky-100 bg-white p-4 text-left shadow-sm transition hover:border-sky-300 hover:bg-sky-50" type="button" onClick={() => setDetailModal("breakdown")}><span className="text-lg">▥</span><strong className="mt-2 block text-sm text-slate-900">วิเคราะห์ยอดขาย</strong><span className="mt-1 block text-xs text-slate-500">ช่องทางและวิธีชำระเงิน</span></button>
        <button className="rounded-2xl border border-violet-100 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:bg-violet-50" type="button" onClick={() => setDetailModal("report")}><span className="text-lg">▤</span><strong className="mt-2 block text-sm text-slate-900">รายงานเชิงธุรกิจ</strong><span className="mt-1 block text-xs text-slate-500">เมนู ช่องทาง ชั่วโมงขายดี และกำไร</span></button>
        <button className="rounded-2xl border border-amber-100 bg-white p-4 text-left shadow-sm transition hover:border-amber-300 hover:bg-amber-50" type="button" onClick={() => setDetailModal("closing")}><span className="text-lg">◷</span><strong className="mt-2 block text-sm text-slate-900">ปิดยอดประจำวัน</strong><span className="mt-1 block text-xs text-slate-500">ตรวจสถานะและล็อกรายการ</span></button>
      </section>
      {detailModal === "breakdown" ? (
        <Modal label="วิเคราะห์ยอดขาย" maxWidth="max-w-6xl" onClose={() => setDetailModal(null)}>
          <SalesBreakdownPanel data={salesBreakdown} selectedDate={selectedDate} />
        </Modal>
      ) : null}
      {detailModal === "report" ? (
        <Modal label="รายงานเชิงธุรกิจ" maxWidth="max-w-6xl" onClose={() => setDetailModal(null)}>
          <ManagementReportPanel onLoad={onRefreshSalesReport} />
        </Modal>
      ) : null}
      {detailModal === "closing" ? (
        <Modal label="ปิดยอดประจำวัน" maxWidth="max-w-3xl" onClose={() => setDetailModal(null)}>
          <DailyClosingPanel businessDate={selectedDate} onCloseBusinessDay={onCloseBusinessDay} onLoad={onFetchDailyClosing} />
        </Modal>
      ) : null}
      {salesModalOpen ? (
      <Modal label={salesEditingId ? "แก้ไขรายการขาย" : "เพิ่มรายการขาย"} maxWidth="max-w-3xl" onClose={resetSales}>
        <Card>
          <h2 className="text-lg font-bold text-slate-900">
            {salesEditingId ? "แก้ไขรายการขาย" : "เพิ่มรายการขาย"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            บันทึกในวันที่ {dateLabel(selectedDate)}
          </p>
          <form className="mt-4 grid gap-4" onSubmit={saveSales}>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className={labelClass}>
                เลขที่ออเดอร์
                <input
                  className={inputClass}
                  value={sales.order_no}
                  onChange={(event) =>
                    setSales((current) => ({
                      ...current,
                      order_no: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className={labelClass}>
                ช่องทาง
                <select
                  className={inputClass}
                  value={sales.channel_id}
                  onChange={(event) =>
                    setSales((current) => ({
                      ...current,
                      channel_id: event.target.value,
                    }))
                  }
                >
                  {channels.map((channel) => (
                    <option value={channel.id} key={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelClass}>
                สถานะ
                <select
                  className={inputClass}
                  value={sales.status}
                  onChange={(event) =>
                    setSales((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="COMPLETED">สำเร็จ</option>
                  <option value="COOKING">กำลังดำเนินการ</option>
                </select>
              </label>
            </div>
            <div className="space-y-3">
              {sales.items.map((item, index) => (
                <div
                  className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_92px_120px_auto]"
                  key={index}
                >
                  <select
                    className={inputClass}
                    aria-label="สินค้า"
                    value={item.product_id}
                    onChange={(event) =>
                      updateSalesItem(index, "product_id", event.target.value)
                    }
                    required
                  >
                    {products.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className={inputClass}
                    aria-label="จำนวน"
                    type="number"
                    min="1"
                    value={item.qty}
                    onChange={(event) =>
                      updateSalesItem(index, "qty", event.target.value)
                    }
                    required
                  />
                  <input
                    className={inputClass}
                    aria-label="ราคา"
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.price}
                    onChange={(event) =>
                      updateSalesItem(index, "price", event.target.value)
                    }
                    required
                  />
                  {sales.items.length > 1 && (
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() =>
                        setSales((current) => ({
                          ...current,
                          items: current.items.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        }))
                      }
                    >
                      ลบ
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setSales((current) => ({
                    ...current,
                    items: [
                      ...current.items,
                      {
                        product_id: products[0]?.id || "",
                        qty: 1,
                        price: products[0]?.price_retail || "",
                      },
                    ],
                  }))
                }
              >
                + เพิ่มสินค้า
              </Button>
              <Button type="submit">
                {salesEditingId ? "บันทึกการแก้ไข" : "เพิ่มยอดขาย"}
              </Button>
              {salesEditingId && (
                <Button type="button" variant="secondary" onClick={resetSales}>
                  ยกเลิก
                </Button>
              )}
            </div>
          </form>
        </Card>
      </Modal>
      ) : null}
      {expenseModalOpen ? (
      <Modal label={expenseEditingId ? "แก้ไขค่าใช้จ่าย" : "เพิ่มค่าใช้จ่าย"} maxWidth="max-w-xl" onClose={resetExpense}>
        <Card>
          <h2 className="text-lg font-bold text-slate-900">
            {expenseEditingId ? "แก้ไขค่าใช้จ่าย" : "เพิ่มค่าใช้จ่าย"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            บันทึกในวันที่ {dateLabel(selectedDate)}
          </p>
          <form className="mt-4 grid gap-4" onSubmit={saveExpense}>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                จำนวนเงิน
                <input
                  className={inputClass}
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={expense.amount}
                  onChange={(event) =>
                    setExpense((current) => ({
                      ...current,
                      amount: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <label className={labelClass}>
                ประเภท
                <select
                  className={inputClass}
                  value={expense.category}
                  onChange={(event) =>
                    setExpense((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                >
                  <option value="OPERATING_EXPENSE">ค่าใช้จ่ายดำเนินงาน</option>
                  <option value="DELIVERY_COST">ค่าขนส่ง</option>
                </select>
              </label>
            </div>
            <label className={labelClass}>
              รายละเอียด
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={expense.description}
                onChange={(event) =>
                  setExpense((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                placeholder="เช่น ค่าขนส่งวัตถุดิบ"
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit">
                {expenseEditingId ? "บันทึกการแก้ไข" : "เพิ่มค่าใช้จ่าย"}
              </Button>
              {expenseEditingId && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={resetExpense}
                >
                  ยกเลิก
                </Button>
              )}
            </div>
          </form>
        </Card>
      </Modal>
      ) : null}
      {detailModal === "sales" ? (
      <Modal label="รายการขาย" maxWidth="max-w-4xl" onClose={() => setDetailModal(null)}>
        <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">รายการขาย</h2>
              <p className="mt-1 text-xs text-slate-500">ค้นหาด้วยเลขออเดอร์ ชื่อลูกค้า หรือหมายเลขสมาชิก และจัดการยกเลิกได้</p>
            </div>
            <span className="text-sm text-slate-500">
              {visibleOrders.length} / {dateOrders.length} รายการ
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input
              aria-label="ค้นหารายการขาย"
              className={inputClass}
              value={orderSearch}
              onChange={(event) => {
                setOrderSearch(event.target.value);
                setOrderNoFilter("ALL");
              }}
              placeholder="เลขที่คำสั่งซื้อ ชื่อลูกค้า หรือเบอร์สมาชิก"
            />
            <select
              aria-label="กรองด้วยเลขออเดอร์"
              className={inputClass}
              value={orderNoFilter}
              onChange={(event) => {
                setOrderNoFilter(event.target.value);
                setOrderSearch("");
              }}
            >
              <option value="ALL">ทุกเลขออเดอร์</option>
              {orderNumbers.map((orderNo) => <option value={orderNo} key={orderNo}>#{orderNo}</option>)}
            </select>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOrderSearch("");
                setOrderNoFilter("ALL");
              }}
            >
              ล้าง
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {visibleOrders.length ? (
              visibleOrders.map((order) => {
                const totals = orderNetAmounts(order);
                return <div
                  className="flex flex-col gap-3 rounded-xl border border-sky-100 p-3 sm:flex-row sm:items-center"
                  key={order.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">
                      #{order.order_no} ·{" "}
                      <span className="text-sky-700">
                        {money(totals.net)}
                      </span>
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {order.channel_name} · {order.items}
                    </p>
                    {(order.customer_name || order.customer_nickname || order.customer_phone) ? (
                      <p className="mt-1 truncate text-xs text-violet-700">
                        ลูกค้า: {order.customer_name || order.customer_nickname || "ไม่ระบุชื่อ"}
                        {order.customer_phone ? ` · ${maskPhone(order.customer_phone)}` : ""}
                      </p>
                    ) : null}
                    {totals.refunded > 0 ? <p className="mt-1 text-xs font-bold text-violet-700">คืนเงินแล้ว {money(totals.refunded)}</p> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Status status={order.status} />
                    {order.rawItems?.length > 0 && (
                      <Button
                        className="text-xs"
                        variant="secondary"
                        onClick={() => editSales(order)}
                      >
                        แก้ไข
                      </Button>
                    )}
                    {String(order.status || "").toUpperCase() !== "CANCELLED" && totals.refunded <= 0 ? (
                      <Button
                        className="text-xs"
                        variant="danger"
                        onClick={() => cancelSalesOrder(order)}
                      >
                        ยกเลิกออเดอร์
                      </Button>
                    ) : null}
                    <Button
                      className="text-xs"
                      variant="danger"
                      onClick={() => onDeleteSales(order)}
                    >
                      ลบ
                    </Button>
                  </div>
                </div>;
              })
            ) : (
              <Empty>ไม่พบรายการขายที่ตรงกับเลขออเดอร์</Empty>
            )}
          </div>
        </Card>
      </Modal>
      ) : null}
      {detailModal === "expenses" ? (
      <Modal label="รายการค่าใช้จ่าย" maxWidth="max-w-3xl" onClose={() => setDetailModal(null)}>
        <Card className="max-h-[calc(100vh-2rem)] overflow-y-auto">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">
              รายการค่าใช้จ่าย
            </h2>
            <span className="text-sm text-slate-500">
              {filteredExpenses.length} รายการ
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {filteredExpenses.length ? (
              filteredExpenses.map((item) => (
                <div
                  className="flex flex-col gap-3 rounded-xl border border-sky-100 p-3 sm:flex-row sm:items-center"
                  key={item.id}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800">
                      {money(item.amount)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {item.category === "DELIVERY_COST"
                        ? "ค่าขนส่ง"
                        : "ค่าใช้จ่ายดำเนินงาน"}
                      {item.description ? ` · ${item.description}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="text-xs"
                      variant="secondary"
                      onClick={() => {
                        setDetailModal(null);
                        setExpenseEditingId(item.id);
                        setExpense({
                          amount: item.amount,
                          category: item.category,
                          description: item.description || "",
                        });
                        setExpenseModalOpen(true);
                      }}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      className="text-xs"
                      variant="danger"
                      onClick={() => onDeleteExpense(item)}
                    >
                      ลบ
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <Empty>ยังไม่มีรายการค่าใช้จ่ายในวันที่เลือก</Empty>
            )}
          </div>
        </Card>
      </Modal>
      ) : null}
    </div>
  );
}

function OperationsZone({
  image,
  title,
  status,
  statusTone = "sky",
  imagePosition = "50% 18%",
  children,
}) {
  const statusStyles = {
    sky: "bg-sky-100 text-sky-700",
    amber: "bg-amber-100 text-amber-700",
    emerald: "bg-emerald-100 text-emerald-700",
  };
  return (
    <article className="overflow-hidden rounded-3xl border border-sky-100 bg-white shadow-sm">
      <div className="relative aspect-[16/9] min-h-44 overflow-hidden bg-sky-100">
        <img
          className="h-full w-full object-cover"
          src={image}
          alt={title}
          loading="lazy"
          style={{ objectPosition: imagePosition }}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-sky-950/60 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <h2 className="text-xl font-bold text-white">{title}</h2>
        </div>
      </div>
      <div className="p-4 sm:p-5">
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${statusStyles[statusTone] || statusStyles.sky}`}
        >
          {status}
        </span>
        <div className="mt-4">{children}</div>
      </div>
    </article>
  );
}

function use3DSceneEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 768px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(viewport.matches && !reducedMotion.matches);
    update();
    viewport.addEventListener("change", update);
    reducedMotion.addEventListener("change", update);
    return () => {
      viewport.removeEventListener("change", update);
      reducedMotion.removeEventListener("change", update);
    };
  }, []);

  return enabled;
}

function LiveWorkflowRoom({
  todayOrders,
  pendingOrders,
  lowStockRows,
  inventoryRows,
  activeOrders,
  financialSummary,
  profitToday,
  isAdmin,
}) {
  const frontCounterTitle = pendingOrders
    ? `กำลังทำ ${pendingOrders} คิว`
    : "พร้อมรับออเดอร์";
  const stockTitle = lowStockRows
    ? `ต้องเติม ${lowStockRows} รายการ`
    : "วัตถุดิบพร้อม";
  const show3DScene = use3DSceneEnabled();

  return (
    <section className="mt-2 overflow-hidden py-3 sm:py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            ห้องปฏิบัติการร้าน
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            ชี้ที่วัตถุดิบบนชั้นวางเพื่อดูข้อมูลสต็อกได้โดยตรง
          </p>
        </div>
      </div>

      <div className="operations-room-scene relative mt-5 aspect-video min-h-[220px] overflow-hidden bg-sky-50">
        {show3DScene ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-sm font-semibold text-sky-700">กำลังเตรียมภาพรวมร้าน...</div>}>
            <OperationsRoom3D
              pendingOrders={pendingOrders}
              lowStockRows={lowStockRows}
              inventoryRows={inventoryRows}
              activeOrders={activeOrders}
              financialSummary={financialSummary}
              isAdmin={isAdmin}
            />
          </Suspense>
        ) : (
          <div className="grid h-full grid-cols-3 gap-2 bg-gradient-to-br from-sky-100 via-cyan-50 to-white p-4 sm:gap-4 sm:p-6">
            <div className="flex flex-col justify-end rounded-2xl border border-white/80 bg-white/75 p-3 shadow-sm"><span className="text-lg">☕</span><strong className="mt-2 text-sm text-slate-900">หน้าร้าน</strong><span className="mt-1 text-xs text-slate-500">{frontCounterTitle}</span></div>
            <div className="flex flex-col justify-end rounded-2xl border border-white/80 bg-white/75 p-3 shadow-sm"><span className="text-lg">▦</span><strong className="mt-2 text-sm text-slate-900">คลังสินค้า</strong><span className="mt-1 text-xs text-slate-500">{stockTitle}</span></div>
            <div className="flex flex-col justify-end rounded-2xl border border-white/80 bg-white/75 p-3 shadow-sm"><span className="text-lg">▤</span><strong className="mt-2 text-sm text-slate-900">การเงิน</strong><span className="mt-1 text-xs text-slate-500">กำไร {money(profitToday)}</span></div>
          </div>
        )}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>
          หน้าร้าน: <strong className="font-semibold text-slate-700">{frontCounterTitle}</strong>
        </span>
        <span>
          สต็อก: <strong className="font-semibold text-slate-700">{stockTitle}</strong>
        </span>
        <span>
          กำไรวันนี้: <strong className="font-semibold text-slate-700">{money(profitToday)}</strong>
        </span>
      </p>
    </section>
  );
}

function OperationsPage({ orders, inventoryRows, expenseRows, isAdmin }) {
  const today = todayInBangkok();
  const todayOrders = useMemo(
    () => orders.filter((order) => rowMatchesDate(order, today)),
    [orders, today],
  );
  const pendingOrders = useMemo(
    () => todayOrders.filter((order) => order.status === "COOKING"),
    [todayOrders],
  );
  const completedOrders = useMemo(
    () => todayOrders.filter((order) => order.status === "COMPLETED"),
    [todayOrders],
  );
  const lowStockRows = useMemo(
    () => inventoryRows.filter(inventoryIsLow),
    [inventoryRows],
  );
  const todayExpenses = useMemo(
    () => expenseRows.filter((expense) => rowMatchesDate(expense, today)),
    [expenseRows, today],
  );
  const expenseTotal = useMemo(
    () =>
      todayExpenses.reduce(
        (total, expense) => total + Number(expense.amount || 0),
        0,
      ),
    [todayExpenses],
  );
  const latestPendingOrder = pendingOrders[0];
  const netToday = todayOrders.reduce(
    (total, order) => total + Number(order.net_revenue || 0),
    0,
  );
  const profitToday = netToday - expenseTotal;

  return (
    <div className="space-y-5">
      <Heading
        title="ภาพรวมการดำเนินงานร้าน"
        description={`ภาพรวมการทำงานประจำวันที่ ${dateLabel(today)} จากข้อมูลจริงในระบบ`}
        action={
          <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            ● ข้อมูลเชื่อมต่อแล้ว
          </span>
        }
      />

      <section className="rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-500 p-5 text-white shadow-lg shadow-sky-200 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-72">
            <div className="rounded-2xl bg-white/15 px-3 py-3 backdrop-blur-sm">
              <strong className="block text-lg">{todayOrders.length}</strong>
              <span className="text-[11px] text-sky-100">ออเดอร์วันนี้</span>
            </div>
            <div className="rounded-2xl bg-white/15 px-3 py-3 backdrop-blur-sm">
              <strong className="block text-lg">{lowStockRows.length}</strong>
              <span className="text-[11px] text-sky-100">สต็อกต้องดู</span>
            </div>
            <div className="rounded-2xl bg-white/15 px-3 py-3 backdrop-blur-sm">
              <strong className="block text-lg">{money(profitToday)}</strong>
              <span className="text-[11px] text-sky-100">กำไรวันนี้</span>
            </div>
          </div>
        </div>
      </section>

      {ENABLE_OPERATIONS_ROOM_3D ? (
        <LiveWorkflowRoom
          todayOrders={todayOrders.length}
          pendingOrders={pendingOrders.length}
          lowStockRows={lowStockRows.length}
          inventoryRows={inventoryRows}
          activeOrders={pendingOrders}
          financialSummary={{
            revenue: netToday,
            expenses: expenseTotal,
            profit: profitToday,
          }}
          profitToday={profitToday}
          isAdmin={isAdmin}
        />
      ) : null}

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <OperationsZone
          image={coffeeBarista}
          imagePosition="50% 14%"
          title="การดำเนินงานหน้าร้าน"
          status={
            pendingOrders.length
              ? `กำลังทำ ${pendingOrders.length} ออเดอร์`
              : "พร้อมรับออเดอร์"
          }
          statusTone={pendingOrders.length ? "amber" : "emerald"}
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-sky-50 p-3">
              <p className="text-xs font-semibold text-slate-500">รับวันนี้</p>
              <strong className="mt-1 block text-2xl text-sky-700">
                {todayOrders.length}
              </strong>
              <p className="text-xs text-slate-500">รายการ</p>
            </div>
            <div className="rounded-2xl bg-emerald-50 p-3">
              <p className="text-xs font-semibold text-slate-500">เสร็จแล้ว</p>
              <strong className="mt-1 block text-2xl text-emerald-700">
                {completedOrders.length}
              </strong>
              <p className="text-xs text-slate-500">รายการ</p>
            </div>
          </div>
          <p className="mt-3 truncate text-sm text-slate-500">
            {latestPendingOrder
              ? `คิวล่าสุด #${latestPendingOrder.order_no || latestPendingOrder.id}`
              : "ยังไม่มีคิวที่กำลังจัดเตรียม"}
          </p>
        </OperationsZone>

        <OperationsZone
          image={stockCoordinator}
          imagePosition="50% 20%"
          title="สินค้าคงคลังวัตถุดิบ"
          status={
            lowStockRows.length
              ? `ต้องตรวจ ${lowStockRows.length} รายการ`
              : "สต็อกพร้อมใช้งาน"
          }
          statusTone={lowStockRows.length ? "amber" : "emerald"}
        >
          <div className="rounded-2xl bg-sky-50 p-3">
            <p className="text-xs font-semibold text-slate-500">
              วัตถุดิบที่ต้องเติมหรือใกล้ถึงขั้นต่ำ
            </p>
            <strong className="mt-1 block text-2xl text-sky-700">
              {lowStockRows.length}
            </strong>
            <p className="text-xs text-slate-500">จากทั้งหมด {inventoryRows.length} รายการ</p>
          </div>
          <p className="mt-3 truncate text-sm text-slate-500">
            {lowStockRows.length
              ? lowStockRows
                  .slice(0, 2)
                  .map((item) => item.name)
                  .join(" · ")
              : "ปริมาณคงเหลืออยู่ในเกณฑ์ที่กำหนด"}
          </p>
        </OperationsZone>

        <OperationsZone
          image={officeCoordinator}
          imagePosition="50% 30%"
          title="การบริหารและการเงิน"
          status="สรุปยอดอัตโนมัติ"
          statusTone="sky"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-sky-50 p-3">
              <p className="text-xs font-semibold text-slate-500">ยอดขายวันนี้</p>
              <strong className="mt-1 block truncate text-lg text-sky-700">
                {money(netToday)}
              </strong>
            </div>
            <div className="rounded-2xl bg-rose-50 p-3">
              <p className="text-xs font-semibold text-slate-500">ค่าใช้จ่ายวันนี้</p>
              <strong className="mt-1 block truncate text-lg text-rose-600">
                {money(expenseTotal)}
              </strong>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            กำไรจากข้อมูลวันนี้ <strong className="text-slate-800">{money(profitToday)}</strong>
          </p>
        </OperationsZone>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">ลำดับงานวันนี้</h2>
              <p className="mt-1 text-sm text-slate-500">
                ติดตามงานแต่ละส่วนจากต้นทางถึงสรุปยอด
              </p>
            </div>
            <span className="text-sm font-semibold text-sky-700">{dateLabel(today)}</span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              ["1", "รับออเดอร์", `${todayOrders.length} รายการวันนี้`, "bg-sky-100 text-sky-700"],
              [
                "2",
                "ตรวจสต็อก",
                lowStockRows.length ? `ต้องเติม ${lowStockRows.length} รายการ` : "ปริมาณพร้อมใช้งาน",
                lowStockRows.length
                  ? "bg-amber-100 text-amber-700"
                  : "bg-emerald-100 text-emerald-700",
              ],
              ["3", "สรุปการเงิน", `กำไร ${money(profitToday)}`, "bg-indigo-100 text-indigo-700"],
            ].map(([step, title, detail, tone]) => (
              <div className="rounded-2xl border border-sky-100 p-4" key={step}>
                <span className={`grid h-8 w-8 place-items-center rounded-full text-sm font-black ${tone}`}>
                  {step}
                </span>
                <h3 className="mt-3 font-bold text-slate-800">{title}</h3>
                <p className="mt-1 text-sm text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-bold text-slate-900">สิ่งที่ต้องดูแล</h2>
          <p className="mt-1 text-sm text-slate-500">รายการที่ควรจัดการก่อน</p>
          <div className="mt-4 space-y-3">
            {lowStockRows.length ? (
              lowStockRows.slice(0, 3).map((item) => (
                <div className="rounded-xl border border-amber-100 bg-amber-50 p-3" key={item.id || item.name}>
                  <p className="font-semibold text-amber-800">{item.name}</p>
                  <p className="mt-1 text-xs text-amber-700">
                    เหลือ {Number(item.stock_qty ?? item.stock ?? 0)} {item.unit || "หน่วย"}
                  </p>
                </div>
              ))
            ) : (
              <Empty>ไม่มีวัตถุดิบที่ต่ำกว่าระดับแจ้งเตือน</Empty>
            )}
            {pendingOrders.length > 0 && (
              <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                <p className="font-semibold text-sky-800">
                  ออเดอร์ที่กำลังทำ {pendingOrders.length} รายการ
                </p>
                <p className="mt-1 text-xs text-sky-700">
                  ตรวจสถานะต่อได้จากเมนูขายและออเดอร์
                </p>
              </div>
            )}
          </div>
        </Card>
      </section>
    </div>
  );
}

export default function GlassLayout({
  user,
  onLogout,
  activeView,
  setActiveView,
  orders,
  channels,
  products,
  diningTables = [],
  inventoryRows,
  inventoryLots,
  suppliers,
  stockReceipts,
  purchaseOrders,
  coupons,
  cashShifts,
  salesBreakdown,
  metrics,
  expenses,
  expenseRows,
  currentShift,
  loyaltySettings,
  loyaltyMembers,
  rolePermissions,
  systemUsers,
  onAdd,
  onLookupLoyalty,
  onUpdateLoyaltySettings,
  onRefreshLoyaltyMembers,
  onCreateLoyaltyMember,
  onUpdateLoyaltyMember,
  onDeleteLoyaltyMember,
  onRefreshRolePermissions,
  onUpdateRolePermissions,
  onCreateRole,
  onDeleteRole,
  onRefreshSystemUsers,
  onAssignUserRole,
  onLoadAuditLogs,
  onValidateCoupon,
  onQuotePromotion,
  onOpenCashShift,
  onCloseCashShift,
  onUpdate,
  onUpdateKitchenStation,
  onReturnOrder,
  onRestock,
  onAdjustInventory,
  onCreateSupplier,
  onUpdateSupplier,
  onFetchSupplierHistory,
  onCreateStockReceipt,
  onCreatePurchaseOrder,
  onUpdatePurchaseOrderStatus,
  onReceivePurchaseOrder,
  onCreateCoupon,
  onUpdateCoupon,
  onCreateChannel,
  onUpdateChannel,
  onCreateDiningTable,
  onUpdateDiningTable,
  onRefreshDiningTables,
  onTableSessionAction,
  onRefreshCashShifts,
  onRefreshSalesBreakdown,
  onRefreshSalesReport,
  onFetchDailyClosing,
  onCloseBusinessDay,
  onCreateInventory,
  onUpdateInventory,
  onDeleteInventory,
  onCreateMenu,
  onUpdateMenu,
  onDeleteMenu,
  onSetMenuAvailability,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateSales,
  onUpdateSales,
  onDeleteSales,
}) {
  const visibleNavigationGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const isSystemAdmin = user?.role === "admin" && (!user?.role_key || user.role_key === "admin");
        if (isSystemAdmin) return true;
        return user?.permissions?.[item.id]?.view === true;
      }),
    }))
    .filter((group) => group.items.length);
  const activeCategoryGroup = visibleNavigationGroups.find(
    (group) => activeView === categoryViewId(group.id),
  );
  const currentNavigationGroup = visibleNavigationGroups.find(
    (group) => group.items.some((item) => item.id === activeView || (item.id === "pos" && activeView === "orders")),
  );
  const backView = activeCategoryGroup
    ? "home"
    : currentNavigationGroup
      ? categoryViewId(currentNavigationGroup.id)
      : "home";
  const content =
    activeView === "home" ? (
      <AdminHomePage
        groups={visibleNavigationGroups}
        summary={{
          pendingOrders: orders.filter((order) => ["COOKING", "READY"].includes(order.status)).length,
          lowStock: inventoryRows.filter((item) => Number(item.stock_qty || 0) <= Number(item.min_stock_alert || 0)).length,
          netSales: metrics?.net || 0,
        }}
        onNavigate={setActiveView}
      />
    ) : activeCategoryGroup ? (
      <CategoryHubPage
        group={activeCategoryGroup}
        onNavigate={setActiveView}
      />
    ) : activeView === "cash-shifts" && user?.role === "admin" ? (
      <CashShiftPage
        currentShift={currentShift}
        shifts={cashShifts}
        onOpenCashShift={onOpenCashShift}
        onCloseCashShift={onCloseCashShift}
        onRefresh={onRefreshCashShifts}
      />
    ) : activeView === "tables" && user?.role === "admin" ? (
      <TableManagementPage
        tables={diningTables}
        orders={orders}
        onCreate={onCreateDiningTable}
        onUpdate={onUpdateDiningTable}
        onRefresh={onRefreshDiningTables}
        onSessionAction={onTableSessionAction}
      />
    ) : activeView === "alerts" ? (
      <AlertsPage
        products={products}
        inventoryRows={inventoryRows}
        inventoryLots={inventoryLots}
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
        onNavigate={setActiveView}
        onCreatePurchaseOrder={onCreatePurchaseOrder}
        onUpdatePurchaseOrderStatus={onUpdatePurchaseOrderStatus}
        onReceivePurchaseOrder={onReceivePurchaseOrder}
      />
    ) : activeView === "inventory" ? (
      <IngredientsPage
        rows={inventoryRows}
        lots={inventoryLots}
        suppliers={suppliers}
        receipts={stockReceipts}
        onCreate={onCreateInventory}
        onUpdate={onUpdateInventory}
        onDelete={onDeleteInventory}
        onRestock={onRestock}
        onAdjust={onAdjustInventory}
        onCreateSupplier={onCreateSupplier}
        onCreateReceipt={onCreateStockReceipt}
      />
    ) : activeView === "procurement" && user?.role === "admin" ? (
      <ProcurementPage
        inventoryRows={inventoryRows}
        suppliers={suppliers}
        receipts={stockReceipts}
        purchaseOrders={purchaseOrders}
        onNavigate={setActiveView}
        onCreateSupplier={onCreateSupplier}
        onUpdateSupplier={onUpdateSupplier}
        onFetchSupplierHistory={onFetchSupplierHistory}
        onCreateReceipt={onCreateStockReceipt}
        onCreatePurchaseOrder={onCreatePurchaseOrder}
        onUpdatePurchaseOrderStatus={onUpdatePurchaseOrderStatus}
        onReceivePurchaseOrder={onReceivePurchaseOrder}
      />
    ) : activeView === "menu" ? (
      <MenusPage
        products={products}
        ingredients={inventoryRows}
        channels={channels}
        onCreate={onCreateMenu}
        onUpdate={onUpdateMenu}
        onDelete={onDeleteMenu}
        onSetAvailability={onSetMenuAvailability}
      />
    ) : activeView === "coupons" && user?.role === "admin" ? (
      <CouponPage
        coupons={coupons}
        onCreateCoupon={onCreateCoupon}
        onUpdateCoupon={onUpdateCoupon}
      />
    ) : activeView === "loyalty-settings" && user?.role === "admin" ? (
      <LoyaltySettingsPage
        settings={loyaltySettings}
        onSave={onUpdateLoyaltySettings}
      />
    ) : activeView === "loyalty-members" && user?.role === "admin" ? (
      <LoyaltyMembersPage
        members={loyaltyMembers}
        onRefresh={onRefreshLoyaltyMembers}
        onCreate={onCreateLoyaltyMember}
        onUpdate={onUpdateLoyaltyMember}
        onDelete={onDeleteLoyaltyMember}
      />
    ) : activeView === "role-permissions" && user?.role === "admin" ? (
      <RolePermissionsPage
        profiles={rolePermissions}
        users={systemUsers}
        onRefresh={onRefreshRolePermissions}
        onSave={onUpdateRolePermissions}
        onCreate={onCreateRole}
        onDelete={onDeleteRole}
        onRefreshUsers={onRefreshSystemUsers}
        onAssignUserRole={onAssignUserRole}
      />
    ) : activeView === "audit-logs" && user?.role === "admin" ? (
      <AuditLogPage onLoad={onLoadAuditLogs} />
    ) : activeView === "sales-channels" && user?.role === "admin" ? (
      <SalesChannelsPage
        channels={channels}
        onCreateChannel={onCreateChannel}
        onUpdateChannel={onUpdateChannel}
      />
    ) : activeView === "printing" && user?.role === "admin" ? (
      <PrintingSettingsPage />
    ) : activeView === "business-reports" && user?.role === "admin" ? (
      <ManagementReportPanel onLoad={onRefreshSalesReport} />
    ) : activeView === "finance" ? (
      <FinancePage
        metrics={metrics}
        expenses={expenses}
        expenseRows={expenseRows}
        orders={orders}
        channels={channels}
        products={products}
        salesBreakdown={salesBreakdown}
        onCreateExpense={onCreateExpense}
        onUpdateExpense={onUpdateExpense}
        onDeleteExpense={onDeleteExpense}
        onCreateSales={onCreateSales}
        onUpdateSales={onUpdateSales}
        onDeleteSales={onDeleteSales}
        onUpdateOrderStatus={onUpdate}
        onRefreshSalesBreakdown={onRefreshSalesBreakdown}
        onRefreshSalesReport={onRefreshSalesReport}
        onFetchDailyClosing={onFetchDailyClosing}
        onCloseBusinessDay={onCloseBusinessDay}
      />
    ) : activeView === "operations" ? (
      <OperationsPage
        orders={orders}
        inventoryRows={inventoryRows}
        expenseRows={expenseRows}
        isAdmin={user?.role === "admin"}
      />
    ) : activeView === "kitchen" ? (
      <KitchenDisplayPage orders={orders} onUpdate={onUpdate} onUpdateStation={onUpdateKitchenStation} />
    ) : activeView === "orders" ? (
      <OrdersPage orders={orders} onUpdate={onUpdate} onReturn={onReturnOrder} onBack={() => setActiveView("pos")} />
    ) : (
      <div className="space-y-5">
        <OrdersPage orders={orders} onUpdate={onUpdate} onReturn={onReturnOrder} preview onViewAll={() => setActiveView("orders")} />
        <PosPage
          channels={channels}
          diningTables={diningTables}
          products={products}
          currentShift={currentShift}
          loyaltySettings={loyaltySettings}
          onAdd={onAdd}
          onLookupLoyalty={onLookupLoyalty}
          onValidateCoupon={onValidateCoupon}
          onQuotePromotion={onQuotePromotion}
          onOpenCashShift={onOpenCashShift}
          onCloseCashShift={onCloseCashShift}
        />
      </div>
  );
  return (
    <div className="app-viewport admin-viewport shop-scene text-slate-800">
      <header className="shop-topbar sticky top-0 z-20 border-b px-4 py-3 sm:px-5 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="shop-orb grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-600 font-black text-white">
              S
            </span>
            <strong className="truncate text-slate-900">STOCKPOS</strong>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeView !== "home" ? (
              <button
                aria-label="ย้อนกลับ"
                className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100 sm:text-sm"
                type="button"
                onClick={() => setActiveView(backView)}
              >
                <span aria-hidden="true">←</span><span className="ml-1 hidden sm:inline">ย้อนกลับ</span>
              </button>
            ) : null}
            <button
              aria-label="กลับหน้าหลัก"
              className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100 sm:text-sm"
              type="button"
              onClick={() => setActiveView("home")}
            >
              <span aria-hidden="true">⌂</span><span className="ml-1">หน้าหลัก</span>
            </button>
            <button
              aria-label="ออกจากระบบ"
              className="shrink-0 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100"
              type="button"
              onClick={onLogout}
            >
              <span aria-hidden="true">↪</span><span className="ml-1 hidden sm:inline">ออกจากระบบ</span>
            </button>
          </div>
        </div>
      </header>
      <main className="admin-workspace relative mx-auto w-full p-4 pb-8 sm:p-5 lg:max-w-[1440px] lg:p-6">
        {content}
      </main>
    </div>
  );
}

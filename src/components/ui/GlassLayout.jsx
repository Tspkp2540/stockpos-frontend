import { useEffect, useMemo, useState } from "react";
import coffeeBarista from "../../assets/coffee-barista-kin-cha-kan-sky.png";
import officeCoordinator from "../../assets/operations-office-coordinator.png";
import stockCoordinator from "../../assets/operations-stock-coordinator.png";
import OperationsRoom3D from "./OperationsRoom3D";
import MenuModifierPicker from "./MenuModifierPicker";
import { exportExcel } from "../../utils/exportExcel";
import { menuAvailability, menuAvailabilityLabel } from "../../utils/menuAvailability";
import { maskPhone } from "../../utils/phone";
import { printReceipt } from "../../utils/printReceipt";

const navigation = [
  { id: "pos", icon: "▣", label: "ขายและออเดอร์" },
  { id: "kitchen", icon: "☕", label: "จอเตรียมสินค้า" },
  { id: "operations", icon: "◉", label: "ศูนย์ปฏิบัติการ" },
  { id: "alerts", icon: "⚠", label: "แจ้งเตือน" },
  { id: "inventory", icon: "□", label: "วัตถุดิบ" },
  { id: "menu", icon: "☷", label: "เมนูสินค้า" },
  { id: "finance", icon: "฿", label: "การเงิน" },
];

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
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

function Status({ status }) {
  const styles =
    status === "COMPLETED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "CANCELLED"
        ? "bg-rose-50 text-rose-700"
        : "bg-amber-50 text-amber-700";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${styles}`}
    >
      {status}
    </span>
  );
}

function Heading({ eyebrow, title, description, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
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

function OrdersPage({ orders, onUpdate }) {
  return (
    <div className="space-y-5">
      <Heading
        eyebrow="Order management"
        title="รายการขายและออเดอร์"
        description="ติดตามสถานะออเดอร์ทั้งหมดจากจุดเดียว"
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {orders.length ? (
          orders.map((order) => (
            <article
              className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm"
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
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <strong className="text-lg text-sky-700">
                  {money(order.net_revenue)}
                </strong>
                {order.status === "COOKING" ? (
                  <div className="flex gap-2">
                    <Button
                      className="text-xs"
                      onClick={() => onUpdate(order.id, "READY")}
                    >
                      พร้อมรับ
                    </Button>
                    <Button
                      className="text-xs"
                      variant="danger"
                      onClick={() => onUpdate(order.id, "CANCELLED")}
                    >
                      ยกเลิก
                    </Button>
                  </div>
                ) : order.status === "READY" ? (
                  <div className="flex gap-2">
                    <Button className="text-xs" onClick={() => onUpdate(order.id, "COMPLETED")}>
                      ส่งมอบแล้ว
                    </Button>
                    <Button className="text-xs" variant="secondary" onClick={() => printReceipt(order)}>
                      ใบเสร็จ
                    </Button>
                  </div>
                ) : (
                  <Button className="text-xs" variant="secondary" onClick={() => printReceipt(order)}>
                    ใบเสร็จ
                  </Button>
                )}
              </div>
            </article>
          ))
        ) : (
          <Empty>ยังไม่มีออเดอร์</Empty>
        )}
      </div>
    </div>
  );
}

function KitchenDisplayPage({ orders, onUpdate }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const activeOrders = orders.filter((order) => !["COMPLETED", "CANCELLED"].includes(order.status));
  const elapsed = (order) => {
    const createdAt = new Date(order.created_at || order.order_date || now).getTime();
    const minutes = Math.max(0, Math.floor((now - createdAt) / 60000));
    return minutes ? `รอ ${minutes} นาที` : "เพิ่งเข้าคิว";
  };
  const Ticket = ({ order }) => {
    const rawItems = Array.isArray(order.rawItems) ? order.rawItems : [];
    const isReady = order.status === "READY";
    return (
      <article className={`rounded-2xl border bg-white p-4 shadow-sm ${isReady ? "border-emerald-200" : "border-amber-200"}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-black text-slate-900">คิว {order.queue_no || "-"}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">#{order.order_no} · {elapsed(order)}</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
            {isReady ? "พร้อมรับ" : "กำลังทำ"}
          </span>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-500">{order.customer_nickname || order.customer_name || "ไม่ระบุชื่อลูกค้า"} · {order.channel_name || "หน้าร้าน"}</p>
          <ul className="mt-2 space-y-2 text-sm text-slate-700">
            {rawItems.length ? rawItems.map((item, index) => (
              <li key={`${item.product_id || item.name}-${index}`}>
                <span className="font-bold">{item.name} × {item.quantity ?? item.qty}</span>
                {(item.modifiers || []).length ? (
                  <span className="mt-0.5 block text-xs text-violet-700">{item.modifiers.map((modifier) => modifier.name).join(" · ")}</span>
                ) : null}
              </li>
            )) : <li>{order.items || "ไม่มีรายละเอียดสินค้า"}</li>}
          </ul>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button className="flex-1" onClick={() => onUpdate(order.id, isReady ? "COMPLETED" : "READY")}>
            {isReady ? "ส่งมอบแล้ว" : "ทำเสร็จ / พร้อมรับ"}
          </Button>
          <Button className="text-xs" variant="secondary" onClick={() => printReceipt(order)}>
            ใบเสร็จ
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
        eyebrow="Kitchen display"
        title="จอเตรียมสินค้า"
        description="จัดการคิวแบบสองขั้น: กำลังทำ → พร้อมรับ → ส่งมอบแล้ว"
        action={<span className="rounded-full bg-sky-100 px-3 py-2 text-sm font-bold text-sky-700">{activeOrders.length} คิวที่ต้องดูแล</span>}
      />
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-amber-950">กำลังทำ</h2><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-amber-700">{cooking.length}</span></div>
          <div className="grid gap-3">{cooking.length ? cooking.map((order) => <Ticket key={order.id} order={order} />) : <Empty>ไม่มีคิวกำลังทำ</Empty>}</div>
        </section>
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-emerald-950">พร้อมรับสินค้า</h2><span className="rounded-full bg-white px-3 py-1 text-sm font-bold text-emerald-700">{ready.length}</span></div>
          <div className="grid gap-3">{ready.length ? ready.map((order) => <Ticket key={order.id} order={order} />) : <Empty>ยังไม่มีรายการที่พร้อมรับ</Empty>}</div>
        </section>
      </div>
    </div>
  );
}

function PosPage({ channels, products, currentShift, onAdd, onValidateCoupon, onOpenCashShift, onCloseCashShift }) {
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [cart, setCart] = useState([]);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [editingCartKey, setEditingCartKey] = useState(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0),
        0,
      ),
    [cart],
  );
  const manualDiscountAmount = useMemo(() => {
    const value = Math.max(0, Number(discountValue) || 0);
    return discountType === "percent"
      ? Math.min(subtotal, subtotal * Math.min(value, 100) / 100)
      : Math.min(subtotal, value);
  }, [discountType, discountValue, subtotal]);
  const couponDiscountAmount = useMemo(() => {
    if (!appliedCoupon) return 0;
    const eligibleAmount = Math.max(0, subtotal - manualDiscountAmount);
    if (eligibleAmount < Number(appliedCoupon.min_order_amount || 0)) return 0;
    const rawDiscount = appliedCoupon.discount_type === "PERCENT"
      ? eligibleAmount * Math.min(Number(appliedCoupon.discount_value || 0), 100) / 100
      : Number(appliedCoupon.discount_value || 0);
    const cappedDiscount = Number(appliedCoupon.max_discount_amount || 0) > 0
      ? Math.min(rawDiscount, Number(appliedCoupon.max_discount_amount))
      : rawDiscount;
    return Math.min(eligibleAmount, cappedDiscount);
  }, [appliedCoupon, manualDiscountAmount, subtotal]);
  const total = Math.max(0, subtotal - manualDiscountAmount - couponDiscountAmount);
  const receivedAmount = Number(amountReceived || 0);
  const changeAmount = paymentMethod === "CASH" && receivedAmount >= total
    ? receivedAmount - total
    : 0;
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
              price: Number(product.price_retail || 0) + modifierAdjustment,
              modifiers,
              modifier_groups: product.modifier_groups || [],
              qty: 1,
            },
        ];
    });
  };
  const addItem = (product) => {
    if (!menuAvailability(product).isAvailable) return;
    if ((product.modifier_groups || []).length) {
      setEditingCartKey(null);
      setPendingProduct(product);
      return;
    }
    addConfiguredItem(product);
  };
  const editCartModifiers = (cartKey) => {
    const item = cart.find((row) => row.cart_key === cartKey);
    if (!item) return;
    const product = products.find((row) => String(row.id) === String(item.product_id)) || {
      id: item.product_id,
      name: item.name,
      price_retail: item.base_price,
      modifier_groups: item.modifier_groups || [],
    };
    if (!(product.modifier_groups || []).length) return;
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
  const manageCashShift = async () => {
    if (currentShift) {
      const closingCash = window.prompt(
        `ยอดเงินสดที่ควรมี ${money(Number(currentShift.opening_cash || 0) + Number(currentShift.cash_sales || 0))}\nกรอกยอดที่นับได้เพื่อปิดกะ`,
      );
      if (closingCash === null) return;
      const closed = await onCloseCashShift?.(currentShift.id, closingCash);
      if (closed) window.alert(`ปิดกะแล้ว\nยอดต่าง: ${money(closed.difference_amount)}`);
      return;
    }
    const openingCash = window.prompt("เงินทอนเริ่มกะ", "0");
    if (openingCash === null) return;
    await onOpenCashShift?.(openingCash);
  };
  const submit = async () => {
    if (!cart.length) return;
    if (paymentMethod === "CASH" && total > 0 && (!currentShift || receivedAmount < total)) {
      return window.alert(!currentShift ? "กรุณาเปิดกะเงินสดก่อนรับเงินสด" : "ยอดที่รับต้องไม่น้อยกว่ายอดสุทธิ");
    }
    const channel = channels.find(
      (item) => String(item.id) === String(channelId),
    );
    const saved = await onAdd({
      channel_id: Number(channelId),
      channel_name: channel?.name,
      total,
      customer_name: customerName.trim(),
      customer_nickname: customerName.trim(),
      customer_phone: customerPhone.trim(),
      manual_discount_amount: Number(manualDiscountAmount.toFixed(2)),
      coupon_code: appliedCoupon?.code || undefined,
      payment_method: paymentMethod,
      amount_received: paymentMethod === "CASH" ? receivedAmount : undefined,
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
      setCouponError("");
      setPaymentMethod("CASH");
      setAmountReceived("");
    }
  };
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div>
        <Heading
          eyebrow="Point of sale"
          title="เปิดรายการขาย"
          description="เลือกช่องทางและเมนู แล้วส่งออเดอร์ได้ทันที"
        />
        <LowStockMenuAlert products={products} className="mb-5" />
        <Card>
          <fieldset>
            <legend className="mb-3 text-sm font-bold text-slate-800">
              ช่องทางการขาย
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {channels.map((channel) => (
                <label
                  className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 transition ${String(channel.id) === String(channelId) ? "border-sky-500 bg-sky-50" : "border-sky-100 hover:border-sky-300"}`}
                  key={channel.id}
                >
                  <span className="text-sm font-semibold text-slate-700">
                    {channel.name}
                  </span>
                  <input
                    className="h-4 w-4 accent-sky-600"
                    type="radio"
                    name="channel"
                    checked={String(channel.id) === String(channelId)}
                    onChange={() => setChannelId(channel.id)}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        </Card>
        <Card className="mt-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">เมนูขาย</h2>
            <span className="text-sm text-slate-500">
              {products.length} รายการ
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => {
              const availability = menuAvailability(product);
              return (
                <button
                  className={`min-w-0 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-4 ${availability.isAvailable ? "border-sky-100 bg-sky-50/40 hover:border-sky-400 hover:bg-sky-50 focus:ring-sky-100" : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-65 focus:ring-slate-100"}`}
                  disabled={!availability.isAvailable}
                  key={product.id}
                  onClick={() => addItem(product)}
                >
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg shadow-sm">
                    {product.icon || "▦"}
                  </span>
                  <p className="mt-3 truncate font-bold text-slate-800">
                    {product.name}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-sky-700">
                    {money(product.price_retail)}
                  </p>
                  <p className={`mt-2 text-xs font-semibold ${availability.isAvailable ? "text-emerald-700" : "text-rose-600"}`}>
                    {menuAvailabilityLabel(product)}
                  </p>
                </button>
              );
            })}
          </div>
        </Card>
      </div>
      <aside className="xl:sticky xl:top-5 xl:self-start">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">ตะกร้าสินค้า</h2>
            <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">
              {cart.length} รายการ
            </span>
          </div>
          <div className="my-4 space-y-3">
            {cart.length ? (
              cart.map((item) => (
                <div
                  className="rounded-xl border border-sky-100 p-3"
                  key={item.cart_key}
                >
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-800">
                        {item.name}
                      </p>
                      <p className="text-sm text-sky-700">
                        {money(item.price)}
                      </p>
                      {item.modifiers?.length ? (
                        <p className="mt-1 text-xs text-violet-700">
                          {item.modifiers.map((modifier) => modifier.name).join(" · ")}
                        </p>
                      ) : null}
                      {(item.modifier_groups?.length || products.find((product) => String(product.id) === String(item.product_id))?.modifier_groups?.length) ? (
                        <button
                          className="mt-2 text-xs font-bold text-violet-700 hover:text-violet-900"
                          onClick={() => editCartModifiers(item.cart_key)}
                        >
                          ปรับความหวาน / ท็อปปิ้ง
                        </button>
                      ) : null}
                    </div>
                    <Button
                      className="px-2 py-1 text-xs"
                      variant="danger"
                      onClick={() =>
                        setCart((current) =>
                          current.filter(
                            (row) => row.cart_key !== item.cart_key,
                          ),
                        )
                      }
                    >
                      ลบ
                    </Button>
                  </div>
                  <label className="mt-2 grid gap-1 text-xs font-medium text-slate-500">
                    จำนวน
                    <input
                      className={inputClass}
                      type="number"
                      min="1"
                      value={item.qty}
                      onChange={(event) =>
                        changeQty(item.cart_key, event.target.value)
                      }
                    />
                  </label>
                </div>
              ))
            ) : (
              <Empty>เลือกเมนูจากรายการด้านซ้าย</Empty>
            )}
          </div>
          <div className="space-y-3 border-t border-sky-100 pt-4">
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
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="เช่น 0812345678"
                />
              </label>
            </div>
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
            <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-slate-700">การชำระเงิน</p>
                <button className="text-xs font-semibold text-sky-700" onClick={manageCashShift}>
                  {currentShift ? "ปิดกะเงินสด" : "เปิดกะเงินสด"}
                </button>
              </div>
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
              <p className={`mt-2 text-xs ${paymentMethod === "CASH" && !currentShift ? "text-rose-600" : "text-slate-500"}`}>
                {paymentMethod === "CASH"
                  ? currentShift
                    ? `กะเปิดอยู่ · เงินทอนเริ่มกะ ${money(currentShift.opening_cash)}`
                    : "ต้องเปิดกะเงินสดก่อนรับชำระด้วยเงินสด"
                  : "การชำระเงินแบบนี้ไม่รวมในยอดเงินสดของกะ"}
              </p>
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
              {appliedCoupon ? (
                <div className="flex items-center justify-between text-emerald-700">
                  <span>คูปอง {appliedCoupon.code}</span>
                  <span>-{money(couponDiscountAmount)}</span>
                </div>
              ) : null}
            </div>
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold text-slate-600">ยอดสุทธิ</span>
              <strong className="text-2xl text-sky-700">{money(total)}</strong>
            </div>
            <Button className="w-full" disabled={!cart.length} onClick={submit}>
              ยืนยันออเดอร์
            </Button>
          </div>
        </Card>
      </aside>
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
    </div>
  );
}

function StockReceivingPanel({ rows, suppliers, receipts, onCreateSupplier, onCreateReceipt }) {
  const emptyLine = () => ({ ingredient_id: "", quantity: "", unit_cost: "", lot_no: "", expiry_date: "" });
  const [supplierId, setSupplierId] = useState("");
  const [receivedAt, setReceivedAt] = useState(localDateTimeValue);
  const [note, setNote] = useState("");
  const [receiptItems, setReceiptItems] = useState([emptyLine()]);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
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
    setShowSupplierForm(false);
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
  };
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Purchase receiving</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">รับวัตถุดิบเข้าคลัง</h2>
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
          <button className="text-xs font-bold text-sky-700 hover:text-sky-900" onClick={() => setShowSupplierForm((current) => !current)}>
            {showSupplierForm ? "ซ่อนแบบฟอร์ม" : "+ เพิ่มผู้ขาย"}
          </button>
        </div>
        {showSupplierForm ? (
          <form className="mt-3 grid gap-2 sm:grid-cols-3" onSubmit={submitSupplier}>
            <input className={inputClass} value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} placeholder="ชื่อผู้ขาย" required />
            <input className={inputClass} value={supplierForm.contact_name} onChange={(event) => setSupplierForm((current) => ({ ...current, contact_name: event.target.value }))} placeholder="ผู้ติดต่อ" />
            <div className="flex gap-2"><input className={inputClass} value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} placeholder="เบอร์โทร" /><Button type="submit" className="shrink-0">บันทึก</Button></div>
          </form>
        ) : null}
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
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-700">Stock control</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">ตรวจนับ / บันทึกของเสีย: {item.name}</h2>
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
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-700">Lot tracking · FEFO</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">ล็อตคงเหลือ: {item.name}</h2>
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
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [viewingLotsItem, setViewingLotsItem] = useState(null);
  const save = async (event) => {
    event.preventDefault();
    const saved = editingId
      ? await onUpdate(editingId, form)
      : await onCreate(form);
    if (saved) {
      setForm(initial);
      setEditingId(null);
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
  };
  const updateField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  return (
    <div className="space-y-5">
      <Heading
        eyebrow="Inventory"
        title="วัตถุดิบ"
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
              }}
            >
              + เพิ่มวัตถุดิบ
            </Button>
          </div>
        }
      />
      <StockReceivingPanel
        rows={rows}
        suppliers={suppliers}
        receipts={receipts}
        onCreateSupplier={onCreateSupplier}
        onCreateReceipt={onCreateReceipt}
      />
      {adjustingItem ? (
        <InventoryAdjustmentPanel
          key={adjustingItem.id}
          item={adjustingItem}
          onSubmit={onAdjust}
          onClose={() => setAdjustingItem(null)}
        />
      ) : null}
      {viewingLotsItem ? (
        <InventoryLotsPanel
          key={viewingLotsItem.id}
          item={viewingLotsItem}
          lots={lots}
          onClose={() => setViewingLotsItem(null)}
        />
      ) : null}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
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
        <aside className="order-first xl:order-none xl:sticky xl:top-5 xl:self-start">
          <Card>
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? "แก้ไขวัตถุดิบ" : "เพิ่มวัตถุดิบ"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              กรอกข้อมูลให้ครบเพื่อบันทึกเข้าคลัง
            </p>
            <form className="mt-5 grid gap-4" onSubmit={save}>
              <label className={labelClass}>
                ชื่อวัตถุดิบ
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
                  หน่วยนับ
                  <input
                    className={inputClass}
                    value={form.unit}
                    onChange={updateField("unit")}
                    placeholder="เช่น ขวด"
                    required
                  />
                </label>
                <label className={labelClass}>
                  จำนวนคงเหลือ
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
                    }}
                  >
                    ยกเลิก
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MenusPage({ products, ingredients, onCreate, onUpdate, onDelete, onSetAvailability }) {
  const initial = {
    name: "",
    category: "",
    price_retail: "",
    price_wholesale: "",
    recipe: [],
    modifiers: [],
  };
  const [form, setForm] = useState(initial);
  const [editingId, setEditingId] = useState(null);
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
  const save = async (event) => {
    event.preventDefault();
    if (!form.recipe.length)
      return window.alert("กรุณาเลือกวัตถุดิบอย่างน้อย 1 รายการ");
    const saved = editingId
      ? await onUpdate(editingId, form)
      : await onCreate(form);
    if (saved) {
      setForm(initial);
      setEditingId(null);
    }
  };
  const edit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      category: product.category || "",
      price_retail: product.price_retail || "",
      price_wholesale: product.price_wholesale || "",
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
    });
  };
  return (
    <div className="space-y-5">
      <Heading
        eyebrow="Catalog"
        title="เมนูสินค้า"
        description="จัดการเมนูขายและสูตรวัตถุดิบ แยกจากหน้าคลังสินค้า"
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setForm(initial);
              setEditingId(null);
            }}
          >
            + เพิ่มเมนู
          </Button>
        }
      />
      <LowStockMenuAlert products={products} className="mb-5" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">รายการเมนู</h2>
            <span className="text-sm text-slate-500">
              {products.length} รายการ
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {products.length ? (
              products.map((product) => {
                const availability = menuAvailability(product);
                return (
                  <article
                    className="rounded-2xl border border-sky-100 p-4"
                    key={product.id}
                  >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-sky-50 text-xl">
                      {product.icon || "▦"}
                    </span>
                    <strong className="text-sky-700">
                      {money(product.price_retail)}
                    </strong>
                  </div>
                  <h3 className="mt-4 truncate font-bold text-slate-900">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {product.category || "ไม่มีหมวดหมู่"}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    สูตร {product.recipe?.length || 0} วัตถุดิบ
                  </p>
                  <p className="mt-1 text-xs text-violet-600">
                    ตัวเลือก {product.modifier_groups?.length || 0} กลุ่ม
                  </p>
                  <p className={`mt-2 text-xs font-bold ${availability.isAvailable ? "text-emerald-700" : "text-rose-600"}`}>
                    {menuAvailabilityLabel(product)}
                  </p>
                  {!availability.isAvailable && !availability.manuallySoldOut ? (
                    <p className="mt-1 text-xs text-slate-500">เปิดขายได้อัตโนมัติเมื่อมีล็อตวัตถุดิบที่ยังไม่หมดอายุเพียงพอ</p>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      className="flex-1 text-xs"
                      variant="secondary"
                      onClick={() => edit(product)}
                    >
                      แก้ไข
                    </Button>
                    <Button
                      className="text-xs"
                      variant={availability.manuallySoldOut ? "primary" : "secondary"}
                      onClick={() => onSetAvailability(product, !availability.manuallySoldOut)}
                    >
                      {availability.manuallySoldOut ? "เปิดขาย" : "ปิดขาย"}
                    </Button>
                    <Button
                      className="text-xs"
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
        <aside className="order-first xl:order-none xl:sticky xl:top-5 xl:self-start">
          <Card>
            <h2 className="text-lg font-bold text-slate-900">
              {editingId ? "แก้ไขเมนู" : "เพิ่มเมนู"}
            </h2>
            <form className="mt-5 grid gap-4" onSubmit={save}>
              <label className={labelClass}>
                ชื่อเมนู
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
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
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
                  ราคาขาย
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
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-3">
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
              <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3">
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
                    }}
                  >
                    ยกเลิก
                  </Button>
                )}
              </div>
            </form>
          </Card>
        </aside>
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
        eyebrow="Finance"
        title="การเงินและบันทึกยอดขาย"
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
const dateLabel = (date) =>
  new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
const rowMatchesDate = (row, selectedDate) =>
  !row?.created_at
    ? selectedDate === todayInBangkok()
    : bangkokDate(row.created_at) === selectedDate;
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
    if (!items.length) return window.alert("กรุณาระบุจำนวนที่จะสั่งอย่างน้อย 1 รายการ");
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
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Purchase suggestion</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">รายการสั่งซื้อแนะนำ</h2>
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
    if (!window.confirm(`ยืนยันรับของตาม ${order.po_no} เข้าคลังหรือไม่? รายการนี้จะสร้างล็อตและปรับยอดคงเหลือทันที`)) return;
    const saved = await onReceive?.(order, { received_at: receivedAt, note, items });
    if (saved) onClose();
  };
  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">Purchase order receiving</p>
          <h2 className="mt-1 text-lg font-bold text-slate-900">ตรวจรับสินค้า: {order.po_no}</h2>
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
      {receivingOrder ? <ReceivePurchaseOrderPanel key={receivingOrder.id} order={receivingOrder} onClose={() => setReceivingOrder(null)} onReceive={onReceive} /> : null}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Purchase orders</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">ใบสั่งซื้อล่าสุด</h2>
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
        eyebrow="Live alerts"
        title="ศูนย์แจ้งเตือน"
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

const exportFinance = ({ selectedDate, orders, expenses, summary }) =>
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
        rows: orders.map((order) => ({
          date: bangkokDate(order.created_at) || selectedDate,
          orderNo: order.order_no || "",
          channel: order.channel_name || "",
          status: order.status || "",
          items: order.items || "",
          gross: Number(order.gross_amount ?? order.net_revenue ?? 0),
          net: Number(order.net_revenue || 0),
          cogs: Number(order.total_cogs || 0),
          profit: Number(order.net_profit ?? order.net_revenue ?? 0),
        })),
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
    ],
  });

function FinancePage({
  expenseRows,
  orders,
  channels,
  products,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateSales,
  onUpdateSales,
  onDeleteSales,
}) {
  const [selectedDate, setSelectedDate] = useState(todayInBangkok);
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
  const filteredOrders = useMemo(
    () => orders.filter((order) => rowMatchesDate(order, selectedDate)),
    [orders, selectedDate],
  );
  const filteredExpenses = useMemo(
    () => expenseRows.filter((item) => rowMatchesDate(item, selectedDate)),
    [expenseRows, selectedDate],
  );
  const summary = useMemo(() => {
    const salesTotals = filteredOrders.reduce(
      (totals, order) => ({
        gross:
          totals.gross + Number(order.gross_amount ?? order.net_revenue ?? 0),
        net: totals.net + Number(order.net_revenue || 0),
        cogs: totals.cogs + Number(order.total_cogs || 0),
        profit:
          totals.profit + Number(order.net_profit ?? order.net_revenue ?? 0),
      }),
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
  }, [filteredExpenses, filteredOrders]);
  const statCards = [
    ["ยอดขายรวม", summary.gross],
    ["ยอดสุทธิ", summary.net],
    ["ต้นทุนสินค้า", summary.cogs],
    ["ค่าใช้จ่าย", summary.expenses],
    ["กำไรสุทธิ", summary.profit],
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
    }
  };
  const resetSales = () => {
    setSalesEditingId(null);
    setSales(newSales());
  };
  const resetExpense = () => {
    setExpenseEditingId(null);
    setExpense({ amount: "", category: "OPERATING_EXPENSE", description: "" });
  };
  return (
    <div className="space-y-5">
      <Heading
        eyebrow="Finance"
        title="การเงินและบันทึกยอดขาย"
        description={`รายการและยอดสรุปของวันที่ ${dateLabel(selectedDate)}`}
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
              onClick={() => exportFinance({ selectedDate, orders: filteredOrders, expenses: filteredExpenses, summary })}
            >
              ↓ Export Excel
            </Button>
          </div>
        }
      />
      <Card className="border-sky-200 bg-sky-50/60 p-4">
        <p className="text-sm font-semibold text-sky-900">
          เพิ่มรายการขายและค่าใช้จ่ายจะบันทึกเป็นวันที่{" "}
          <span className="font-bold">{dateLabel(selectedDate)}</span>
        </p>
        <p className="mt-1 text-xs text-sky-700">
          หากไม่ได้เลือกวันที่ ระบบจะใช้วันปัจจุบันอัตโนมัติ
        </p>
      </Card>
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
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">รายการขาย</h2>
            <span className="text-sm text-slate-500">
              {filteredOrders.length} รายการ
            </span>
          </div>
          <div className="mt-4 space-y-3">
            {filteredOrders.length ? (
              filteredOrders.map((order) => (
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
              <Empty>ยังไม่มีรายการขายในวันนี้ที่เลือก</Empty>
            )}
          </div>
        </Card>
        <Card>
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
              <Empty>ยังไม่มีรายการค่าใช้จ่ายในวันที่เลือก</Empty>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function OperationsZone({
  image,
  eyebrow,
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
      <div className="relative aspect-[4/3] min-h-60 overflow-hidden bg-sky-100">
        <img
          className="h-full w-full object-cover"
          src={image}
          alt={title}
          loading="lazy"
          style={{ objectPosition: imagePosition }}
        />
        <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-sky-950/60 to-transparent" />
        <div className="absolute inset-x-4 bottom-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-100">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>
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

  return (
    <section className="mt-2 overflow-hidden py-3 sm:py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
            Live room · ทดลองการเคลื่อนไหว
          </p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">
            ห้องปฏิบัติการร้าน
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            ชี้ที่วัตถุดิบบนชั้นวางเพื่อดูข้อมูลสต็อกได้โดยตรง
          </p>
        </div>
        <p className="pt-1 text-xs font-bold text-sky-700">● ตัวละครกำลังทำงาน</p>
      </div>

      <div className="operations-room-scene relative mt-5 aspect-video min-h-[220px] overflow-hidden bg-sky-50">
        <OperationsRoom3D
          pendingOrders={pendingOrders}
          lowStockRows={lowStockRows}
          inventoryRows={inventoryRows}
          activeOrders={activeOrders}
          financialSummary={financialSummary}
          isAdmin={isAdmin}
        />
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
        eyebrow="Operations center"
        title="ศูนย์ปฏิบัติการร้าน"
        description={`ภาพรวมการทำงานประจำวันที่ ${dateLabel(today)} จากข้อมูลจริงในระบบ`}
        action={
          <span className="rounded-full bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            ● ข้อมูลเชื่อมต่อแล้ว
          </span>
        }
      />

      <section className="rounded-3xl border border-sky-100 bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-500 p-5 text-white shadow-lg shadow-sky-200 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-100">
              KIN CHA KAN · live workflow
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              หน้าร้าน สต็อก และออฟฟิศ 
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-sky-100">
              เมนูที่เกี่ยวข้องในแถบด้านข้าง
            </p>
          </div>
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

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <OperationsZone
          image={coffeeBarista}
          imagePosition="50% 14%"
          eyebrow="Front counter"
          title="หน้าร้าน"
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
          eyebrow="Stock room"
          title="สต็อกวัตถุดิบ"
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
          eyebrow="Back office"
          title="ออฟฟิศและการเงิน"
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
  activeView,
  setActiveView,
  orders,
  channels,
  products,
  inventoryRows,
  inventoryLots,
  suppliers,
  stockReceipts,
  purchaseOrders,
  metrics,
  expenses,
  expenseRows,
  currentShift,
  notice,
  onAdd,
  onValidateCoupon,
  onOpenCashShift,
  onCloseCashShift,
  onUpdate,
  onRestock,
  onAdjustInventory,
  onCreateSupplier,
  onCreateStockReceipt,
  onCreatePurchaseOrder,
  onUpdatePurchaseOrderStatus,
  onReceivePurchaseOrder,
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
  const alertCount = storeAlertsFor({ products, inventoryRows, inventoryLots }).length;
  const content =
    activeView === "alerts" ? (
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
    ) : activeView === "menu" ? (
      <MenusPage
        products={products}
        ingredients={inventoryRows}
        onCreate={onCreateMenu}
        onUpdate={onUpdateMenu}
        onDelete={onDeleteMenu}
        onSetAvailability={onSetMenuAvailability}
      />
    ) : activeView === "finance" ? (
      <FinancePage
        metrics={metrics}
        expenses={expenses}
        expenseRows={expenseRows}
        orders={orders}
        channels={channels}
        products={products}
        onCreateExpense={onCreateExpense}
        onUpdateExpense={onUpdateExpense}
        onDeleteExpense={onDeleteExpense}
        onCreateSales={onCreateSales}
        onUpdateSales={onUpdateSales}
        onDeleteSales={onDeleteSales}
      />
    ) : activeView === "operations" ? (
      <OperationsPage
        orders={orders}
        inventoryRows={inventoryRows}
        expenseRows={expenseRows}
        isAdmin={user?.role === "admin"}
      />
    ) : activeView === "kitchen" ? (
      <KitchenDisplayPage orders={orders} onUpdate={onUpdate} />
    ) : (
      <div className="space-y-5">
        <OrdersPage orders={orders} onUpdate={onUpdate} />
        <PosPage
          channels={channels}
          products={products}
          currentShift={currentShift}
          onAdd={onAdd}
          onValidateCoupon={onValidateCoupon}
          onOpenCashShift={onOpenCashShift}
          onCloseCashShift={onCloseCashShift}
        />
      </div>
    );
  return (
    <div className="shop-scene text-slate-800">
      <aside className="shop-topbar fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r px-4 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 text-lg font-black text-white">
            S
          </span>
          <div>
            <p className="font-bold tracking-wide text-slate-900">STOCKPOS</p>
            <p className="text-xs text-sky-600">Management</p>
          </div>
        </div>
        <nav className="mt-10 grid gap-2">
          {navigation.map((item) => (
            <button
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${activeView === item.id ? "bg-sky-600 text-white shadow-lg shadow-sky-200" : "text-slate-600 hover:bg-sky-50 hover:text-sky-700"}`}
              key={item.id}
              onClick={() => setActiveView(item.id)}
            >
              <span className="w-5 text-center">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.id === "alerts" && alertCount ? <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">{alertCount}</span> : null}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl border border-sky-100 bg-sky-50/80 p-4 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600">
            ระบบเชื่อมต่อ
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-700">● ออนไลน์</p>
          <p className="mt-1 text-xs text-slate-500">{notice}</p>
        </div>
      </aside>
      <header className="shop-topbar sticky top-0 z-20 border-b px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <span className="shop-orb grid h-9 w-9 place-items-center rounded-xl bg-sky-600 font-black text-white">
            S
          </span>
          <strong className="text-slate-900">STOCKPOS</strong>
        </div>
        <nav className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {navigation.map((item) => (
            <button
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-bold ${activeView === item.id ? "bg-sky-600 text-white" : "bg-sky-50 text-sky-700"}`}
              key={item.id}
              onClick={() => setActiveView(item.id)}
            >
              {item.icon} {item.label}{item.id === "alerts" && alertCount ? ` (${alertCount})` : ""}
            </button>
          ))}
        </nav>
      </header>
      <main className="relative mx-auto w-full max-w-[1600px] p-4 pb-10 sm:p-6 lg:ml-64 lg:w-[calc(100%-16rem)] lg:p-8">
        {content}
      </main>
    </div>
  );
}

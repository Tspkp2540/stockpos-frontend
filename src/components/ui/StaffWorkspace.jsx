import { useMemo, useState } from "react";
import coffeeBarista from "../../assets/coffee-barista-kin-cha-kan-sky.webp";
import MenuModifierPicker from "./MenuModifierPicker";
import CashShiftDialog from "./CashShiftDialog";
import { menuAvailability, menuAvailabilityLabel } from "../../utils/menuAvailability";
import { printReceipt } from "../../utils/printReceipt";
import { loadPosMenuFavorites, loadPosMenuUsage, recordPosMenuUsage, togglePosMenuFavorite } from "../../utils/posMenuUsage";
import { productForChannel } from "../../utils/channelMenu";
import { orderStatusClass, orderStatusLabel } from "../../utils/orderStatus";
import { useActionDialog } from "./ActionDialog";

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
  })}`;
const inputClass =
  "w-full min-w-0 rounded-xl border border-sky-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
const paymentOptions = [
  ["CASH", "เงินสด"],
  ["QR", "QR พร้อมเพย์"],
  ["TRANSFER", "โอนเงิน"],
  ["CARD", "บัตร"],
  ["OTHER", "อื่น ๆ"],
];
const bangkokDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

function MenuThumbnail({ product, className = "h-8 w-8" }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageSource = product?.image_data || product?.image_url;
  if (imageSource && !imageFailed) {
    return <img alt="" className={`${className} shrink-0 rounded-lg border border-sky-100 object-cover`} loading="lazy" src={imageSource} onError={() => setImageFailed(true)} />;
  }
  return <span className={`grid ${className} shrink-0 place-items-center rounded-lg bg-sky-50 text-base`} aria-hidden="true">{product?.icon || "▦"}</span>;
}

function LowStockMenuAlert({ products }) {
  const lowStockMenus = products.filter((product) => menuAvailability(product).isLowStock);
  if (!lowStockMenus.length) return null;
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950 shadow-sm" role="status">
      <p className="font-bold">⚠ เมนูใกล้หมด {lowStockMenus.length} รายการ</p>
      <p className="mt-1 text-sm text-amber-900">
        {lowStockMenus.slice(0, 3).map((product) => `${product.name} (${menuAvailability(product).availableQuantity} แก้ว)`).join(" · ")}
        {lowStockMenus.length > 3 ? ` และอีก ${lowStockMenus.length - 3} รายการ` : ""}
      </p>
    </div>
  );
}

function Button({ children, className = "", variant = "primary", ...props }) {
  const styles =
    variant === "danger"
      ? "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus:ring-rose-100"
      : variant === "secondary"
        ? "border border-sky-200 bg-white text-sky-700 hover:bg-sky-50 focus:ring-sky-100"
        : "bg-sky-600 text-white shadow-sm shadow-sky-200 hover:bg-sky-700 focus:ring-sky-200";
  return (
    <button
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function ItemList({ items }) {
  if (Array.isArray(items))
    return (
      <ul className="space-y-1 text-sm text-slate-600">
        {items.map((item, index) => (
          <li key={`${item.product_id || item.name}-${index}`}>
            {item.name} × {item.quantity || item.qty}
            {(item.modifiers || []).length ? (
              <span className="block text-xs text-violet-700">{item.modifiers.map((modifier) => modifier.name).join(" · ")}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  return <p className="text-sm text-slate-600">{items || "ไม่มีรายการสินค้า"}</p>;
}

function ReturnOrderDialog({ order, onClose, onSubmit }) {
  const [quantities, setQuantities] = useState(() => Object.fromEntries((order?.rawItems || []).map((item) => [String(item.order_item_id), "0"])));
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const lines = (order?.rawItems || []).map((item) => {
    const available = Math.max(0, Number(item.quantity || 0) - Number(item.returned_quantity || 0));
    const selected = Math.min(available, Math.max(0, Number(quantities[String(item.order_item_id)] || 0)));
    return { ...item, available, selected };
  }).filter((item) => item.available > 0);
  const selectedItems = lines.filter((item) => item.selected > 0).map((item) => ({ order_item_id: item.order_item_id, quantity: item.selected }));
  const selectedSubtotal = lines.reduce((sum, item) => sum + item.selected * Number(item.unit_price || 0), 0);
  const estimatedRefund = Number(order?.subtotal_amount || 0) > 0
    ? Math.min(Math.max(0, Number(order.gross_amount || 0) - Number(order.refunded_amount || 0)), selectedSubtotal * Number(order.gross_amount || 0) / Number(order.subtotal_amount))
    : 0;
  const update = (item, value) => setQuantities((current) => ({ ...current, [String(item.order_item_id)]: String(Math.min(item.available, Math.max(0, Number(value || 0)))) }));
  const submit = async (event) => {
    event.preventDefault();
    if (!selectedItems.length || saving) return;
    setSaving(true);
    const saved = await onSubmit(order.id, { items: selectedItems, reason });
    setSaving(false);
    if (saved) onClose();
  };
  return <div className="fixed inset-0 z-[80] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={onClose}><div className="flex min-h-full items-center justify-center"><form className="shop-panel w-full max-w-2xl rounded-3xl border bg-white p-5 shadow-2xl sm:p-6" onMouseDown={(event) => event.stopPropagation()} onSubmit={submit}><div className="pr-9"><p className="text-xs font-bold text-violet-700">คืนสินค้าและคืนเงิน</p><h2 className="mt-1 text-lg font-bold text-slate-900">ออเดอร์ #{order.order_no}</h2><p className="mt-1 text-sm text-slate-500">เลือกจำนวนที่ต้องการคืน ระบบคืนเงินด้วยช่องทางเดิมและคืนสต็อกล็อตเดิม</p></div><div className="mt-5 max-h-64 space-y-2 overflow-y-auto pr-1">{lines.map((item) => <div className="grid grid-cols-[minmax(0,1fr)_104px] items-center gap-3 rounded-xl border border-sky-100 bg-sky-50/45 p-3" key={item.order_item_id}><div><p className="font-semibold text-slate-800">{item.name}</p><p className="mt-0.5 text-xs text-slate-500">คืนได้อีก {item.available} · {money(item.unit_price)} / ชิ้น</p></div><label className="grid gap-1 text-xs font-bold text-slate-600">จำนวนคืน<input className={inputClass} type="number" min="0" max={item.available} step="0.001" value={quantities[String(item.order_item_id)] || "0"} onChange={(event) => update(item, event.target.value)} /></label></div>)}</div><label className="mt-4 grid gap-1.5 text-xs font-semibold text-slate-600">เหตุผลการคืนสินค้า<textarea className={`${inputClass} min-h-20 resize-y`} maxLength="500" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="เช่น สินค้าผิดรายการ" /></label><div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50 p-4"><p className="text-xs font-bold text-violet-700">ยอดคืนโดยประมาณ</p><p className="mt-1 text-2xl font-black text-violet-900">{money(estimatedRefund)}</p></div><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>ยกเลิก</Button><Button type="submit" variant="danger" disabled={saving || !selectedItems.length}>{saving ? "กำลังคืนสินค้า..." : "ยืนยันคืนสินค้า"}</Button></div></form></div></div>;
}

function KitchenQueuePanel({ orders = [], canUpdate = false, onUpdateStation }) {
  const stations = {
    BAR: "บาร์เครื่องดื่ม",
    KITCHEN: "ครัวอาหาร",
    BAKERY: "ครัวขนม",
    OTHER: "จุดผลิตอื่น",
  };
  const queue = useMemo(() => orders
    .filter((order) => order.status === "COOKING")
    .flatMap((order) => Object.keys(stations).map((station) => {
      const items = (order.rawItems || []).filter((item) => String(item.production_station || "BAR").toUpperCase() === station);
      const pendingItems = items.filter((item) => item.production_status !== "READY");
      return { order, station, items, pendingItems };
    }).filter((entry) => entry.items.length)), [orders]);

  return <section className="shop-panel rounded-2xl border p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-slate-900">จอเตรียมสินค้า</h2>
        <p className="mt-1 text-sm text-slate-500">ยืนยันงานแยกตามจุดผลิตก่อนส่งมอบออเดอร์</p>
      </div>
      <span className="rounded-full bg-sky-100 px-3 py-1.5 text-sm font-bold text-sky-700">{queue.filter((entry) => entry.pendingItems.length).length} งานคงค้าง</span>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {queue.length ? queue.map(({ order, station, items, pendingItems }) => {
        const complete = pendingItems.length === 0;
        return <article className={`rounded-2xl border p-4 ${complete ? "border-emerald-200 bg-emerald-50/50" : "border-sky-200 bg-sky-50/50"}`} key={`${order.id}-${station}`}>
          <div className="flex items-start justify-between gap-3">
            <div><p className="font-black text-slate-900">คิว {order.queue_no || "-"} · {stations[station]}</p><p className="mt-1 text-xs text-slate-500">#{order.order_no} · {order.customer_nickname || "ไม่ระบุชื่อลูกค้า"}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${complete ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>{complete ? "จุดนี้เสร็จแล้ว" : `รอทำ ${pendingItems.length} รายการ`}</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-700">
            {items.map((item, index) => <li className="flex items-start justify-between gap-3" key={`${item.order_item_id || item.product_id || item.name}-${index}`}><span><b>{item.name}</b> × {item.quantity || item.qty}{(item.modifiers || []).length ? <small className="ml-1 text-violet-700">· {item.modifiers.map((modifier) => modifier.name).join(" · ")}</small> : null}</span><span className={item.production_status === "READY" ? "text-xs font-bold text-emerald-700" : "text-xs font-bold text-sky-700"}>{item.production_status === "READY" ? "เสร็จ" : "รอทำ"}</span></li>)}
          </ul>
          {canUpdate ? <Button className="mt-4 w-full text-xs" type="button" variant={complete ? "secondary" : "primary"} onClick={() => onUpdateStation?.(order.id, station, complete ? "PENDING" : "READY")}>{complete ? "เปิดงานจุดนี้อีกครั้ง" : `ยืนยัน ${stations[station]} เสร็จแล้ว`}</Button> : null}
        </article>;
      }) : <div className="rounded-2xl border border-dashed border-sky-200 p-5 text-center text-sm text-slate-500 lg:col-span-2">ยังไม่มีงานที่ต้องเตรียม</div>}
    </div>
  </section>;
}

export default function StaffWorkspace({
  user,
  orders,
  channels,
  products,
  diningTables = [],
  currentShift,
  loyaltyRules,
  onAdd,
  onLookupLoyalty,
  onValidateCoupon,
  onQuotePromotion,
  onOpenCashShift,
  onCloseCashShift,
  onUpdate,
  onUpdateKitchenStation,
  onReturnOrder,
  onLogout,
}) {
  const { showMessage } = useActionDialog();
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [tableId, setTableId] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNickname, setCustomerNickname] = useState("");
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [loyaltyError, setLoyaltyError] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1);
  const [cashShiftDialog, setCashShiftDialog] = useState(null);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [editingCartKey, setEditingCartKey] = useState(null);
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [promotionQuote, setPromotionQuote] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [menuSearch, setMenuSearch] = useState("");
  const [menuCategory, setMenuCategory] = useState("ALL");
  const [barcodeInput, setBarcodeInput] = useState("");
  const [menuUsage, setMenuUsage] = useState(loadPosMenuUsage);
  const [favoriteMenuIds, setFavoriteMenuIds] = useState(loadPosMenuFavorites);
  const handlePrint = (order) => {
    if (printReceipt(order)) return;
    showMessage({
      tone: "danger",
      title: "เปิดใบเสร็จไม่ได้",
      message: "กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อพิมพ์ใบเสร็จ",
    });
  };
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [paymentRows, setPaymentRows] = useState([{ payment_method: "CASH", paid_amount: "", amount_received: "" }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [orderChannelFilter, setOrderChannelFilter] = useState("ALL");
  const [orderDateFilter, setOrderDateFilter] = useState("");
  const [returnOrder, setReturnOrder] = useState(null);
  const canView = (menu) => user?.permissions?.[menu]?.view === true;
  const canUsePos = canView("pos");
  const canViewOrders = canView("orders");
  const canViewKitchen = canView("kitchen");
  const canManageCashShift = canView("cash-shifts");
  const canUpdateOrders = user?.permissions?.orders?.update === true;
  const canUpdateKitchen = user?.permissions?.kitchen?.update === true;
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
  const favoriteProducts = useMemo(() => channelProducts.filter((product) => favoriteMenuIds.includes(String(product.id))).slice(0, 8), [channelProducts, favoriteMenuIds]);
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
  const orderChannels = useMemo(
    () => [...new Set(orders.map((order) => order.channel_name).filter(Boolean))],
    [orders],
  );
  const filteredOrders = useMemo(() => {
    const term = orderSearch.trim().toLowerCase();
    return orders.filter((order) => {
      const searchable = [order.order_no, order.queue_no, order.customer_name, order.customer_nickname, order.customer_phone, order.channel_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (!term || searchable.includes(term))
        && (orderStatusFilter === "ALL" || order.status === orderStatusFilter)
        && (orderChannelFilter === "ALL" || order.channel_name === orderChannelFilter)
        && (!orderDateFilter || bangkokDate(order.created_at) === orderDateFilter);
    });
  }, [orderChannelFilter, orderDateFilter, orderSearch, orderStatusFilter, orders]);
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
  const activeLoyaltyRules = loyaltyData?.rules || loyaltyRules || {};
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
  const splitPaidTotal = useMemo(() => paymentRows.reduce((sum, payment) => sum + Math.max(0, Number(payment.paid_amount) || 0), 0), [paymentRows]);
  const splitRemaining = Number((total - splitPaidTotal).toFixed(2));
  const splitCashInvalid = paymentRows.some((payment) => payment.payment_method === "CASH" && Number(payment.paid_amount || 0) > 0 && Number(payment.amount_received || payment.paid_amount || 0) < Number(payment.paid_amount || 0));
  const updatePaymentRow = (index, field, value) => setPaymentRows((current) => current.map((payment, paymentIndex) => paymentIndex === index ? { ...payment, [field]: value } : payment));
  const addPaymentRow = () => setPaymentRows((current) => current.length >= 5 ? current : [...current, { payment_method: "QR", paid_amount: "", amount_received: "" }]);
  const removePaymentRow = (index) => setPaymentRows((current) => current.length <= 1 ? current : current.filter((_, paymentIndex) => paymentIndex !== index));
  const enableSplitPayment = (enabled) => {
    setIsSplitPayment(enabled);
    if (enabled) setPaymentRows([{ payment_method: paymentMethod, paid_amount: total ? total.toFixed(2) : "", amount_received: paymentMethod === "CASH" ? amountReceived : "" }]);
  };
  const cookingOrders = orders.filter((order) => order.status === "COOKING").length;

  const cartKeyFor = (product, modifiers = []) =>
    `${product.id}:${modifiers
      .map((modifier) => modifier.id)
      .sort((a, b) => a - b)
      .join("-") || "base"}`;

  const addConfiguredProduct = (product, modifiers = []) => {
    const modifierAdjustment = modifiers.reduce(
      (sum, modifier) => sum + Number(modifier.price_adjustment || 0),
      0,
    );
    const cartKey = cartKeyFor(product, modifiers);
    setCart((current) => {
      const existing = current.find((item) => item.cart_key === cartKey);
      return existing
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
  const addProduct = (product) => {
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
    addProduct(product);
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
  const replaceConfiguredProduct = (previousCartKey, product, modifiers = []) => {
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
  const updateQuantity = (cartKey, qty) =>
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
    const channel = channels.find(
      (item) => String(item.id) === String(channelId),
    );
    setIsSubmitting(true);
    try {
      const saved = await onAdd({
        channel_id: Number(channelId),
        channel_name: channel?.name,
        customer_phone: customerPhone.trim(),
        customer_nickname: customerNickname.trim(),
        table_id: tableId || undefined,
        manual_discount_amount: Number(manualDiscountAmount.toFixed(2)),
        coupon_code: appliedCoupon?.code || undefined,
        promotion_id: promotionQuote?.promotion?.id || undefined,
        loyalty_points_redeemed: loyaltyPointsRedeemed,
        payment_method: paymentMethod,
        amount_received: paymentMethod === "CASH" ? receivedAmount : undefined,
        payments: isSplitPayment ? paymentRows.map((payment) => ({
          payment_method: payment.payment_method,
          paid_amount: Number(payment.paid_amount) || 0,
          amount_received: payment.payment_method === "CASH" && payment.amount_received !== "" ? Number(payment.amount_received) : undefined,
        })) : undefined,
        items: cart.map(({ product_id, name, qty, price, base_price, modifiers }) => ({
          product_id,
          name,
          qty,
          price: Number(base_price ?? price),
          modifiers: (modifiers || []).map((modifier) => ({ option_id: modifier.id })),
        })),
      });
      if (saved) {
        setCart([]);
        setCustomerPhone("");
        setCustomerNickname("");
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
        setLoyaltyData(null);
        setLoyaltyPoints("");
        setLoyaltyError("");
        setCartOpen(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  const orderCards = (rows, horizontal = false) => rows.map((order) => (
    <article className={`shop-panel rounded-2xl border p-4 ${horizontal ? "w-[86vw] max-w-[360px] shrink-0 snap-start sm:w-[360px]" : ""}`} key={order.id}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">
            คิว {order.queue_no || "-"} · #{order.order_no}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {order.customer_nickname || "ไม่ระบุชื่อเล่น"} · {order.channel_name}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${orderStatusClass(order.status)}`}>
          {orderStatusLabel(order.status)}
        </span>
      </div>
      <div className="mt-3 line-clamp-2"><ItemList items={order.items} /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <strong className="text-lg text-sky-700">{money(order.net_revenue)}</strong>
        {canUpdateOrders && order.status === "COOKING" ? (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl bg-sky-50 px-2.5 py-2 text-xs font-bold text-sky-700">รอครัวยืนยัน</span>
            <Button className="text-xs" variant="danger" onClick={() => onUpdate(order.id, "CANCELLED")}>
              ยกเลิก
            </Button>
            <Button className="text-xs" variant="secondary" onClick={() => handlePrint(order)}>
              ใบเสร็จ
            </Button>
          </div>
        ) : canUpdateOrders && order.status === "READY" ? (
          <div className="flex flex-wrap gap-2">
            <Button className="text-xs" onClick={() => onUpdate(order.id, "COMPLETED")}>
              ส่งมอบแล้ว
            </Button>
            {Number(order.gross_amount || 0) > Number(order.refunded_amount || 0) + 0.005 ? <Button className="text-xs" variant="danger" onClick={() => setReturnOrder(order)}>คืนสินค้า</Button> : null}
            <Button className="text-xs" variant="secondary" onClick={() => handlePrint(order)}>
              ใบเสร็จ
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2"><Button className="text-xs" variant="secondary" onClick={() => handlePrint(order)}>ใบเสร็จ</Button>{canUpdateOrders && order.status === "COMPLETED" && Number(order.gross_amount || 0) > Number(order.refunded_amount || 0) + 0.005 ? <Button className="text-xs" variant="danger" onClick={() => setReturnOrder(order)}>คืนสินค้า</Button> : null}</div>
        )}
      </div>
    </article>
  ));

  if (!user?.permissions) {
    return <main className="app-viewport shop-scene flex min-h-screen items-center justify-center p-6 text-sm font-semibold text-sky-700">กำลังตรวจสอบสิทธิ์การใช้งาน...</main>;
  }

  if (showAllOrders && canViewOrders) {
    return (
      <div className="app-viewport shop-scene min-h-screen text-slate-800">
        <header className="shop-topbar relative z-10 border-b">
            <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">S</span>
              <div><p className="font-bold text-slate-900">STOCKPOS</p></div>
            </div>
            <Button type="button" variant="secondary" onClick={() => setShowAllOrders(false)}>← กลับหน้าขาย</Button>
          </div>
        </header>
        <main className="relative mx-auto w-full max-w-[1440px] p-4 pb-10 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">รายการคำสั่งซื้อทั้งหมด</h1>
              <p className="mt-1 text-sm text-slate-500">ติดตามและเปลี่ยนสถานะคิวจากจุดเดียว</p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700">{filteredOrders.length} / {orders.length} รายการ</span>
          </div>
          <section className="shop-panel mb-5 grid gap-2 rounded-2xl border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_145px_175px_160px_auto]">
            <input aria-label="ค้นหาคำสั่งซื้อ" className={inputClass} value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="ค้นหาเลขที่คำสั่งซื้อ คิว ชื่อลูกค้า หรือหมายเลขโทรศัพท์" />
            <select aria-label="กรองสถานะคำสั่งซื้อ" className={inputClass} value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}><option value="ALL">ทุกสถานะ</option><option value="COOKING">กำลังจัดเตรียม</option><option value="READY">พร้อมรับสินค้า</option><option value="COMPLETED">ดำเนินการเสร็จสิ้น</option><option value="RETURNED">คืนเงินแล้ว</option><option value="CANCELLED">ยกเลิก</option></select>
            <select aria-label="กรองช่องทางขาย" className={inputClass} value={orderChannelFilter} onChange={(event) => setOrderChannelFilter(event.target.value)}><option value="ALL">ทุกช่องทาง</option>{orderChannels.map((channel) => <option value={channel} key={channel}>{channel}</option>)}</select>
            <input aria-label="กรองวันที่ออเดอร์" className={inputClass} type="date" value={orderDateFilter} onChange={(event) => setOrderDateFilter(event.target.value)} />
            <Button type="button" variant="secondary" onClick={() => { setOrderSearch(""); setOrderStatusFilter("ALL"); setOrderChannelFilter("ALL"); setOrderDateFilter(""); }}>ล้างตัวกรอง</Button>
          </section>
          <div className="grid gap-4 xl:grid-cols-2">
            {filteredOrders.length ? orderCards(filteredOrders) : <div className="shop-panel rounded-2xl border border-dashed p-5 text-center text-sm text-slate-500 xl:col-span-2">ไม่พบออเดอร์ที่ตรงกับตัวกรอง</div>}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-viewport shop-scene text-slate-800">
      <header className="shop-topbar relative z-10 border-b">
        <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">
              S
            </span>
            <div>
              <p className="font-bold text-slate-900">STOCKPOS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canUsePos ? <button
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
              <span className="hidden sm:inline">ตะกร้า</span>
              <span className="rounded-lg bg-white/15 px-2 py-1 text-xs font-semibold">{cartItemCount} ชิ้น</span>
              <span className="hidden border-l border-white/25 pl-2 text-xs font-semibold lg:inline">{money(subtotal)}</span>
            </button> : null}
            {canManageCashShift ? <Button className="hidden sm:inline-flex" variant="secondary" onClick={manageCashShift}>
              {currentShift ? "ปิดกะเงินสด" : "เปิดกะเงินสด"}
            </Button> : null}
            <span className="hidden text-sm font-semibold text-slate-600 sm:block">
              {user.name}
            </span>
            <Button variant="secondary" onClick={onLogout}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1440px] space-y-5 p-4 pb-24 sm:p-6 xl:pb-10">
        <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-500 p-5 text-white shadow-xl shadow-sky-200/60 sm:p-7">
          <div className="relative z-10 max-w-2xl sm:max-w-[64%] xl:max-w-2xl">
            <h1 className="text-2xl font-bold sm:text-3xl">การขายและคำสั่งซื้อ</h1>
            <p className="mt-2 text-sm text-sky-100">
              ระบุข้อมูลลูกค้า เลือกเมนู และยืนยันคำสั่งซื้อจากหน้าจอเดียว
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
                {orders.length} คำสั่งซื้อทั้งหมด
              </span>
              <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
                {cookingOrders} คิวกำลังทำ
              </span>
            </div>
          </div>
          <img
            className="pointer-events-none absolute -right-2 -bottom-12 hidden h-[270px] w-[188px] object-cover object-[50%_14%] opacity-95 sm:block md:-bottom-16 md:h-[330px] md:w-[230px]"
            src={coffeeBarista}
            alt=""
            aria-hidden="true"
          />
        </section>

        {canUsePos ? <LowStockMenuAlert products={products} /> : null}

        {canUsePos ? <section className="space-y-5">
          <div className="space-y-5">
            <div className="shop-panel rounded-2xl border p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-100 text-sm font-black text-sky-700">
                  1
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">ข้อมูลคำสั่งซื้อ</h2>
                  <p className="text-xs text-slate-500">ข้อมูลลูกค้าเป็นข้อมูลเสริม</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  เบอร์โทรศัพท์ลูกค้า <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                  <input
                    className={inputClass}
                    inputMode="tel"
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
                <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
                  ชื่อเล่นสำหรับแสดง <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                  <input
                    className={inputClass}
                    value={customerNickname}
                    onChange={(event) => setCustomerNickname(event.target.value)}
                    placeholder="เช่น นัท"
                    maxLength="80"
                  />
                </label>
              </div>
              <label className="mt-4 grid gap-1.5 text-xs font-semibold text-slate-600">
                โต๊ะรับประทานที่ร้าน <span className="font-normal text-slate-400">(ไม่บังคับ)</span>
                <select className={inputClass} value={tableId} disabled={!diningTables.length} onChange={(event) => setTableId(event.target.value)}>
                  <option value="">ซื้อกลับ / ไม่ระบุโต๊ะ</option>
                  {diningTables.filter((table) => table.is_active !== false && table.status !== "DISABLED").map((table) => <option value={table.id} key={table.id}>{table.display_name || table.table_code} · {table.status === "OCCUPIED" ? `มีบิลอยู่ ${table.order_count || 0} รายการ` : `ว่าง ${table.capacity} ที่นั่ง`}</option>)}
                </select>
              </label>
              {!diningTables.length ? <p className="mt-2 text-xs text-amber-700">ยังไม่มีโต๊ะเปิดใช้งาน โปรดให้ผู้ดูแลเพิ่มโต๊ะก่อนเริ่มรับออเดอร์กินที่ร้าน</p> : null}
              <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
                ไม่จำเป็นต้องมีบัญชีผู้ใช้ หากระบุเบอร์โทร ลูกค้าสามารถใช้เบอร์เดิมค้นหาสถานะออเดอร์ได้
              </p>
              {customerPhone ? (
                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-violet-800">คะแนนสะสม</p>
                      <p className="mt-0.5 text-xs text-violet-700">{loyaltyEnabled ? `${loyaltyEarnEnabled ? loyaltyEarnMode === "CUP" ? `ทุก ${loyaltyCupsPerPoint} แก้ว รับ 1 คะแนน` : `ทุก ${money(loyaltySpendPerPoint)} รับ 1 คะแนน` : "ไม่รับคะแนน"} · ${loyaltyRedeemEnabled ? `10 คะแนน ลดได้ ${money(loyaltyBahtPerPoint * 10)}` : "ไม่ใช้คะแนนเป็นส่วนลด"}` : "ระบบคะแนนสะสมปิดใช้งานอยู่"}</p>
                    </div>
                    {loyaltyEnabled ? <Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => lookupLoyalty()}>ตรวจสอบคะแนนสะสม</Button> : null}
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
                    <p className="mt-2 text-xs text-violet-700">เบอร์นี้ยังไม่มีแต้ม เมื่อยืนยันออเดอร์ระบบจะเริ่มสร้างบัญชีสะสมแต้มให้</p>
                  )}
                  {estimatedLoyaltyPoints ? <p className="mt-2 text-xs font-semibold text-emerald-700">ออเดอร์นี้คาดว่าจะได้รับ {estimatedLoyaltyPoints} แต้ม</p> : null}
                </div>
              ) : null}
              <fieldset className="mt-5">
                <legend className="mb-2 text-xs font-bold text-slate-700">
                  ช่องทางการขาย
                </legend>
                <div className="flex flex-wrap gap-2">
                  {channels.map((channel) => {
                    const selected = String(channel.id) === String(channelId);
                    return (
                      <label
                        className={`inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition focus-within:ring-4 ${selected ? "border-sky-500 bg-sky-50 text-sky-800 shadow-sm focus-within:ring-sky-100" : "border-sky-100 bg-white/70 text-slate-700 hover:border-sky-300 focus-within:ring-sky-100"}`}
                        key={channel.id}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="staff-channel"
                          checked={selected}
                          onChange={() => selectChannel(channel.id)}
                        />
                        <span aria-hidden="true" className={`grid h-4 w-4 place-items-center rounded-full border text-[10px] ${selected ? "border-sky-600 bg-sky-600 text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</span>
                        {channel.name}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.42fr)]">
            <div className="shop-panel rounded-2xl border p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">เลือกเมนูขาย</h2>
                </div>
                <span className="text-sm text-slate-500">{visibleProducts.length} / {channelProducts.length} รายการ</span>
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
                        onClick={() => addProduct(product)}
                      >
                        <MenuThumbnail product={product} className="h-7 w-7" />
                        <span className="min-w-0"><span className="block truncate">{product.name}</span><span className="text-sky-700">{money(product.price_retail)}</span></span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {favoriteProducts.length ? <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 p-2.5"><p className="mb-2 text-xs font-bold text-violet-900">เมนูโปรด</p><div className="flex gap-2 overflow-x-auto pb-1">{favoriteProducts.map((product) => <button className="flex min-w-36 shrink-0 items-center gap-2 rounded-lg border border-violet-200 bg-white px-2.5 py-2 text-left text-xs font-bold text-slate-700 transition hover:border-violet-400 hover:bg-violet-50" key={product.id} type="button" onClick={() => addProduct(product)}><MenuThumbnail product={product} className="h-8 w-8" /><span className="min-w-0"><span className="block truncate">{product.name}</span><span className="text-sky-700">{money(product.price_retail)}</span></span></button>)}</div></div> : null}
              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {visibleProducts.map((product) => {
                  const availability = menuAvailability(product);
                  return (
                    <div className="relative" key={product.id}>
                    <button
                      className={`w-full rounded-xl border p-3 text-left transition ${availability.isAvailable ? "border-sky-100 bg-sky-50/60 hover:-translate-y-0.5 hover:border-sky-400 hover:bg-white hover:shadow-md" : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-65"}`}
                      disabled={!availability.isAvailable}
                      onClick={() => addProduct(product)}
                    >
                      <MenuThumbnail product={product} className="h-12 w-12 shadow-sm" />
                      <p className="mt-2 truncate text-sm font-bold text-slate-800">{product.name}</p>
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
              {!visibleProducts.length ? <p className="py-4 text-center text-sm text-slate-500">ไม่พบเมนูที่ตรงกับการค้นหาหรือหมวดหมู่</p> : null}
            </div>
            <aside className="xl:sticky xl:top-24">
              <div className="shop-panel overflow-hidden rounded-2xl border !p-0">
                <div className="flex items-center justify-between border-b border-sky-100 bg-sky-50/70 px-4 py-3">
                  <div><h2 className="font-bold text-slate-900">รายการที่เลือก</h2><p className="text-xs text-slate-500">ตรวจสอบก่อนชำระเงิน</p></div>
                  <span className="rounded-full bg-sky-600 px-2.5 py-1 text-xs font-bold text-white">{cartItemCount} ชิ้น</span>
                </div>
                <div className="max-h-[42vh] space-y-2 overflow-y-auto p-3">
                  {cart.length ? cart.map((item) => (
                    <article className="rounded-xl border border-sky-100 bg-white p-2.5" key={item.cart_key}>
                      <div className="flex items-start gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{item.name}</p>{item.modifiers?.length ? <p className="mt-0.5 truncate text-xs text-violet-700">{item.modifiers.map((modifier) => modifier.name).join(" · ")}</p> : null}</div><strong className="shrink-0 text-sm text-sky-700">{money(Number(item.price) * Number(item.qty))}</strong></div>
                      <div className="mt-2 flex items-center justify-between gap-2"><div className="inline-flex items-center rounded-lg border border-sky-100 bg-sky-50"><button aria-label={`ลดจำนวน ${item.name}`} className="h-7 w-7 text-sm font-bold text-sky-700 hover:bg-sky-100" type="button" onClick={() => item.qty <= 1 ? setCart((current) => current.filter((row) => row.cart_key !== item.cart_key)) : updateQuantity(item.cart_key, item.qty - 1)}>−</button><span className="min-w-7 text-center text-xs font-bold text-slate-700">{item.qty}</span><button aria-label={`เพิ่มจำนวน ${item.name}`} className="h-7 w-7 text-sm font-bold text-sky-700 hover:bg-sky-100" type="button" onClick={() => updateQuantity(item.cart_key, Number(item.qty) + 1)}>+</button></div><button className="text-xs font-bold text-rose-600 hover:text-rose-800" type="button" onClick={() => setCart((current) => current.filter((row) => row.cart_key !== item.cart_key))}>ลบ</button></div>
                    </article>
                  )) : <p className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-5 text-center text-sm text-slate-500">เลือกเมนูเพื่อเริ่มรายการขาย</p>}
                </div>
                <div className="border-t border-sky-100 bg-white p-3"><div className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-500">ยอดสินค้า</span><strong className="text-lg text-sky-700">{money(subtotal)}</strong></div><Button className="mt-3 w-full" disabled={!cart.length} type="button" onClick={openCart}>ตรวจสอบและชำระเงิน</Button></div>
              </div>
            </aside>
            </div>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sky-100 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur xl:hidden">
            <Button className="w-full !py-3" disabled={!cart.length} type="button" onClick={openCart}>
              <span className="flex items-center justify-between gap-3"><span>🛒 ตะกร้า {cartItemCount} ชิ้น</span><strong>{money(subtotal)} · ตรวจสอบ</strong></span>
            </Button>
          </div>

          {cartOpen ? (
            <div className="fixed inset-0 z-[70] overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={() => setCartOpen(false)}>
              <div className="flex min-h-full items-center justify-center">
                <section aria-label="ตะกร้าสินค้าและยืนยันออเดอร์" aria-modal="true" className="relative w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-3xl shadow-2xl shadow-slate-900/30" onMouseDown={(event) => event.stopPropagation()} role="dialog">
                  <button aria-label="ปิดหน้าต่าง" className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl border border-sky-200 bg-white text-lg font-bold text-sky-700 hover:bg-sky-50" type="button" onClick={() => setCartOpen(false)}>×</button>
                  <div className="shop-panel rounded-3xl border bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">ตะกร้าสินค้า</h2>
                </div>
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
                    <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-2.5" key={item.cart_key}>
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate font-semibold text-slate-800">{item.name}</p>
                        <div className="inline-flex shrink-0 items-center rounded-lg border border-sky-100 bg-white"><button aria-label={`ลดจำนวน ${item.name}`} className="h-7 w-7 font-bold text-sky-700 hover:bg-sky-50" type="button" onClick={() => item.qty <= 1 ? setCart((current) => current.filter((row) => row.cart_key !== item.cart_key)) : updateQuantity(item.cart_key, item.qty - 1)}>−</button><span className="min-w-6 text-center text-xs font-bold text-slate-700">{item.qty}</span><button aria-label={`เพิ่มจำนวน ${item.name}`} className="h-7 w-7 font-bold text-sky-700 hover:bg-sky-50" type="button" onClick={() => updateQuantity(item.cart_key, Number(item.qty) + 1)}>+</button></div>
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
                  <p className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-5 text-center text-sm text-slate-500">
                    เลือกเมนูเพื่อเริ่มรายการขาย
                  </p>
                )}
              <div className="flex justify-end border-t border-sky-100 pt-3"><Button type="button" disabled={!cart.length} onClick={() => setCheckoutStep(2)}>ถัดไป: ส่วนลดและลูกค้า →</Button></div>
              </div> : null}
              {checkoutStep === 2 ? <div className="border-t border-sky-100 pt-4">
                <div className="mb-4 rounded-xl bg-sky-50/70 p-3">
                  <p className="text-xs font-bold text-slate-700">ส่วนลดทั้งตะกร้า</p>
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
                <div className="mb-4 rounded-xl border border-sky-100 bg-white/75 p-3">
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
              {checkoutStep === 3 ? <div className="border-t border-sky-100 pt-4">
                <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700">การชำระเงิน</p>
                    {canManageCashShift ? <button className="text-xs font-semibold text-sky-700 sm:hidden" onClick={manageCashShift}>
                      {currentShift ? "ปิดกะ" : "เปิดกะ"}
                    </button> : null}
                  </div>
                  <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><input className="accent-sky-600" type="checkbox" checked={isSplitPayment} onChange={(event) => enableSplitPayment(event.target.checked)} />แยกชำระหลายช่องทาง / หลายคน</label>
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
                          name="staff-payment"
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
                      return <div className="rounded-xl border border-amber-100 bg-white/80 p-2.5" key={index}><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_110px_110px_30px]"><select aria-label={`ช่องทางชำระรายการ ${index + 1}`} className={inputClass} value={payment.payment_method} onChange={(event) => updatePaymentRow(index, "payment_method", event.target.value)}>{paymentOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><input aria-label={`ยอดชำระรายการ ${index + 1}`} className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" placeholder="ยอดชำระ" value={payment.paid_amount} onChange={(event) => updatePaymentRow(index, "paid_amount", event.target.value)} />{payment.payment_method === "CASH" ? <input aria-label={`รับเงินสดรายการ ${index + 1}`} className={inputClass} type="number" min={paid} step="0.01" inputMode="decimal" placeholder="รับเงินสด" value={payment.amount_received} onChange={(event) => updatePaymentRow(index, "amount_received", event.target.value)} /> : <span className="flex items-center justify-center rounded-xl bg-slate-50 px-2 text-xs text-slate-500">ชำระแล้ว</span>}<button aria-label={`ลบช่องทางชำระ ${index + 1}`} className="text-lg font-bold text-rose-600 disabled:text-slate-300" type="button" disabled={paymentRows.length === 1} onClick={() => removePaymentRow(index)}>×</button></div>{payment.payment_method === "CASH" && paid > 0 ? <p className={`mt-1 text-[11px] font-semibold ${received < paid ? "text-rose-600" : "text-emerald-700"}`}>{received < paid ? "รับเงินสดไม่ครบ" : `เงินทอน ${money(rowChange)}`}</p> : null}</div>;
                    })}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" disabled={paymentRows.length >= 5} onClick={addPaymentRow}>+ เพิ่มช่องทาง</Button><strong className={Math.abs(splitRemaining) <= 0.005 ? "text-emerald-700" : "text-amber-700"}>{Math.abs(splitRemaining) <= 0.005 ? "ยอดชำระครบแล้ว" : `${splitRemaining > 0 ? "เหลือ" : "เกิน"} ${money(Math.abs(splitRemaining))}`}</strong></div>
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
                <div className="my-4 flex items-center justify-between">
                  <span className="font-semibold text-slate-600">ยอดสุทธิ</span>
                  <strong className="text-2xl text-sky-700">{money(total)}</strong>
                </div>
                {!isSplitPayment && paymentMethod === "CASH" && total > 0 && receivedAmount < total ? <p className="mb-2 text-xs font-semibold text-amber-700">กรอกยอดเงินสดที่รับอย่างน้อย {money(total)} ก่อนยืนยัน</p> : null}
                {isSplitPayment && Math.abs(splitRemaining) > 0.005 ? <p className="mb-2 text-xs font-semibold text-amber-700">ระบุยอดชำระรวมให้ครบ {money(total)}</p> : null}
                <div className="sticky bottom-0 z-10 -mx-4 flex gap-2 border-t border-sky-100 bg-white/95 px-4 pb-1 pt-3 backdrop-blur sm:-mx-5 sm:px-5"><Button className="shrink-0" type="button" variant="secondary" disabled={isSubmitting} onClick={() => setCheckoutStep(2)}>← ย้อนกลับ</Button><Button className="flex-1" disabled={!cart.length || isSubmitting} onClick={submit}>{isSubmitting ? "กำลังบันทึกออเดอร์..." : "ยืนยันคำสั่งซื้อ"}</Button></div>
              </div> : null}
                  </div>
                </section>
              </div>
            </div>
          ) : null}
        </section> : null}

        {canViewKitchen ? <KitchenQueuePanel orders={orders} canUpdate={canUpdateKitchen} onUpdateStation={onUpdateKitchenStation} /> : null}

        {canViewOrders ? <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">คำสั่งซื้อล่าสุด</h2>
              <p className="mt-1 text-sm text-slate-500">แสดง 5 รายการล่าสุดจากทั้งหมด {orders.length} รายการ</p>
              {orders.length > 1 ? <p className="mt-1 text-xs font-semibold text-sky-700">← เลื่อนซ้าย–ขวาเพื่อดูคิวล่าสุด →</p> : null}
            </div>
            {orders.length > 5 ? <Button type="button" variant="secondary" className="text-xs" onClick={() => setShowAllOrders(true)}>ดูทั้งหมด →</Button> : <span className="text-sm text-slate-500">{orders.length} รายการ</span>}
          </div>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pr-1">
            {orders.length ? orderCards(orders.slice(0, 5), true) : <div className="shop-panel w-full rounded-2xl border border-dashed p-5 text-center text-sm text-slate-500">ยังไม่มีคำสั่งซื้อ</div>}
          </div>
          {orders.length > 5 ? <div className="mt-4 flex justify-center"><Button type="button" variant="secondary" onClick={() => setShowAllOrders(true)}>ดูรายการคำสั่งซื้อทั้งหมด ({orders.length}) →</Button></div> : null}
        </section> : null}
      </main>
      {returnOrder ? <ReturnOrderDialog order={returnOrder} onClose={() => setReturnOrder(null)} onSubmit={onReturnOrder} /> : null}
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
            if (editingCartKey) replaceConfiguredProduct(editingCartKey, product, modifiers);
            else addConfiguredProduct(product, modifiers);
            setPendingProduct(null);
            setEditingCartKey(null);
          }}
        />
      ) : null}
      {cashShiftDialog ? <CashShiftDialog mode={cashShiftDialog.mode} shift={cashShiftDialog.shift} onClose={() => setCashShiftDialog(null)} onSubmit={saveCashShift} /> : null}
    </div>
  );
}

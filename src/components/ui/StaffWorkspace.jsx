import { useMemo, useState } from "react";
import coffeeBarista from "../../assets/coffee-barista-kin-cha-kan-sky.png";
import MenuModifierPicker from "./MenuModifierPicker";
import { menuAvailability, menuAvailabilityLabel } from "../../utils/menuAvailability";
import { printReceipt } from "../../utils/printReceipt";

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
const statusClass = (status) =>
  status === "COMPLETED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "CANCELLED"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
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

export default function StaffWorkspace({
  user,
  orders,
  channels,
  products,
  currentShift,
  onAdd,
  onLookupLoyalty,
  onValidateCoupon,
  onOpenCashShift,
  onCloseCashShift,
  onUpdate,
  onLogout,
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNickname, setCustomerNickname] = useState("");
  const [loyaltyData, setLoyaltyData] = useState(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState("");
  const [loyaltyError, setLoyaltyError] = useState("");
  const [cart, setCart] = useState([]);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [editingCartKey, setEditingCartKey] = useState(null);
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [amountReceived, setAmountReceived] = useState("");
  const [showAllOrders, setShowAllOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("ALL");
  const [orderChannelFilter, setOrderChannelFilter] = useState("ALL");
  const [orderDateFilter, setOrderDateFilter] = useState("");
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
  const loyaltyBaseAmount = Math.max(0, subtotal - manualDiscountAmount - couponDiscountAmount);
  const loyaltyBalance = Math.max(0, Number(loyaltyData?.account?.points_balance || 0));
  const loyaltyMaxPoints = Math.min(loyaltyBalance, Math.floor((loyaltyBaseAmount * 0.5) / 0.1));
  const loyaltyPointsRedeemed = Math.min(loyaltyMaxPoints, Math.max(0, Math.floor(Number(loyaltyPoints) || 0)));
  const loyaltyDiscountAmount = Number((loyaltyPointsRedeemed * 0.1).toFixed(2));
  const total = Math.max(0, loyaltyBaseAmount - loyaltyDiscountAmount);
  const estimatedLoyaltyPoints = customerPhone.replace(/\D/g, '').length >= 9 ? Math.floor(total / 25) : 0;
  const receivedAmount = Number(amountReceived || 0);
  const changeAmount = paymentMethod === "CASH" && receivedAmount >= total
    ? receivedAmount - total
    : 0;
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
              price: Number(product.price_retail || 0) + modifierAdjustment,
              modifiers,
              modifier_groups: product.modifier_groups || [],
              qty: 1,
            },
        ];
    });
  };
  const addProduct = (product) => {
    if (!menuAvailability(product).isAvailable) return;
    if ((product.modifier_groups || []).length) {
      setEditingCartKey(null);
      setPendingProduct(product);
      return;
    }
    addConfiguredProduct(product);
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
  const manageCashShift = async () => {
    if (currentShift) {
      const closingCash = window.prompt(
        `ยอดเงินสดที่ควรมี ${money(Number(currentShift.opening_cash || 0) + Number(currentShift.cash_sales || 0))}\nกรอกยอดที่นับได้เพื่อปิดกะ`,
      );
      if (closingCash === null) return;
      const closed = await onCloseCashShift?.(currentShift.id, closingCash);
      if (closed) {
        window.alert(`ปิดกะแล้ว\nยอดคาดการณ์: ${money(closed.expected_cash)}\nยอดต่าง: ${money(closed.difference_amount)}`);
      }
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
      customer_phone: customerPhone.trim(),
      customer_nickname: customerNickname.trim(),
      manual_discount_amount: Number(manualDiscountAmount.toFixed(2)),
      coupon_code: appliedCoupon?.code || undefined,
      loyalty_points_redeemed: loyaltyPointsRedeemed,
      payment_method: paymentMethod,
      amount_received: paymentMethod === "CASH" ? receivedAmount : undefined,
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
      setCouponError("");
      setPaymentMethod("CASH");
      setAmountReceived("");
      setLoyaltyData(null);
      setLoyaltyPoints("");
      setLoyaltyError("");
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
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(order.status)}`}>
          {order.status}
        </span>
      </div>
      <div className="mt-3 line-clamp-2"><ItemList items={order.items} /></div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <strong className="text-lg text-sky-700">{money(order.net_revenue)}</strong>
        {order.status === "COOKING" ? (
          <div className="flex gap-2">
            <Button className="text-xs" onClick={() => onUpdate(order.id, "READY")}>
              พร้อมรับ
            </Button>
            <Button className="text-xs" variant="danger" onClick={() => onUpdate(order.id, "CANCELLED")}>
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
  ));

  if (showAllOrders) {
    return (
      <div className="shop-scene min-h-screen text-slate-800">
        <header className="shop-topbar relative z-10 border-b">
          <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">S</span>
              <div><p className="font-bold text-slate-900">STOCKPOS</p><p className="text-xs text-sky-600">Front counter workspace</p></div>
            </div>
            <Button type="button" variant="secondary" onClick={() => setShowAllOrders(false)}>← กลับหน้าขาย</Button>
          </div>
        </header>
        <main className="relative mx-auto w-full max-w-[1500px] p-4 pb-10 sm:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Order management</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">รายการออเดอร์ทั้งหมด</h1>
              <p className="mt-1 text-sm text-slate-500">ติดตามและเปลี่ยนสถานะคิวจากจุดเดียว</p>
            </div>
            <span className="rounded-full bg-sky-50 px-3 py-1.5 text-sm font-bold text-sky-700">{filteredOrders.length} / {orders.length} รายการ</span>
          </div>
          <section className="shop-panel mb-5 grid gap-2 rounded-2xl border p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_145px_175px_160px_auto]">
            <input aria-label="ค้นหาออเดอร์" className={inputClass} value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder="ค้นหาเลขออเดอร์ คิว ชื่อลูกค้า หรือเบอร์โทร" />
            <select aria-label="กรองสถานะออเดอร์" className={inputClass} value={orderStatusFilter} onChange={(event) => setOrderStatusFilter(event.target.value)}><option value="ALL">ทุกสถานะ</option><option value="COOKING">กำลังทำ</option><option value="READY">พร้อมรับ</option><option value="COMPLETED">สำเร็จ</option><option value="CANCELLED">ยกเลิก</option></select>
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
    <div className="shop-scene text-slate-800">
      <header className="shop-topbar relative z-10 border-b">
        <div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">
              S
            </span>
            <div>
              <p className="font-bold text-slate-900">STOCKPOS</p>
              <p className="text-xs text-sky-600">Front counter workspace</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button className="hidden sm:inline-flex" variant="secondary" onClick={manageCashShift}>
              {currentShift ? "ปิดกะเงินสด" : "เปิดกะเงินสด"}
            </Button>
            <span className="hidden text-sm font-semibold text-slate-600 sm:block">
              {user.name}
            </span>
            <Button variant="secondary" onClick={onLogout}>
              ออกจากระบบ
            </Button>
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-[1500px] space-y-6 p-4 pb-10 sm:p-6">
        <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-r from-sky-700 via-sky-600 to-cyan-500 p-5 text-white shadow-xl shadow-sky-200/60 sm:p-7">
          <div className="relative z-10 max-w-2xl sm:max-w-[64%] xl:max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-100">
              Front counter · live order flow
            </p>
            <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
              รับออเดอร์ให้ลื่นไหล ดูคิวให้ทันทุกแก้ว
            </h1>
            <p className="mt-2 text-sm text-sky-100">
              กรอกข้อมูลลูกค้า เลือกเมนู และยืนยันออเดอร์จากจุดเดียว
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-sm">
                {orders.length} ออเดอร์ทั้งหมด
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

        <LowStockMenuAlert products={products} />

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-5">
            <div className="shop-panel rounded-2xl border p-4 sm:p-5">
              <div className="mb-4 flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-100 text-sm font-black text-sky-700">
                  1
                </span>
                <div>
                  <h2 className="font-bold text-slate-900">ระบุข้อมูลออเดอร์</h2>
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
              <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">
                ไม่จำเป็นต้องมีบัญชีผู้ใช้ หากระบุเบอร์โทร ลูกค้าสามารถใช้เบอร์เดิมค้นหาสถานะออเดอร์ได้
              </p>
              {customerPhone ? (
                <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50/70 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-violet-800">แต้มสมาชิก</p>
                      <p className="mt-0.5 text-xs text-violet-700">ทุก 25 บาท รับ 1 แต้ม · 10 แต้ม ลดได้ 1 บาท</p>
                    </div>
                    <Button className="px-2.5 py-1.5 text-xs" type="button" variant="secondary" onClick={() => lookupLoyalty()}>ตรวจคะแนน</Button>
                  </div>
                  {loyaltyData?.account ? (
                    <div className="mt-3">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-700">คะแนนคงเหลือ <strong className="text-lg text-violet-700">{loyaltyBalance.toLocaleString()} แต้ม</strong></p>
                        <button className="text-xs font-bold text-violet-700 hover:text-violet-900 disabled:opacity-50" type="button" disabled={!loyaltyMaxPoints} onClick={() => setLoyaltyPoints(String(loyaltyMaxPoints))}>ใช้ได้สูงสุด {loyaltyMaxPoints.toLocaleString()} แต้ม</button>
                      </div>
                      <label className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
                        ใช้แต้มเป็นส่วนลด
                        <input
                          className={inputClass}
                          type="number"
                          min="0"
                          max={loyaltyMaxPoints}
                          step="1"
                          inputMode="numeric"
                          value={loyaltyPoints}
                          onChange={(event) => setLoyaltyPoints(String(Math.min(loyaltyMaxPoints, Math.max(0, Math.floor(Number(event.target.value) || 0)))))}
                          placeholder={`ใช้ได้สูงสุด ${loyaltyMaxPoints.toLocaleString()} แต้ม`}
                        />
                      </label>
                      {loyaltyPointsRedeemed ? <p className="mt-2 text-xs font-semibold text-violet-700">ใช้ {loyaltyPointsRedeemed.toLocaleString()} แต้ม ลด {money(loyaltyDiscountAmount)}</p> : null}
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
                <legend className="mb-3 text-sm font-bold text-slate-800">
                  ช่องทางการขาย
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {channels.map((channel) => (
                    <label
                      className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 transition ${String(channel.id) === String(channelId) ? "border-sky-500 bg-sky-50 shadow-sm" : "border-sky-100 bg-white/70 hover:border-sky-300"}`}
                      key={channel.id}
                    >
                      <span className="text-sm font-semibold text-slate-700">
                        {channel.name}
                      </span>
                      <input
                        className="h-4 w-4 accent-sky-600"
                        type="radio"
                        checked={String(channel.id) === String(channelId)}
                        onChange={() => setChannelId(channel.id)}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="shop-panel rounded-2xl border p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Step 2</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">เลือกเมนูขาย</h2>
                </div>
                <span className="text-sm text-slate-500">{products.length} รายการ</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {products.map((product) => {
                  const availability = menuAvailability(product);
                  return (
                    <button
                      className={`rounded-2xl border p-4 text-left transition ${availability.isAvailable ? "border-sky-100 bg-sky-50/60 hover:-translate-y-0.5 hover:border-sky-400 hover:bg-white hover:shadow-md" : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-65"}`}
                      disabled={!availability.isAvailable}
                      key={product.id}
                      onClick={() => addProduct(product)}
                    >
                      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg shadow-sm">
                        {product.icon || "▦"}
                      </span>
                      <p className="mt-3 truncate font-bold text-slate-800">{product.name}</p>
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
            </div>
          </div>

          <aside className="xl:sticky xl:top-5 xl:self-start">
            <div className="shop-panel rounded-2xl border p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Step 3</p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">ตะกร้าสินค้า</h2>
                </div>
                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">
                  {cart.length} รายการ
                </span>
              </div>
              <div className="my-4 space-y-3">
                {cart.length ? (
                  cart.map((item) => (
                    <div className="rounded-xl border border-sky-100 bg-white/75 p-3" key={item.cart_key}>
                      <div className="flex gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-800">{item.name}</p>
                          <p className="text-sm text-sky-700">{money(item.price)}</p>
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
                              current.filter((row) => row.cart_key !== item.cart_key),
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
                          onChange={(event) => updateQuantity(item.cart_key, event.target.value)}
                        />
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-5 text-center text-sm text-slate-500">
                    เลือกเมนูเพื่อเริ่มรายการขาย
                  </p>
                )}
              </div>
              <div className="border-t border-sky-100 pt-4">
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
                <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-700">การชำระเงิน</p>
                    <button className="text-xs font-semibold text-sky-700 sm:hidden" onClick={manageCashShift}>
                      {currentShift ? "ปิดกะ" : "เปิดกะ"}
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
                  {loyaltyPointsRedeemed ? (
                    <div className="flex items-center justify-between text-violet-700">
                      <span>ใช้แต้มสมาชิก {loyaltyPointsRedeemed.toLocaleString()} แต้ม</span>
                      <span>-{money(loyaltyDiscountAmount)}</span>
                    </div>
                  ) : null}
                </div>
                <div className="my-4 flex items-center justify-between">
                  <span className="font-semibold text-slate-600">ยอดสุทธิ</span>
                  <strong className="text-2xl text-sky-700">{money(total)}</strong>
                </div>
                <Button className="w-full" disabled={!cart.length} onClick={submit}>
                  ยืนยันออเดอร์
                </Button>
              </div>
            </div>
          </aside>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Order management</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">ออเดอร์ล่าสุด</h2>
              <p className="mt-1 text-sm text-slate-500">แสดง 5 รายการล่าสุดจากทั้งหมด {orders.length} รายการ</p>
              {orders.length > 1 ? <p className="mt-1 text-xs font-semibold text-sky-700">← เลื่อนซ้าย–ขวาเพื่อดูคิวล่าสุด →</p> : null}
            </div>
            {orders.length > 5 ? <Button type="button" variant="secondary" className="text-xs" onClick={() => setShowAllOrders(true)}>ดูทั้งหมด →</Button> : <span className="text-sm text-slate-500">{orders.length} รายการ</span>}
          </div>
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 pr-1">
            {orders.length ? orderCards(orders.slice(0, 5), true) : <div className="shop-panel w-full rounded-2xl border border-dashed p-5 text-center text-sm text-slate-500">ยังไม่มีออเดอร์</div>}
          </div>
          {orders.length > 5 ? <div className="mt-4 flex justify-center"><Button type="button" variant="secondary" onClick={() => setShowAllOrders(true)}>ดูรายการออเดอร์ทั้งหมด ({orders.length}) →</Button></div> : null}
        </section>
      </main>
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
    </div>
  );
}

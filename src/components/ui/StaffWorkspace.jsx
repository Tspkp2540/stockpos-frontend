import { useMemo, useState } from "react";
import coffeeBarista from "../../assets/coffee-barista-kin-cha-kan-sky.png";
import MenuModifierPicker from "./MenuModifierPicker";

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
  })}`;
const inputClass =
  "w-full min-w-0 rounded-xl border border-sky-200 bg-white/90 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
const statusClass = (status) =>
  status === "COMPLETED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "CANCELLED"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";

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
  onAdd,
  onValidateCoupon,
  onUpdate,
  onLogout,
}) {
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNickname, setCustomerNickname] = useState("");
  const [cart, setCart] = useState([]);
  const [pendingProduct, setPendingProduct] = useState(null);
  const [discountType, setDiscountType] = useState("amount");
  const [discountValue, setDiscountValue] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState("");
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
  const cookingOrders = orders.filter((order) => order.status === "COOKING").length;

  const addConfiguredProduct = (product, modifiers = []) => {
    const modifierAdjustment = modifiers.reduce(
      (sum, modifier) => sum + Number(modifier.price_adjustment || 0),
      0,
    );
    const cartKey = `${product.id}:${modifiers.map((modifier) => modifier.id).sort((a, b) => a - b).join("-") || "base"}`;
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
              qty: 1,
            },
        ];
    });
  };
  const addProduct = (product) => {
    if ((product.modifier_groups || []).length) {
      setPendingProduct(product);
      return;
    }
    addConfiguredProduct(product);
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
  const submit = async () => {
    if (!cart.length) return;
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
    }
  };

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
                    onChange={(event) => setCustomerPhone(event.target.value)}
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
                {products.map((product) => (
                  <button
                    className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-left transition hover:-translate-y-0.5 hover:border-sky-400 hover:bg-white hover:shadow-md"
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
                  </button>
                ))}
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
            </div>
            <span className="text-sm text-slate-500">{orders.length} รายการ</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {orders.length ? (
              orders.map((order) => (
                <article className="shop-panel rounded-2xl border p-4" key={order.id}>
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
                        <Button className="text-xs" onClick={() => onUpdate(order.id, "COMPLETED")}>
                          เสร็จสิ้น
                        </Button>
                        <Button className="text-xs" variant="danger" onClick={() => onUpdate(order.id, "CANCELLED")}>
                          ยกเลิก
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">ไม่มีการดำเนินการ</span>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <div className="shop-panel rounded-2xl border border-dashed p-5 text-center text-sm text-slate-500 xl:col-span-2">
                ยังไม่มีออเดอร์
              </div>
            )}
          </div>
        </section>
      </main>
      {pendingProduct ? (
        <MenuModifierPicker
          key={pendingProduct.id}
          product={pendingProduct}
          onClose={() => setPendingProduct(null)}
          onConfirm={(product, modifiers) => {
            addConfiguredProduct(product, modifiers);
            setPendingProduct(null);
          }}
        />
      ) : null}
    </div>
  );
}

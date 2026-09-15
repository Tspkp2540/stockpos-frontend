import { useMemo, useState } from "react";
import customerOrderHistory from "../../assets/customer-order-history.webp";
import { maskPhone } from "../../utils/phone";
import { orderStatusClass, orderStatusLabel } from "../../utils/orderStatus";

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const dateLabel = (value) =>
  value
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "ไม่ระบุวันเวลา";

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
  return (
    <p className="text-sm text-slate-600">{items || "ไม่มีรายการสินค้า"}</p>
  );
}

export default function UserOrderStatus({ user, orders, loyalty, onRefreshLoyalty, onLogout }) {
  const [query, setQuery] = useState("");
  const account = loyalty?.account;
  const rules = loyalty?.rules || { is_enabled: true, spend_per_point: 25, baht_per_point: 0.1 };
  const earnsByCup = String(rules.earn_mode || "SPEND").toUpperCase() === "CUP";
  const visibleOrders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return normalized
      ? orders.filter((order) =>
          `${order.order_no || ""} ${order.queue_no || ""} ${order.customer_nickname || ""}`
            .toLowerCase()
            .includes(normalized),
        )
      : orders;
  }, [orders, query]);
  if (!user?.permissions) {
    return <main className="app-viewport shop-scene flex min-h-screen items-center justify-center p-6 text-sm font-semibold text-sky-700">กำลังตรวจสอบสิทธิ์การใช้งาน...</main>;
  }
  if (user.permissions?.orders?.view !== true) {
    return (
      <main className="app-viewport shop-scene flex min-h-screen items-center justify-center p-6 text-center text-slate-700">
        <section className="shop-panel max-w-md rounded-3xl border p-7">
          <h1 className="text-xl font-bold text-slate-900">ไม่มีเมนูที่ได้รับสิทธิ์</h1>
          <p className="mt-2 text-sm text-slate-500">โปรดติดต่อผู้ดูแลระบบหากต้องการเข้าดูคำสั่งซื้อ</p>
          <button className="mt-5 rounded-xl border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50" onClick={onLogout}>ออกจากระบบ</button>
        </section>
      </main>
    );
  }
  return (
    <div className="app-viewport shop-scene text-slate-800">
      <header className="shop-topbar relative z-10 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">
              S
            </span>
            <div>
              <p className="font-bold text-slate-900">STOCKPOS</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm font-semibold text-slate-600 sm:block">
              {user.name}
            </span>
            <button
              className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
              onClick={onLogout}
            >
              ออกจากระบบ
            </button>
          </div>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-5xl p-4 pb-10 sm:p-6">
        <div className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-700 via-sky-600 to-cyan-500 p-6 text-white shadow-xl shadow-sky-200/60 sm:p-8">
          <div className="relative z-10 max-w-2xl md:max-w-[62%]">
          <h1 className="text-2xl font-bold sm:text-3xl">
            ประวัติการสั่งซื้อทั้งหมด
          </h1>
          <p className="mt-2 text-sm text-sky-50">
            แสดงคำสั่งซื้อทั้งหมดที่ระบุหมายเลขโทรศัพท์ {maskPhone(user.phone) || "ของบัญชีคุณ"}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <div>
              <p className="text-xs font-semibold text-sky-100">คะแนนสะสมคงเหลือ</p>
              <strong className="mt-0.5 block text-2xl text-white">{Number(account?.points_balance || 0).toLocaleString()} คะแนน</strong>
            </div>
            <p className="text-xs leading-5 text-sky-50">{rules.is_enabled === false ? "ระบบคะแนนสะสมปิดใช้งานอยู่" : <>{earnsByCup ? `ทุก ${Number(rules.cups_per_point || 1).toLocaleString()} แก้ว รับ 1 คะแนน` : `ทุก ${Number(rules.spend_per_point || 25).toLocaleString()} บาท รับ 1 คะแนน`}<br />{Math.round(1 / Number(rules.baht_per_point || 0.1))} คะแนน ใช้ลดได้ 1 บาท</>}</p>
            <button className="ml-auto rounded-lg border border-white/30 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-white/10" type="button" onClick={onRefreshLoyalty}>รีเฟรช</button>
          </div>
          <label className="mt-5 block max-w-xl">
            <span className="sr-only">ค้นหาประวัติคำสั่งซื้อ</span>
            <input
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-4 ring-white/15 placeholder:text-slate-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาด้วยเลขคิว ชื่อเล่น หรือเลขที่คำสั่งซื้อ"
            />
          </label>
          </div>
          <img
            className="pointer-events-none absolute -right-3 -bottom-14 hidden h-[310px] w-[215px] object-cover object-[50%_12%] opacity-95 md:block lg:h-[360px] lg:w-[245px]"
            src={customerOrderHistory}
            alt=""
            aria-hidden="true"
          />
        </div>
        <section className="mt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">รายการทั้งหมด</h2>
            <span className="text-sm text-slate-500">
              {visibleOrders.length} รายการ
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {visibleOrders.length ? (
              visibleOrders.map((order) => (
                <article
                  className="shop-panel rounded-2xl border p-5"
                  key={order.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-sky-600">
                        คิว {order.queue_no || "-"}
                      </p>
                      <p className="mt-1 font-bold text-slate-900">
                        {order.customer_nickname || user.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        #{order.order_no} · {order.channel_name || "ร้านค้า"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {dateLabel(order.created_at)}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${orderStatusClass(order.status)}`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                  </div>
                  <div className="mt-4 border-y border-sky-50 py-3">
                    <ItemList items={order.items} />
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm text-slate-500">ยอดชำระ</span>
                    <strong className="text-lg text-sky-700">
                      {money(order.net_revenue)}
                    </strong>
                  </div>
                  {order.status !== "CANCELLED" && (Number(order.loyalty_points_earned || 0) || Number(order.loyalty_points_redeemed || 0)) ? (
                    <p className="mt-2 text-xs font-semibold text-violet-700">
                      {Number(order.loyalty_points_earned || 0) ? `ได้รับ ${Number(order.loyalty_points_earned).toLocaleString()} แต้ม` : ""}
                      {Number(order.loyalty_points_earned || 0) && Number(order.loyalty_points_redeemed || 0) ? " · " : ""}
                      {Number(order.loyalty_points_redeemed || 0) ? `ใช้ ${Number(order.loyalty_points_redeemed).toLocaleString()} แต้ม ลด ${money(order.loyalty_discount_amount)}` : ""}
                    </p>
                  ) : null}
                </article>
              ))
            ) : (
              <div className="shop-panel rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500 md:col-span-2">
                ไม่พบประวัติการสั่งซื้อ
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

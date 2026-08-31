import { useMemo, useState } from "react";
import customerOrderHistory from "../../assets/customer-order-history.png";
import { maskPhone } from "../../utils/phone";

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const statusLabel = (status) =>
  status === "COMPLETED"
    ? "เสร็จสิ้น"
    : status === "CANCELLED"
      ? "ยกเลิก"
      : "กำลังดำเนินการ";
const statusClass = (status) =>
  status === "COMPLETED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "CANCELLED"
      ? "bg-rose-50 text-rose-700"
      : "bg-amber-50 text-amber-700";
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

export default function UserOrderStatus({ user, orders, onLogout }) {
  const [query, setQuery] = useState("");
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
  return (
    <div className="shop-scene text-slate-800">
      <header className="shop-topbar relative z-10 border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="shop-orb grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">
              S
            </span>
            <div>
              <p className="font-bold text-slate-900">STOCKPOS</p>
              <p className="text-xs text-sky-600">Purchase history</p>
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
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100">
            My purchase history
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            ประวัติการสั่งซื้อทั้งหมด
          </h1>
          <p className="mt-2 text-sm text-sky-50">
            แสดงทุกออเดอร์ที่ระบุเบอร์โทร {maskPhone(user.phone) || "ของบัญชีคุณ"}
          </p>
          <label className="mt-5 block max-w-xl">
            <span className="sr-only">ค้นหาประวัติออเดอร์</span>
            <input
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-4 ring-white/15 placeholder:text-slate-400"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหาด้วยเลขคิว ชื่อเล่น หรือหมายเลขออเดอร์"
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
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(order.status)}`}
                    >
                      {statusLabel(order.status)}
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

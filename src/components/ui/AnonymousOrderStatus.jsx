import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import guestOrderLookup from "../../assets/guest-order-lookup.png";
import { maskPhone } from "../../utils/phone";

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
const todayInBangkok = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (name) => parts.find((part) => part.type === name)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
};
const dateLabel = (value) => new Intl.DateTimeFormat("th-TH", {
  timeZone: "Asia/Bangkok",
  dateStyle: "full",
}).format(new Date(`${value}T00:00:00+07:00`));
const timeLabel = (value) => value
  ? new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value))
  : "ไม่ระบุเวลา";

function ItemList({ items }) {
  if (!Array.isArray(items) || !items.length)
    return <p className="text-sm text-slate-500">ไม่มีรายการสินค้า</p>;
  return (
    <ul className="space-y-1 text-sm text-slate-600">
      {items.map((item, index) => (
        <li key={`${item.product_id || item.name}-${index}`}>
          {item.name} × {item.quantity || item.qty}
        </li>
      ))}
    </ul>
  );
}

export default function AnonymousOrderStatus({ apiBase, onBack }) {
  const [phone, setPhone] = useState("");
  const [activePhone, setActivePhone] = useState("");
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const loadOrders = useCallback(
    async (filterPhone = "") => {
      setPending(true);
      setError("");
      try {
        const response = await axios.post(
          `${apiBase}/api/public/orders/lookup`,
          { phone: filterPhone },
        );
        if (!response.data?.success)
          throw new Error(response.data?.error || "ไม่สามารถโหลดออเดอร์ได้");
        setOrders(response.data.data || []);
      } catch (requestError) {
        setOrders([]);
        setError(
          requestError.response?.data?.error ||
            "ไม่สามารถเชื่อมต่อข้อมูลออเดอร์ได้ กรุณาลองใหม่อีกครั้ง",
        );
      } finally {
        setPending(false);
      }
    },
    [apiBase],
  );
  useEffect(() => {
    loadOrders(activePhone);
  }, [activePhone, loadOrders]);
  const filter = (event) => {
    event.preventDefault();
    const nextPhone = phone.trim();
    if (nextPhone === activePhone) loadOrders(nextPhone);
    else setActivePhone(nextPhone);
  };
  const clearFilter = () => {
    setPhone("");
    if (activePhone) setActivePhone("");
    else loadOrders("");
  };

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
              <p className="text-xs text-sky-600">Order dashboard</p>
            </div>
          </div>
          <button
            className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"
            onClick={onBack}
          >
            เข้าสู่ระบบ
          </button>
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-5xl p-4 pb-10 sm:p-6">
        <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-gradient-to-br from-sky-700 via-sky-600 to-cyan-500 p-6 text-white shadow-xl shadow-sky-200/60 sm:p-8">
          <div className="relative z-10 max-w-2xl md:max-w-[62%]">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100">
            Public dashboard
          </p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            คิวออเดอร์รายวัน
          </h1>
          <p className="mt-2 text-sm text-sky-50">
            ดูคิวของวันนี้ได้เลยโดยไม่ต้องสมัครสมาชิก
            ใช้เบอร์โทรเมื่อต้องการค้นหาและกรองออเดอร์ของวันนี้
          </p>
          <form
            className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row"
            onSubmit={filter}
          >
            <input
              className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-4 ring-white/15 placeholder:text-slate-400"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="กรอกเบอร์โทรเพื่อค้นหา / กรอง"
            />
            <button
              className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60"
              disabled={pending}
            >
              {pending ? "กำลังโหลด..." : "ค้นหา"}
            </button>
            {activePhone && (
              <button
                className="rounded-xl border border-white/50 px-5 py-3 text-sm font-bold text-white hover:bg-white/10"
                type="button"
                onClick={clearFilter}
              >
                แสดงทั้งหมด
              </button>
            )}
          </form>
          </div>
          <img
            className="pointer-events-none absolute -right-3 -bottom-14 hidden h-[310px] w-[215px] object-cover object-[50%_12%] opacity-95 md:block lg:h-[360px] lg:w-[245px]"
            src={guestOrderLookup}
            alt=""
            aria-hidden="true"
          />
        </section>
        {error && (
          <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-600">
            {error}
          </p>
        )}
        <section className="mt-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {activePhone
                  ? `ผลการค้นหา: ${maskPhone(activePhone)}`
                  : "Dashboard คิวออเดอร์"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {activePhone
                  ? `แสดงเฉพาะออเดอร์ของเบอร์ที่ค้นหาในวันนี้ ${dateLabel(todayInBangkok())}`
                  : `แสดงคิวทั้งหมดของวันนี้ ${dateLabel(todayInBangkok())}`}
              </p>
            </div>
            <span className="text-sm text-slate-500">
              {orders.length} รายการ
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {pending ? (
              <div className="rounded-2xl border border-sky-100 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2">
                กำลังโหลดออเดอร์...
              </div>
            ) : orders.length ? (
              orders.map((order) => (
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
                        {order.customer_nickname || "ลูกค้า"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        #{order.order_no} · {order.channel_name || "ร้านค้า"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        เวลา {timeLabel(order.created_at)}
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
                </article>
              ))
            ) : (
              <div className="shop-panel rounded-2xl border border-dashed p-8 text-center text-sm text-slate-500 md:col-span-2">
                {activePhone
                  ? "ไม่พบออเดอร์สำหรับเบอร์โทรนี้ในวันที่เลือก"
                  : "ยังไม่มีออเดอร์ในวันที่เลือก"}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

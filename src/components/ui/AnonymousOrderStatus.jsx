import { useCallback, useEffect, useState } from "react";
import axios from "axios";

const statusLabel = (status) => status === "COMPLETED" ? "เสร็จสิ้น" : status === "CANCELLED" ? "ยกเลิก" : "กำลังดำเนินการ";
const statusClass = (status) => status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";

function ItemList({ items }) {
  if (!Array.isArray(items) || !items.length) return <p className="text-sm text-slate-500">ไม่มีรายการสินค้า</p>;
  return <ul className="space-y-1 text-sm text-slate-600">{items.map((item, index) => <li key={`${item.product_id || item.name}-${index}`}>{item.name} × {item.quantity || item.qty}</li>)}</ul>;
}

export default function AnonymousOrderStatus({ apiBase, onBack }) {
  const [phone, setPhone] = useState("");
  const [activePhone, setActivePhone] = useState("");
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(true);
  const loadOrders = useCallback(async (filterPhone = "") => {
    setPending(true);
    setError("");
    try {
      const response = await axios.post(`${apiBase}/api/public/orders/lookup`, { phone: filterPhone });
      if (!response.data?.success) throw new Error(response.data?.error || "ไม่สามารถโหลดออเดอร์ได้");
      setOrders(response.data.data || []);
      setActivePhone(filterPhone);
    } catch (requestError) {
      setOrders([]);
      setError(requestError.response?.data?.error || "ไม่สามารถเชื่อมต่อข้อมูลออเดอร์ได้ กรุณาลองใหม่อีกครั้ง");
    } finally { setPending(false); }
  }, [apiBase]);
  useEffect(() => { loadOrders(); }, [loadOrders]);
  const filter = (event) => { event.preventDefault(); loadOrders(phone.trim()); };
  const clearFilter = () => { setPhone(""); loadOrders(); };

  return <div className="min-h-screen bg-sky-50 text-slate-800"><header className="border-b border-sky-100 bg-white"><div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 p-4 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">S</span><div><p className="font-bold text-slate-900">STOCKPOS</p><p className="text-xs text-sky-600">Order dashboard</p></div></div><button className="rounded-xl border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50" onClick={onBack}>เข้าสู่ระบบจัดการร้าน</button></div></header><main className="mx-auto w-full max-w-5xl p-4 pb-10 sm:p-6"><section className="rounded-3xl bg-gradient-to-br from-sky-600 to-cyan-500 p-6 text-white sm:p-8"><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-100">Public dashboard</p><h1 className="mt-2 text-2xl font-bold sm:text-3xl">รายการออเดอร์ล่าสุด</h1><p className="mt-2 text-sm text-sky-50">ดู Dashboard ได้เลยโดยไม่ต้องสมัครสมาชิก ใช้เบอร์โทรเมื่อต้องการค้นหาและกรองออเดอร์</p><form className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row" onSubmit={filter}><input className="w-full rounded-xl border-0 bg-white px-4 py-3 text-sm text-slate-800 outline-none ring-4 ring-white/15 placeholder:text-slate-400" inputMode="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="กรอกเบอร์โทรเพื่อค้นหา / กรอง" /><button className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-60" disabled={pending}>{pending ? "กำลังโหลด..." : "ค้นหา"}</button>{activePhone && <button className="rounded-xl border border-white/50 px-5 py-3 text-sm font-bold text-white hover:bg-white/10" type="button" onClick={clearFilter}>แสดงทั้งหมด</button>}</form></section>{error && <p className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-medium text-rose-600">{error}</p>}<section className="mt-6"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-bold text-slate-900">{activePhone ? `ผลการค้นหา: ${activePhone}` : "Dashboard ออเดอร์"}</h2><p className="mt-1 text-sm text-slate-500">{activePhone ? "แสดงเฉพาะออเดอร์ของเบอร์ที่ค้นหา" : "แสดงออเดอร์ล่าสุดทั้งหมด"}</p></div><span className="text-sm text-slate-500">{orders.length} รายการ</span></div><div className="grid gap-4 md:grid-cols-2">{pending ? <div className="rounded-2xl border border-sky-100 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2">กำลังโหลดออเดอร์...</div> : orders.length ? orders.map((order) => <article className="rounded-2xl border border-sky-100 bg-white p-5 shadow-sm" key={order.id}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-sky-600">คิว {order.queue_no || "-"}</p><p className="mt-1 font-bold text-slate-900">{order.customer_nickname || "ลูกค้า"}</p><p className="mt-1 text-sm text-slate-500">#{order.order_no} · {order.channel_name || "ร้านค้า"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass(order.status)}`}>{statusLabel(order.status)}</span></div><div className="mt-4 border-y border-sky-50 py-3"><ItemList items={order.items} /></div></article>) : <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-8 text-center text-sm text-slate-500 md:col-span-2">{activePhone ? "ไม่พบออเดอร์สำหรับเบอร์โทรนี้" : "ยังไม่มีออเดอร์"}</div>}</div></section></main></div>;
}

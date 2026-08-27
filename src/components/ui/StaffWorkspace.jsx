import { useMemo, useState } from "react";

const money = (amount) => `฿${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const inputClass = "w-full min-w-0 rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100";
const statusClass = (status) => status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : status === "CANCELLED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";

function Button({ children, className = "", variant = "primary", ...props }) {
  const styles = variant === "danger" ? "border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus:ring-rose-100" : variant === "secondary" ? "border border-sky-200 bg-white text-sky-700 hover:bg-sky-50 focus:ring-sky-100" : "bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-200";
  return <button className={`rounded-xl px-3 py-2 text-sm font-semibold transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`} {...props}>{children}</button>;
}

function ItemList({ items }) {
  if (Array.isArray(items)) return <ul className="space-y-1 text-sm text-slate-600">{items.map((item, index) => <li key={`${item.product_id || item.name}-${index}`}>{item.name} × {item.quantity || item.qty}</li>)}</ul>;
  return <p className="text-sm text-slate-600">{items || "ไม่มีรายการสินค้า"}</p>;
}

export default function StaffWorkspace({ user, orders, channels, products, onAdd, onUpdate, onLogout }) {
  const [channelId, setChannelId] = useState(channels[0]?.id || "");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNickname, setCustomerNickname] = useState("");
  const [cart, setCart] = useState([]);
  const total = useMemo(() => cart.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0), [cart]);
  const addProduct = (product) => setCart((current) => {
    const existing = current.find((item) => item.product_id === product.id);
    return existing ? current.map((item) => item.product_id === product.id ? { ...item, qty: item.qty + 1 } : item) : [...current, { product_id: product.id, name: product.name, price: Number(product.price_retail || 0), qty: 1 }];
  });
  const updateQuantity = (productId, qty) => setCart((current) => current.map((item) => item.product_id === productId ? { ...item, qty: Math.max(1, Number(qty) || 1) } : item));
  const submit = async () => {
    if (!cart.length) return;
    const channel = channels.find((item) => String(item.id) === String(channelId));
    const saved = await onAdd({
      channel_id: Number(channelId),
      channel_name: channel?.name,
      customer_phone: customerPhone.trim(),
      customer_nickname: customerNickname.trim(),
      items: cart.map(({ product_id, qty, price }) => ({ product_id, qty, price })),
    });
    if (saved) { setCart([]); setCustomerPhone(""); setCustomerNickname(""); }
  };

  return <div className="min-h-screen bg-sky-50 text-slate-800">
    <header className="border-b border-sky-100 bg-white"><div className="mx-auto flex w-full max-w-[1500px] items-center justify-between gap-4 p-4 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">S</span><div><p className="font-bold text-slate-900">STOCKPOS</p><p className="text-xs text-sky-600">Staff workspace</p></div></div><div className="flex items-center gap-2"><span className="hidden text-sm font-semibold text-slate-600 sm:block">{user.name}</span><Button variant="secondary" onClick={onLogout}>ออกจากระบบ</Button></div></div></header>
    <main className="mx-auto w-full max-w-[1500px] space-y-6 p-4 pb-10 sm:p-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Staff access</p><h1 className="mt-1 text-2xl font-bold text-slate-900 sm:text-3xl">ขายและจัดการออเดอร์</h1><p className="mt-1 text-sm text-slate-500">คีย์รายการขายได้ทันที โดยเบอร์โทรและชื่อเล่นเป็นข้อมูลเสริมสำหรับแสดงผล</p></div>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-5">
          <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-semibold text-slate-600">เบอร์โทรศัพท์ลูกค้า <span className="font-normal text-slate-400">(ไม่บังคับ)</span><input className={inputClass} inputMode="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="เช่น 0812345678" /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600">ชื่อเล่นสำหรับแสดง <span className="font-normal text-slate-400">(ไม่บังคับ)</span><input className={inputClass} value={customerNickname} onChange={(event) => setCustomerNickname(event.target.value)} placeholder="เช่น นัท" maxLength="80" /></label></div>
            <p className="mt-3 rounded-xl bg-sky-50 p-3 text-xs leading-5 text-sky-800">ไม่จำเป็นต้องมีบัญชีผู้ใช้ หากระบุเบอร์โทร ลูกค้าสามารถนำเบอร์เดียวกันไปค้นหาสถานะออเดอร์ได้</p>
            <fieldset className="mt-5"><legend className="mb-3 text-sm font-bold text-slate-800">ช่องทางการขาย</legend><div className="grid gap-2 sm:grid-cols-2">{channels.map((channel) => <label className={`flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 ${String(channel.id) === String(channelId) ? "border-sky-500 bg-sky-50" : "border-sky-100"}`} key={channel.id}><span className="text-sm font-semibold text-slate-700">{channel.name}</span><input className="h-4 w-4 accent-sky-600" type="radio" checked={String(channel.id) === String(channelId)} onChange={() => setChannelId(channel.id)} /></label>)}</div></fieldset>
          </div>
          <div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">เมนูขาย</h2><span className="text-sm text-slate-500">{products.length} รายการ</span></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{products.map((product) => <button className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 text-left transition hover:border-sky-400 hover:bg-sky-50" key={product.id} onClick={() => addProduct(product)}><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg shadow-sm">{product.icon || "▦"}</span><p className="mt-3 truncate font-bold text-slate-800">{product.name}</p><p className="mt-1 text-sm font-semibold text-sky-700">{money(product.price_retail)}</p></button>)}</div></div>
        </div>
        <aside className="xl:sticky xl:top-5 xl:self-start"><div className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">ตะกร้าสินค้า</h2><span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-bold text-sky-700">{cart.length} รายการ</span></div><div className="my-4 space-y-3">{cart.length ? cart.map((item) => <div className="rounded-xl border border-sky-100 p-3" key={item.product_id}><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="truncate font-semibold text-slate-800">{item.name}</p><p className="text-sm text-sky-700">{money(item.price)}</p></div><Button className="px-2 py-1 text-xs" variant="danger" onClick={() => setCart((current) => current.filter((row) => row.product_id !== item.product_id))}>ลบ</Button></div><label className="mt-2 grid gap-1 text-xs font-medium text-slate-500">จำนวน<input className={inputClass} type="number" min="1" value={item.qty} onChange={(event) => updateQuantity(item.product_id, event.target.value)} /></label></div>) : <p className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-5 text-center text-sm text-slate-500">เลือกเมนูเพื่อเริ่มรายการขาย</p>}</div><div className="border-t border-sky-100 pt-4"><div className="mb-4 flex items-center justify-between"><span className="font-semibold text-slate-600">ยอดรวม</span><strong className="text-2xl text-sky-700">{money(total)}</strong></div><Button className="w-full" disabled={!cart.length} onClick={submit}>ยืนยันออเดอร์</Button></div></div></aside>
      </section>
      <section><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">Order management</p><h2 className="mt-1 text-xl font-bold text-slate-900">ออเดอร์ล่าสุด</h2></div><span className="text-sm text-slate-500">{orders.length} รายการ</span></div><div className="grid gap-4 xl:grid-cols-2">{orders.length ? orders.map((order) => <article className="rounded-2xl border border-sky-100 bg-white p-4 shadow-sm" key={order.id}><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-slate-900">คิว {order.queue_no || "-"} · #{order.order_no}</p><p className="mt-1 text-sm text-slate-500">{order.customer_nickname || "ไม่ระบุชื่อเล่น"} · {order.channel_name}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusClass(order.status)}`}>{order.status}</span></div><div className="mt-3 line-clamp-2"><ItemList items={order.items} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><strong className="text-lg text-sky-700">{money(order.net_revenue)}</strong>{order.status === "COOKING" ? <div className="flex gap-2"><Button className="text-xs" onClick={() => onUpdate(order.id, "COMPLETED")}>เสร็จสิ้น</Button><Button className="text-xs" variant="danger" onClick={() => onUpdate(order.id, "CANCELLED")}>ยกเลิก</Button></div> : <span className="text-xs text-slate-400">ไม่มีการดำเนินการ</span>}</div></article>) : <div className="rounded-xl border border-dashed border-sky-200 bg-white p-5 text-center text-sm text-slate-500 xl:col-span-2">ยังไม่มีออเดอร์</div>}</div></section>
    </main>
  </div>;
}

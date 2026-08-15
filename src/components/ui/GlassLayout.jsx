import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import StoreScene from "../3d/StoreScene";

const tabs = [
  { id: "pos", label: "3D POS & Orders" },
  { id: "inventory", label: "Warehouse" },
  { id: "finance", label: "Financial HUD" },
];

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

function GlassCard({ className = "", children }) {
  return (
    <section
      className={`pointer-events-auto rounded-2xl border border-slate-200/20 bg-slate-800/60 p-4 shadow-2xl shadow-slate-950/25 backdrop-blur-2xl ${className}`}
    >
      {children}
    </section>
  );
}

function OrdersPanel({ orders, onUpdate }) {
  return (
    <GlassCard className="flex min-h-0 w-full flex-col">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">
            Live queue
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">Orders</h2>
        </div>
        <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-mono text-cyan-300">
          {orders.length} LIVE
        </span>
      </div>
      <div className="mb-3 overflow-hidden rounded-xl border border-cyan-200/30 bg-slate-600/45">
        <div className="flex items-center justify-between border-b border-slate-100/20 px-3 py-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-cyan-100">
            3D live floor
          </span>
          <span className="text-[9px] font-mono text-emerald-200">● LIVE</span>
        </div>
        <div className="h-32">
          <Canvas camera={{ position: [5, 4, 6], fov: 42 }}>
            <color attach="background" args={["#64748b"]} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[4, 8, 5]} intensity={2} />
            <StoreScene mode="store" orders={orders} onHotspot={() => {}} />
            <OrbitControls enablePan={false} minDistance={5} maxDistance={12} />
            <Sky sunPosition={[5, 4, 2]} turbidity={8} />
          </Canvas>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {orders.map((order) => {
          const statusClass =
            order.status === "COOKING"
              ? "border-amber-400/40 bg-amber-400/10 text-amber-300"
              : order.status === "CANCELLED"
                ? "border-rose-400/40 bg-rose-400/10 text-rose-300"
                : "border-emerald-400/40 bg-emerald-400/10 text-emerald-300";
          return (
            <article
              key={order.id}
              className="rounded-xl border border-slate-200/15 bg-slate-800/65 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm text-slate-100">
                  #{order.order_no}
                </strong>
                <span
                  className={`rounded-md border px-2 py-1 text-[9px] font-mono ${statusClass}`}
                >
                  {order.status}
                </span>
              </div>
              <p className="mt-2 truncate text-xs text-slate-400">
                {order.channel_name}
              </p>
              <p className="mt-1 truncate text-xs text-slate-300">
                {order.items}
              </p>
              <div className="mt-3 flex items-center justify-between">
                <strong className="font-mono text-sm text-cyan-300">
                  {money(order.net_revenue)}
                </strong>
                {order.status === "COOKING" ? (
                  <div className="flex gap-1">
                    <button
                      className="rounded-md bg-cyan-400 px-2 py-1 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-300"
                      onClick={() => onUpdate(order.id, "COMPLETED")}
                    >
                      Done
                    </button>
                    <button
                      className="rounded-md border border-rose-400/40 px-2 py-1 text-[10px] text-rose-300 transition hover:bg-rose-400/10"
                      onClick={() => onUpdate(order.id, "CANCELLED")}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-slate-500">No action</span>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </GlassCard>
  );
}

function QuickPOSPanel({ channels, products, onAdd }) {
  const [channelId, setChannelId] = useState(channels[0]?.id);
  const [cart, setCart] = useState([]);
  const selectedChannel =
    channels.find((channel) => channel.id === channelId) || channels[0];
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const addProduct = (product) =>
    setCart((current) => {
      const found = current.find((item) => item.product_id === product.id);
      return found
        ? current.map((item) =>
            item.product_id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [
            ...current,
            {
              product_id: product.id,
              name: product.name,
              price: Number(product.price_retail || product.price || 0),
              quantity: 1,
            },
          ];
    });
  const changeQuantity = (productId, delta) =>
    setCart((current) =>
      current.flatMap((item) => {
        if (item.product_id !== productId) return [item];
        const quantity = item.quantity + delta;
        return quantity > 0 ? [{ ...item, quantity }] : [];
      }),
    );
  const removeProduct = (productId) =>
    setCart((current) =>
      current.filter((item) => item.product_id !== productId),
    );
  const submit = () => {
    if (!cart.length) return;
    onAdd({
      channel_id: selectedChannel?.id,
      channel_name: selectedChannel?.name,
      items: cart.map((item) => ({
        product_id: item.product_id,
        qty: item.quantity,
        price: item.price,
      })),
      total,
    });
    setCart([]);
  };

  return (
    <GlassCard className="w-full">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">
            Counter terminal
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            Quick POS
          </h2>
        </div>
        <span className="text-xs font-mono text-emerald-400">● READY</span>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-slate-400">Sales channel</p>
        <div className="grid gap-2">
          {channels.map((channel) => (
            <label
              key={channel.id}
              className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${channel.id === channelId ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-slate-200/15 bg-slate-700/40 text-slate-300 hover:border-slate-200/30"}`}
            >
              <span>{channel.name}</span>
              <input
                className="accent-cyan-400"
                type="radio"
                name="glass-channel"
                checked={channel.id === channelId}
                onChange={() => setChannelId(channel.id)}
              />
            </label>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <p className="mb-2 text-xs font-medium text-slate-400">Menu</p>
        <div className="grid gap-2">
          {products.map((product) => (
            <button
              key={product.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200/15 bg-slate-700/40 p-3 text-left transition hover:border-cyan-300/50 hover:bg-cyan-300/10"
              onClick={() => addProduct(product)}
            >
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-300/15 text-xl">
                {product.icon || "▦"}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-100">
                {product.name}
              </span>
              <strong className="font-mono text-xs text-cyan-200">
                {money(product.price_retail || product.price)}
              </strong>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5 border-t border-slate-800 pt-4">
        <p className="mb-2 text-xs font-medium text-slate-400">
          รายการที่เลือก
        </p>
        {cart.length ? (
          <div className="grid gap-2">
            {cart.map((item) => (
              <div
                key={item.product_id}
                className="flex items-center gap-2 rounded-lg border border-slate-200/15 bg-slate-700/40 p-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-slate-100">{item.name}</p>
                  <p className="mt-1 font-mono text-[10px] text-cyan-200">
                    {money(item.price)} / ชิ้น
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="grid h-6 w-6 place-items-center rounded border border-slate-200/25 text-xs text-slate-200 hover:border-cyan-300/60"
                    aria-label={`ลดจำนวน ${item.name}`}
                    onClick={() => changeQuantity(item.product_id, -1)}
                  >
                    -
                  </button>
                  <span className="w-5 text-center font-mono text-xs text-slate-100">
                    {item.quantity}
                  </span>
                  <button
                    className="grid h-6 w-6 place-items-center rounded border border-slate-200/25 text-xs text-slate-200 hover:border-cyan-300/60"
                    aria-label={`เพิ่มจำนวน ${item.name}`}
                    onClick={() => changeQuantity(item.product_id, 1)}
                  >
                    +
                  </button>
                </div>
                <button
                  className="rounded border border-rose-300/40 px-2 py-1 text-[10px] text-rose-200 hover:bg-rose-300/15"
                  aria-label={`ลบ ${item.name}`}
                  onClick={() => removeProduct(item.product_id)}
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200/20 px-3 py-3 text-center text-[10px] text-slate-400">
            ยังไม่มีรายการในตะกร้า
          </p>
        )}
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
        <span className="text-xs text-slate-400">
          Cart · {cart.reduce((sum, item) => sum + item.quantity, 0)} items
        </span>
        <strong className="font-mono text-lg text-slate-100">
          {money(total)}
        </strong>
      </div>
      <button
        className="mt-3 w-full rounded-lg bg-cyan-400 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!cart.length}
        onClick={submit}
      >
        Submit order
      </button>
    </GlassCard>
  );
}

function InventoryPanel({
  rows,
  products,
  onRestock,
  onCreate,
  onUpdate,
  onDelete,
  onCreateMenu,
  onUpdateMenu,
  onDeleteMenu,
}) {
  const emptyForm = {
    name: "",
    unit: "",
    stock_qty: 0,
    cost_per_unit: 0,
    min_stock_alert: 0,
    expiry_date: "",
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const beginCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
  };
  const beginEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name || "",
      unit: item.unit || "",
      stock_qty: item.stock_qty ?? item.stock ?? 0,
      cost_per_unit: item.cost_per_unit || 0,
      min_stock_alert: item.min_stock_alert || 0,
      expiry_date: item.expiry_date || item.expiry || "",
    });
  };
  const submit = async (event) => {
    event.preventDefault();
    const saved = editingId
      ? await onUpdate(editingId, form)
      : await onCreate(form);
    if (saved) {
      setEditingId(null);
      setForm(emptyForm);
    }
  };
  const setField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <>
      <GlassCard className="w-full">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">
              Warehouse
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-100">
              Stock health
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{rows.length} SKUs</span>
            <button
              className="rounded-md bg-cyan-400 px-2 py-1 text-[10px] font-semibold text-slate-950 hover:bg-cyan-300"
              onClick={beginCreate}
            >
              + Add
            </button>
          </div>
        </div>
        <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="mb-4 overflow-hidden rounded-xl border border-cyan-400/20 bg-slate-950/70 md:col-span-2 md:col-start-1 md:row-start-1">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">
                3D warehouse monitor
              </span>
              <span className="text-[9px] font-mono text-emerald-400">
                ● LIVE VIEW
              </span>
            </div>
            <div className="h-48">
              <Canvas camera={{ position: [6, 5, 7], fov: 42 }}>
                <color attach="background" args={["#0f172a"]} />
                <ambientLight intensity={0.8} />
                <directionalLight position={[4, 8, 5]} intensity={2} />
                <StoreScene
                  mode="warehouse"
                  inventoryRows={rows}
                  onHotspot={() => {}}
                />
                <OrbitControls
                  enablePan={false}
                  minDistance={5}
                  maxDistance={12}
                />
                <Sky sunPosition={[5, 4, 2]} turbidity={8} />
              </Canvas>
            </div>
          </div>
          <form
            className="mb-4 grid gap-2 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3 md:col-start-2 md:row-start-2"
            onSubmit={submit}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-300">
              {editingId ? "Edit ingredient" : "New ingredient"}
            </p>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              <label className="grid min-w-0 gap-1 text-[10px] text-slate-400">
                <span>ชื่อวัตถุดิบ</span>
                <small className="text-[9px] text-slate-600">
                  ชื่อที่ใช้แสดงในคลัง
                </small>
                <input
                  className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-slate-200"
                  placeholder="เช่น นมสด"
                  value={form.name}
                  onChange={setField("name")}
                  required
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[10px] text-slate-400">
                <span>หน่วยนับ</span>
                <small className="text-[9px] text-slate-600">
                  เช่น กรัม, มล., ใบ
                </small>
                <input
                  className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-slate-200"
                  placeholder="เช่น กรัม"
                  value={form.unit}
                  onChange={setField("unit")}
                  required
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[10px] text-slate-400">
                <span>จำนวนคงเหลือ</span>
                <small className="text-[9px] text-slate-600">
                  ปริมาณที่มีอยู่ตอนนี้
                </small>
                <input
                  className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-slate-200"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.stock_qty}
                  onChange={setField("stock_qty")}
                  required
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[10px] text-slate-400">
                <span>ต้นทุนต่อหน่วย</span>
                <small className="text-[9px] text-slate-600">
                  ต้นทุนของ 1 หน่วย
                </small>
                <input
                  className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-slate-200"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.cost_per_unit}
                  onChange={setField("cost_per_unit")}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[10px] text-slate-400">
                <span>จุดแจ้งเตือนสต็อกต่ำ</span>
                <small className="text-[9px] text-slate-600">
                  แจ้งเตือนเมื่อเหลือต่ำกว่าค่านี้
                </small>
                <input
                  className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-slate-200"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={form.min_stock_alert}
                  onChange={setField("min_stock_alert")}
                />
              </label>
              <label className="grid min-w-0 gap-1 text-[10px] text-slate-400">
                <span>วันหมดอายุ</span>
                <small className="text-[9px] text-slate-600">
                  วันที่ควรใช้ให้หมด
                </small>
                <input
                  className="w-full min-w-0 rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-xs text-slate-200"
                  type="date"
                  value={form.expiry_date}
                  onChange={setField("expiry_date")}
                />
              </label>
            </div>
            <div className="flex gap-2">
              <button
                className="flex-1 rounded-md bg-cyan-400 py-2 text-[10px] font-bold text-slate-950 hover:bg-cyan-300"
                type="submit"
              >
                {editingId ? "Save changes" : "Create item"}
              </button>
              {editingId && (
                <button
                  className="rounded-md border border-slate-700 px-3 text-[10px] text-slate-400 hover:text-slate-200"
                  type="button"
                  onClick={beginCreate}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
          <div className="max-h-[calc(100vh-390px)] space-y-2 overflow-y-auto md:col-start-1 md:row-start-2">
            {rows.map((item) => {
              const low = item.level === "low" || item.is_low_stock;
              return (
                <div
                  key={item.id || item.code}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3"
                >
                  <span
                    className={`h-2 w-2 rounded-full ${low ? "bg-rose-400 shadow-[0_0_10px_#fb7185]" : "bg-emerald-400"}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-slate-200">
                      {item.name}
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {item.stock_qty ?? item.stock} {item.unit}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="rounded-md border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:border-cyan-400/40"
                      onClick={() => beginEdit(item)}
                    >
                      Edit
                    </button>
                    <button
                      className="rounded-md border border-rose-400/30 px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-400/10"
                      onClick={() => onDelete(item)}
                    >
                      Delete
                    </button>
                    <button
                      className="rounded-md border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-400/10"
                      onClick={() => onRestock(item)}
                    >
                      Restock
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </GlassCard>
      <MenuManager
        products={products}
        ingredients={rows}
        onCreate={onCreateMenu}
        onUpdate={onUpdateMenu}
        onDelete={onDeleteMenu}
      />
    </>
  );
}

function MenuManager({
  products = [],
  ingredients = [],
  onCreate,
  onUpdate,
  onDelete,
}) {
  const emptyForm = {
    name: "",
    category: "",
    price_retail: 0,
    price_wholesale: "",
    recipe: [],
  };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const setField = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  const beginCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
  };
  const beginEdit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name || "",
      category: product.category || "",
      price_retail: product.price_retail || 0,
      price_wholesale: product.price_wholesale || "",
      recipe: (product.recipe || []).map((item) => ({
        ingredient_id: item.ingredient_id,
        quantity_used: item.quantity_used,
      })),
    });
  };
  const addRecipeRow = () =>
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
  const removeRecipe = (index) =>
    setForm((current) => ({
      ...current,
      recipe: current.recipe.filter((_, itemIndex) => itemIndex !== index),
    }));
  const submit = async (event) => {
    event.preventDefault();
    if (!form.recipe.length) {
      window.alert("กรุณาเลือกวัตถุดิบอย่างน้อย 1 รายการต่อเมนู");
      return;
    }
    const saved = editingId
      ? await onUpdate(editingId, form)
      : await onCreate(form);
    if (saved) beginCreate();
  };
  return (
    <GlassCard className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-amber-300">
            Menu catalog
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            Menus & recipes
          </h2>
        </div>
        <button
          className="rounded-md border border-amber-300/40 px-2 py-1 text-[10px] text-amber-200 hover:bg-amber-300/10"
          onClick={beginCreate}
        >
          + Add menu
        </button>
      </div>
      <form
        className="grid gap-2 rounded-lg border border-amber-300/20 bg-amber-300/5 p-3"
        onSubmit={submit}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-amber-200">
          {editingId ? "Edit menu" : "New menu"}
        </p>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
          <input
            className="w-full min-w-0 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
            placeholder="ชื่อเมนู"
            value={form.name}
            onChange={setField("name")}
            required
          />
          <input
            className="w-full min-w-0 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
            placeholder="หมวดหมู่"
            value={form.category}
            onChange={setField("category")}
          />
          <input
            className="w-full min-w-0 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
            type="number"
            min="0"
            step="0.01"
            placeholder="ราคาขาย"
            value={form.price_retail}
            onChange={setField("price_retail")}
            required
          />
          <input
            className="w-full min-w-0 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
            type="number"
            min="0"
            step="0.01"
            placeholder="ราคาส่ง"
            value={form.price_wholesale}
            onChange={setField("price_wholesale")}
          />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-400">วัตถุดิบต่อ 1 เมนู</p>
          <button
            className="rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-200 hover:bg-cyan-300/10"
            type="button"
            onClick={addRecipeRow}
          >
            + วัตถุดิบ
          </button>
        </div>
        {form.recipe.length ? (
          <div className="grid gap-2">
            {form.recipe.map((item, index) => (
              <div
                className="grid grid-cols-[minmax(0,1fr)_90px_auto] gap-2"
                key={`${item.ingredient_id}-${index}`}
              >
                <select
                  className="min-w-0 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
                  value={item.ingredient_id}
                  onChange={(event) =>
                    updateRecipe(index, "ingredient_id", event.target.value)
                  }
                >
                  {ingredients.map((ingredient) => (
                    <option
                      className="bg-slate-800"
                      key={ingredient.id}
                      value={ingredient.id}
                    >
                      {ingredient.name} ({ingredient.unit})
                    </option>
                  ))}
                </select>
                <input
                  className="min-w-0 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={item.quantity_used}
                  onChange={(event) =>
                    updateRecipe(index, "quantity_used", event.target.value)
                  }
                />
                <button
                  className="rounded-md border border-rose-300/30 px-2 text-[10px] text-rose-200"
                  type="button"
                  onClick={() => removeRecipe(index)}
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-slate-200/15 px-2 py-2 text-[10px] text-slate-500">
            ยังไม่ได้เลือกวัตถุดิบ ระบบจะไม่หัก stock สำหรับเมนูนี้
          </p>
        )}
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-md bg-amber-300 py-2 text-[10px] font-bold text-slate-950 hover:bg-amber-200"
            type="submit"
          >
            {editingId ? "Save menu" : "Create menu"}
          </button>
          {editingId && (
            <button
              className="rounded-md border border-slate-700 px-3 text-[10px] text-slate-400"
              type="button"
              onClick={beginCreate}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="mt-3 grid gap-2">
        {products.map((product) => (
          <div
            className="flex items-center gap-2 rounded-lg border border-slate-200/15 bg-slate-700/30 p-2"
            key={product.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-slate-100">{product.name}</p>
              <p className="text-[10px] text-slate-400">
                ฿{Number(product.price_retail || 0).toFixed(2)} ·{" "}
                {(product.recipe || []).length} วัตถุดิบ
              </p>
            </div>
            <button
              className="rounded-md border border-slate-200/20 px-2 py-1 text-[10px] text-slate-200"
              onClick={() => beginEdit(product)}
            >
              Edit
            </button>
            <button
              className="rounded-md border border-rose-300/30 px-2 py-1 text-[10px] text-rose-200"
              onClick={() => onDelete(product)}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function FinancePanel({
  metrics,
  expenses,
  orders,
  expenseRows = [],
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  channels = [],
  products = [],
  onCreateSales,
  onUpdateSales,
  onDeleteSales,
}) {
  const dashboardMetrics = [
    ["ยอดขายรวม", metrics.gross],
    ["ยอดสุทธิ", metrics.net],
    ["ต้นทุนสินค้า", metrics.cogs],
    ["GP fee", metrics.gp],
    ["ค่าใช้จ่าย", expenses],
    ["กำไรสุทธิ", metrics.profit],
  ];
  const emptyExpense = {
    category: "OPERATING_EXPENSE",
    description: "",
  };
  const [form, setForm] = useState(emptyExpense);
  const [editingId, setEditingId] = useState(null);
  const [salesDate, setSalesDate] = useState("");
  const newSalesForm = () => ({
    order_no: `MAN-${Date.now()}`,
    channel_id: channels[0]?.id || "",
    status: "COMPLETED",
    items: [{ product_id: products[0]?.id || "", qty: 1, price: products[0]?.price_retail || "" }],
  });
  const [salesForm, setSalesForm] = useState(newSalesForm);
  const [editingSalesId, setEditingSalesId] = useState(null);
  const updateSalesItem = (index, field, value) => setSalesForm((current) => ({ ...current, items: current.items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    if (field === "product_id") {
      const product = products.find((row) => String(row.id) === String(value));
      return { ...item, product_id: value, price: product?.price_retail ?? item.price };
    }
    return { ...item, [field]: value };
  }) }));
  const addSalesItem = () => setSalesForm((current) => ({ ...current, items: [...current.items, { product_id: products[0]?.id || "", qty: 1, price: products[0]?.price_retail || "" }] }));
  const removeSalesItem = (index) => setSalesForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }));
  const submitSales = async (event) => {
    event.preventDefault();
    const items = salesForm.items.map((item) => ({ product_id: Number(item.product_id), qty: Number(item.qty), price: Number(item.price) }));
    if (!salesForm.order_no.trim() || !salesForm.channel_id || !items.length || items.some((item) => !item.product_id || item.qty <= 0 || item.price < 0)) return;
    const record = { ...salesForm, channel_id: Number(salesForm.channel_id), order_no: salesForm.order_no.trim(), items };
    const saved = editingSalesId ? await onUpdateSales(editingSalesId, record) : await onCreateSales(record);
    if (saved) { setEditingSalesId(null); setSalesForm(newSalesForm()); }
  };
  const editSales = (order) => {
    setEditingSalesId(order.id);
    setSalesForm({ order_no: order.order_no || "", channel_id: order.channel_id || "", status: order.status || "COMPLETED", items: (order.rawItems || []).map((item) => ({ product_id: item.product_id, qty: item.quantity ?? item.qty, price: item.unit_price ?? item.price })) });
  };
  const cancelSalesEdit = () => { setEditingSalesId(null); setSalesForm(newSalesForm()); };
  const submitExpense = async (event) => {
    event.preventDefault();
    if (!Number(form.amount) || Number(form.amount) <= 0) return;
    const saved = editingId
      ? await onUpdateExpense(
          editingId,
          form.amount,
          form.category,
          form.description,
        )
      : await onCreateExpense(form.amount, form.category, form.description);
    if (saved) {
      setEditingId(null);
      setForm(emptyExpense);
    }
  };
  const editExpense = (item) => {
    setEditingId(item.id);
    setForm({
      amount: item.amount,
      category: item.category,
      description: item.description || "",
    });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyExpense);
  };
  const operatingTotal = expenseRows
    .filter((item) => item.category !== "DELIVERY_COST")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const deliveryTotal = expenseRows
    .filter((item) => item.category === "DELIVERY_COST")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const filteredSalesRows = orders.filter((order) => !salesDate || String(order.created_at || "").slice(0, 10) === salesDate);
  const exportSales = () => {
    const rows = filteredSalesRows.map((order) => [order.order_no, order.created_at || "", order.channel_name || "", order.status || "", order.items || "", order.net_revenue || 0]);
    const csv = [["Order", "Date", "Channel", "Status", "Items", "Net revenue"], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stockpos-sales${salesDate ? `-${salesDate}` : "-all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const [expenseDate, setExpenseDate] = useState("");
  const filteredExpenseRows = expenseRows.filter((item) => !expenseDate || String(item.created_at || "").slice(0, 10) === expenseDate);
  const exportExpenses = () => {
    const rows = filteredExpenseRows.map((item) => [item.id, item.created_at || "", item.category === "DELIVERY_COST" ? "Delivery cost" : "Operating expense", item.amount, item.description || ""]);
    const csv = [["ID", "Date", "Category", "Amount", "Description"], ...rows]
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `stockpos-expenses${expenseDate ? `-${expenseDate}` : "-all"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <GlassCard className="w-full">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300">
            Financial HUD
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-100">
            Sales dashboard
          </h2>
        </div>
        <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-[10px] font-mono text-emerald-200">
          LIVE TOTALS
        </span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        {dashboardMetrics.map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-slate-200/15 bg-slate-700/40 p-3"
          >
            <p className="text-[10px] text-slate-400">{label}</p>
            <strong
              className={`mt-2 block font-mono text-base ${label === "กำไรสุทธิ" ? "text-emerald-200" : label === "ต้นทุนสินค้า" || label === "ค่าใช้จ่าย" ? "text-amber-200" : "text-cyan-200"}`}
            >
              {money(value)}
            </strong>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200/15 bg-slate-700/30 p-3">
          <p className="text-[10px] text-slate-400">ออเดอร์ทั้งหมด</p>
          <strong className="mt-2 block font-mono text-lg text-slate-100">
            {orders.length}
          </strong>
        </div>
        <div className="rounded-xl border border-slate-200/15 bg-slate-700/30 p-3">
          <p className="text-[10px] text-slate-400">ออเดอร์ที่สำเร็จ</p>
          <strong className="mt-2 block font-mono text-lg text-emerald-200">
            {orders.filter((order) => order.status === "COMPLETED").length}
          </strong>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200/15 bg-slate-700/30 p-3">
          <p className="text-[10px] text-slate-400">Operating expense ทั้งหมด</p>
          <strong className="mt-2 block font-mono text-sm text-amber-200">{money(operatingTotal)}</strong>
        </div>
        <div className="rounded-xl border border-slate-200/15 bg-slate-700/30 p-3">
          <p className="text-[10px] text-slate-400">Delivery cost ทั้งหมด</p>
          <strong className="mt-2 block font-mono text-sm text-amber-200">{money(deliveryTotal)}</strong>
        </div>
      </div>
      <div className="mt-4 grid min-w-0 gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3">
        <div className="flex items-end justify-between gap-2">
          <label className="grid flex-1 gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-200">Sales records
            <input className="mt-1 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs font-sans normal-case tracking-normal text-slate-100" type="date" value={salesDate} onChange={(event) => setSalesDate(event.target.value)} />
          </label>
          <button className="rounded-md border border-cyan-300/30 px-2 py-2 text-[10px] text-cyan-100 hover:bg-cyan-300/10" type="button" onClick={exportSales}>Export Sales Excel</button>
        </div>
        <form className="grid gap-2 rounded-lg border border-slate-200/15 bg-slate-800/30 p-2" onSubmit={submitSales}>
          <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-200">{editingSalesId ? "Edit sales record" : "Add sales record"}</p>
          <div className="grid gap-2 md:grid-cols-3"><input className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100" value={salesForm.order_no} onChange={(event) => setSalesForm((current) => ({ ...current, order_no: event.target.value }))} placeholder="Order number" required /><select className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100" value={salesForm.channel_id} onChange={(event) => setSalesForm((current) => ({ ...current, channel_id: event.target.value }))} required>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.name}</option>)}</select><select className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100" value={salesForm.status} onChange={(event) => setSalesForm((current) => ({ ...current, status: event.target.value }))}><option value="COOKING">Cooking</option><option value="COMPLETED">Completed</option></select></div>
          {salesForm.items.map((item, index) => <div className="grid gap-2 md:grid-cols-[1fr_100px_120px_auto]" key={index}><select className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100" value={item.product_id} onChange={(event) => updateSalesItem(index, "product_id", event.target.value)} required>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100" type="number" min="1" step="1" value={item.qty} onChange={(event) => updateSalesItem(index, "qty", event.target.value)} required /><input className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100" type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateSalesItem(index, "price", event.target.value)} required />{salesForm.items.length > 1 && <button className="rounded-md border border-rose-300/30 px-2 text-[10px] text-rose-200" type="button" onClick={() => removeSalesItem(index)}>Remove</button>}</div>)}
          <div className="flex flex-wrap gap-2"><button className="rounded-md border border-cyan-300/30 px-2 py-2 text-[10px] text-cyan-100 hover:bg-cyan-300/10" type="button" onClick={addSalesItem}>Add item</button><button className="rounded-md bg-cyan-300 px-3 py-2 text-[10px] font-semibold text-slate-950" type="submit">{editingSalesId ? "Save sales record" : "Create sales record"}</button>{editingSalesId && <button className="rounded-md border border-slate-200/20 px-3 py-2 text-[10px] text-slate-300" type="button" onClick={cancelSalesEdit}>Cancel</button>}</div>
        </form>
        <div className="max-h-44 space-y-2 overflow-y-auto">
          {filteredSalesRows.length ? filteredSalesRows.map((order) => <div className="flex items-center gap-2 rounded-lg border border-slate-200/15 bg-slate-700/30 p-2" key={order.id}><div className="min-w-0 flex-1"><p className="font-mono text-xs text-cyan-100">#{order.order_no} · {money(order.net_revenue)}</p><p className="truncate text-[10px] text-slate-400">{order.channel_name} · {order.status} · {order.items || "ไม่มีรายการ"}</p></div><button className="rounded-md border border-cyan-300/30 px-2 py-1 text-[10px] text-cyan-100" type="button" onClick={() => editSales(order)}>Edit</button><button className="rounded-md border border-rose-300/30 px-2 py-1 text-[10px] text-rose-200" type="button" onClick={() => onDeleteSales(order)}>Delete</button></div>) : <p className="rounded-md border border-dashed border-slate-200/15 p-3 text-center text-[10px] text-slate-500">ไม่มีรายการขายในวันที่เลือก</p>}
        </div>
      </div>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
      <form
        className="grid min-w-0 content-start gap-2 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3"
        onSubmit={submitExpense}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-cyan-200">
          {editingId ? "Edit expense" : "Add expense"}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className="grid gap-1 text-[10px] text-slate-400">
            จำนวนเงิน
            <input
              className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  amount: event.target.value,
                }))
              }
              required
            />
          </label>
          <label className="grid gap-1 text-[10px] text-slate-400">
            ประเภท
            <select
              className="rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
            >
              <option className="bg-slate-800" value="OPERATING_EXPENSE">
                Operating expense
              </option>
              <option className="bg-slate-800" value="DELIVERY_COST">
                Delivery cost
              </option>
            </select>
          </label>
          <label className="col-span-2 grid gap-1 text-[10px] text-slate-400">
            รายละเอียด
            <textarea
              className="min-h-20 w-full resize-y rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs text-slate-100"
              placeholder="เช่น ค่าขนส่งวัตถุดิบรอบเช้า"
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
            />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            className="flex-1 rounded-lg bg-cyan-300 py-2 text-xs font-bold text-slate-950"
            type="submit"
          >
            {editingId ? "Save changes" : "Add expense"}
          </button>
          {editingId && (
            <button
              className="rounded-lg border border-slate-200/20 px-3 text-xs text-slate-200"
              type="button"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
      <div className="grid min-w-0 content-start gap-2">
        <div className="flex items-end justify-between gap-2">
          <label className="grid flex-1 gap-1 text-[10px] font-mono uppercase tracking-[0.18em] text-slate-400">Expense ledger
            <input className="mt-1 rounded-md border border-slate-200/15 bg-slate-700/40 px-2 py-2 text-xs font-sans normal-case tracking-normal text-slate-100" type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
          </label>
          <button className="rounded-md border border-emerald-300/30 px-2 py-2 text-[10px] text-emerald-200 hover:bg-emerald-300/10" type="button" onClick={exportExpenses}>Export Excel</button>
        </div>
        {filteredExpenseRows.length ? (
          filteredExpenseRows.map((item) => (
            <div
              className="flex items-center gap-2 rounded-lg border border-slate-200/15 bg-slate-700/30 p-2"
              key={item.id}
            >
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-cyan-100">
                  {money(item.amount)}
                </p>
                <p className="text-[10px] text-slate-400">
                  {item.category === "DELIVERY_COST"
                    ? "Delivery cost"
                    : "Operating expense"}
                </p>
                {item.description && (
                  <p className="mt-1 truncate text-[10px] text-slate-500">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                className="rounded-md border border-slate-200/20 px-2 py-1 text-[10px] text-slate-200"
                onClick={() => editExpense(item)}
              >
                Edit
              </button>
              <button
                className="rounded-md border border-rose-300/30 px-2 py-1 text-[10px] text-rose-200"
                onClick={() => onDeleteExpense(item)}
              >
                Delete
              </button>
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-dashed border-slate-200/15 p-3 text-center text-[10px] text-slate-500">
            ยังไม่มีรายการค่าใช้จ่าย
          </p>
        )}
      </div>
      </div>
    </GlassCard>
  );
}

export default function GlassLayout({
  activeView,
  setActiveView,
  orders,
  channels,
  products,
  inventoryRows,
  metrics,
  expenses,
  expenseRows,
  notice,
  onAdd,
  onUpdate,
  onRestock,
  onCreateInventory,
  onUpdateInventory,
  onDeleteInventory,
  onCreateMenu,
  onUpdateMenu,
  onDeleteMenu,
  onCreateExpense,
  onUpdateExpense,
  onDeleteExpense,
  onCreateSales,
  onUpdateSales,
  onDeleteSales,
}) {
  const sceneMode =
    activeView === "inventory"
      ? "warehouse"
      : activeView === "finance"
        ? "finance"
        : "store";
  return (
    <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-slate-800 text-slate-100">
      <div className="pointer-events-none absolute inset-0 z-20">
        <aside
          className={`absolute top-20 bottom-14 flex flex-col ${activeView === "inventory" ? "left-4 right-4 overflow-x-hidden overflow-y-auto md:left-6 md:right-6" : activeView === "pos" ? "bottom-[52%] left-4 right-4 overflow-y-auto md:bottom-14 md:left-6 md:right-[60%] md:top-24" : "left-4 right-4 overflow-y-auto md:left-6 md:right-6 md:top-24"}`}
        >
          <div className={`flex min-h-0 flex-1 ${activeView === "inventory" ? "flex-col gap-4 md:flex-row" : ""}`}>
            {activeView === "pos" && (
              <OrdersPanel orders={orders} onUpdate={onUpdate} />
            )}
            {activeView === "inventory" && (
              <InventoryPanel
                rows={inventoryRows}
                products={products}
                onRestock={onRestock}
                onCreate={onCreateInventory}
                onUpdate={onUpdateInventory}
                onDelete={onDeleteInventory}
                onCreateMenu={onCreateMenu}
                onUpdateMenu={onUpdateMenu}
                onDeleteMenu={onDeleteMenu}
              />
            )}
            {activeView === "finance" && (
              <FinancePanel
                metrics={metrics}
                expenses={expenses}
                expenseRows={expenseRows}
                orders={orders}
                onCreateExpense={onCreateExpense}
                onUpdateExpense={onUpdateExpense}
                onDeleteExpense={onDeleteExpense}
                channels={channels}
                products={products}
                onCreateSales={onCreateSales}
                onUpdateSales={onUpdateSales}
                onDeleteSales={onDeleteSales}
              />
            )}
          </div>
        </aside>
        {activeView === "pos" && (
          <aside className="pointer-events-auto absolute bottom-14 left-4 right-4 top-[52%] overflow-y-auto md:left-[40%] md:right-4 md:top-24">
            <QuickPOSPanel
              channels={channels}
              products={products}
              onAdd={onAdd}
            />
          </aside>
        )}
      </div>
      <header className="pointer-events-auto absolute left-0 right-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200/15 bg-slate-800/85 px-3 backdrop-blur-xl sm:gap-4 sm:px-4 md:px-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-300 font-black text-slate-950 shadow-neon">
            S
          </span>
          <span className="hidden text-xs font-bold tracking-[0.18em] text-slate-100 sm:block">
            STOCKPOS
          </span>
        </div>
        <nav className="ml-auto flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`whitespace-nowrap rounded-lg px-2 py-2 text-[9px] font-medium transition sm:px-3 sm:text-[10px] ${activeView === tab.id ? "bg-cyan-300/20 text-cyan-100 shadow-neon" : "text-slate-300 hover:bg-slate-700/70 hover:text-white"}`}
              onClick={() => setActiveView(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <span className="hidden text-[10px] font-mono text-emerald-300 lg:block">
          ● LIVE
        </span>
      </header>
      <footer className="pointer-events-auto absolute bottom-0 left-0 right-0 z-30 flex h-9 items-center justify-between border-t border-slate-200/15 bg-slate-800/90 px-4 text-[9px] font-mono text-slate-300 backdrop-blur-xl md:px-6">
        <span className="text-emerald-300">● SOCKET.IO CONNECTED</span>
        <span className="hidden sm:block">{notice}</span>
        <span className="text-cyan-200">DB · POSTGRESQL</span>
      </footer>
    </div>
  );
}

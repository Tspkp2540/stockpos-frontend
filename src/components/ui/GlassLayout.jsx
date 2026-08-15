import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import StoreScene from '../3d/StoreScene';

const tabs = [
  { id: 'pos', label: '3D POS & Orders' },
  { id: 'inventory', label: 'Warehouse' },
  { id: 'finance', label: 'Financial HUD' }
];

const money = (amount) => `฿${Number(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

function GlassCard({ className = '', children }) {
  return <section className={`pointer-events-auto rounded-2xl border border-slate-800/80 bg-slate-900/70 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl ${className}`}>{children}</section>;
}

function OrdersPanel({ orders, onUpdate }) {
  return <GlassCard className="flex min-h-0 w-full flex-col">
    <div className="mb-4 flex items-start justify-between">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">Live queue</p>
        <h2 className="mt-1 text-lg font-semibold text-slate-100">Orders</h2>
      </div>
      <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-1 text-[10px] font-mono text-cyan-300">{orders.length} LIVE</span>
    </div>
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
      {orders.map((order) => {
        const statusClass = order.status === 'COOKING' ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : order.status === 'CANCELLED' ? 'border-rose-400/40 bg-rose-400/10 text-rose-300' : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300';
        return <article key={order.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm text-slate-100">#{order.order_no}</strong>
            <span className={`rounded-md border px-2 py-1 text-[9px] font-mono ${statusClass}`}>{order.status}</span>
          </div>
          <p className="mt-2 truncate text-xs text-slate-400">{order.channel_name}</p>
          <p className="mt-1 truncate text-xs text-slate-300">{order.items}</p>
          <div className="mt-3 flex items-center justify-between">
            <strong className="font-mono text-sm text-cyan-300">{money(order.net_revenue)}</strong>
            {order.status === 'COOKING' ? <div className="flex gap-1">
              <button className="rounded-md bg-cyan-400 px-2 py-1 text-[10px] font-semibold text-slate-950 transition hover:bg-cyan-300" onClick={() => onUpdate(order.id, 'COMPLETED')}>Done</button>
              <button className="rounded-md border border-rose-400/40 px-2 py-1 text-[10px] text-rose-300 transition hover:bg-rose-400/10" onClick={() => onUpdate(order.id, 'CANCELLED')}>Cancel</button>
            </div> : <span className="text-[10px] text-slate-500">No action</span>}
          </div>
        </article>;
      })}
    </div>
  </GlassCard>;
}

function QuickPOSPanel({ channels, products, onAdd }) {
  const [channelId, setChannelId] = useState(channels[0]?.id);
  const [cart, setCart] = useState([]);
  const selectedChannel = channels.find((channel) => channel.id === channelId) || channels[0];
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const addProduct = (product) => setCart((current) => {
    const found = current.find((item) => item.product_id === product.id);
    return found ? current.map((item) => item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { product_id: product.id, name: product.name, price: Number(product.price_retail || product.price || 0), quantity: 1 }];
  });
  const submit = () => {
    if (!cart.length) return;
    onAdd({ channel_id: selectedChannel?.id, channel_name: selectedChannel?.name, items: cart.map((item) => ({ product_id: item.product_id, qty: item.quantity, price: item.price })), total });
    setCart([]);
  };

  return <GlassCard className="w-full">
    <div className="flex items-start justify-between">
      <div><p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">Counter terminal</p><h2 className="mt-1 text-lg font-semibold text-slate-100">Quick POS</h2></div>
      <span className="text-xs font-mono text-emerald-400">● READY</span>
    </div>
    <div className="mt-5">
      <p className="mb-2 text-xs font-medium text-slate-400">Sales channel</p>
      <div className="grid gap-2">
        {channels.map((channel) => <label key={channel.id} className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-xs transition ${channel.id === channelId ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200' : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:border-slate-700'}`}>
          <span>{channel.name}</span><input className="accent-cyan-400" type="radio" name="glass-channel" checked={channel.id === channelId} onChange={() => setChannelId(channel.id)} />
        </label>)}
      </div>
    </div>
    <div className="mt-5">
      <p className="mb-2 text-xs font-medium text-slate-400">Menu</p>
      <div className="grid gap-2">
        {products.map((product) => <button key={product.id} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-left transition hover:border-cyan-400/40 hover:bg-cyan-400/5" onClick={() => addProduct(product)}>
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-cyan-400/10 text-xl">{product.icon || '▦'}</span><span className="min-w-0 flex-1 truncate text-xs text-slate-200">{product.name}</span><strong className="font-mono text-xs text-cyan-300">{money(product.price_retail || product.price)}</strong>
        </button>)}
      </div>
    </div>
    <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4"><span className="text-xs text-slate-400">Cart · {cart.reduce((sum, item) => sum + item.quantity, 0)} items</span><strong className="font-mono text-lg text-slate-100">{money(total)}</strong></div>
    <button className="mt-3 w-full rounded-lg bg-cyan-400 py-3 text-xs font-bold uppercase tracking-wider text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40" disabled={!cart.length} onClick={submit}>Submit order</button>
  </GlassCard>;
}

function InventoryPanel({ rows, onRestock }) {
  return <GlassCard className="w-full"><div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">Warehouse</p><h2 className="mt-1 text-lg font-semibold text-slate-100">Stock health</h2></div><span className="text-xs text-slate-500">{rows.length} SKUs</span></div><div className="max-h-[calc(100vh-230px)] space-y-2 overflow-y-auto">{rows.map((item) => { const low = item.level === 'low' || item.is_low_stock; return <div key={item.id || item.code} className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3"><span className={`h-2 w-2 rounded-full ${low ? 'bg-rose-400 shadow-[0_0_10px_#fb7185]' : 'bg-emerald-400'}`} /><div className="min-w-0 flex-1"><p className="truncate text-xs text-slate-200">{item.name}</p><p className="mt-1 text-[10px] text-slate-500">{item.stock_qty ?? item.stock} {item.unit}</p></div><button className="rounded-md border border-cyan-400/30 px-2 py-1 text-[10px] text-cyan-300 hover:bg-cyan-400/10" onClick={() => onRestock(item)}>Restock</button></div>; })}</div></GlassCard>;
}

function FinancePanel({ metrics, expenses, onExpense }) {
  return <GlassCard className="w-full"><p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">Financial HUD</p><h2 className="mt-1 text-lg font-semibold text-slate-100">Daily pulse</h2><div className="mt-5 grid grid-cols-2 gap-2">{[['Gross', metrics.gross], ['COGS', metrics.cogs], ['GP fee', metrics.gp], ['Expenses', expenses]].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3"><p className="text-[10px] text-slate-500">{label}</p><strong className="mt-2 block font-mono text-sm text-cyan-300">{money(value)}</strong></div>)}</div><div className="mt-5 grid gap-2"><button className="rounded-lg border border-cyan-400/30 bg-cyan-400/10 py-3 text-xs text-cyan-200 hover:bg-cyan-400/20" onClick={() => onExpense(1200, 'OPERATING_EXPENSE')}>Record expense · ฿1,200</button><button className="rounded-lg border border-slate-700 py-3 text-xs text-slate-300 hover:border-cyan-400/40" onClick={() => onExpense(450, 'DELIVERY_COST')}>Log delivery · ฿450</button></div></GlassCard>;
}

export default function GlassLayout({ activeView, setActiveView, orders, channels, products, inventoryRows, metrics, expenses, notice, onAdd, onUpdate, onRestock, onExpense }) {
  const sceneMode = activeView === 'inventory' ? 'warehouse' : activeView === 'finance' ? 'finance' : 'store';
  return <div className="fixed inset-0 h-screen w-screen overflow-hidden bg-slate-950 text-slate-100">
    <div className="absolute inset-0 z-0">
      <Canvas camera={{ position: sceneMode === 'store' ? [5, 4, 6] : [6, 5, 7], fov: 42 }}>
        <color attach="background" args={['#0f172a']} /><ambientLight intensity={0.8} /><directionalLight position={[4, 8, 5]} intensity={2} /><StoreScene mode={sceneMode} orders={orders} inventoryRows={inventoryRows} onHotspot={() => {}} /><OrbitControls enablePan={false} minDistance={5} maxDistance={12} /><Sky sunPosition={[5, 4, 2]} turbidity={8} />
      </Canvas>
    </div>
    <div className="pointer-events-none absolute inset-0 z-10">
      <aside className="absolute left-4 top-20 bottom-14 flex w-[min(320px,calc(100vw-32px))] flex-col md:left-6 md:top-24"><div className="flex min-h-0 flex-1">{activeView === 'pos' && <OrdersPanel orders={orders} onUpdate={onUpdate} />}{activeView === 'inventory' && <InventoryPanel rows={inventoryRows} onRestock={onRestock} />}{activeView === 'finance' && <FinancePanel metrics={metrics} expenses={expenses} onExpense={onExpense} />}</div></aside>
      {activeView === 'pos' && <aside className="absolute right-4 top-20 bottom-14 hidden w-[min(360px,calc(100vw-32px))] overflow-y-auto md:right-6 md:top-24 md:block"><QuickPOSPanel channels={channels} products={products} onAdd={onAdd} /></aside>}
    </div>
    <header className="pointer-events-auto absolute left-0 right-0 top-0 z-30 flex h-14 items-center gap-4 border-b border-slate-800/80 bg-slate-950/85 px-4 backdrop-blur-xl md:px-6"><div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400 font-black text-slate-950 shadow-neon">S</span><span className="hidden text-xs font-bold tracking-[0.18em] text-slate-100 sm:block">STOCKPOS</span></div><nav className="ml-auto flex items-center gap-1">{tabs.map((tab) => <button key={tab.id} className={`rounded-lg px-3 py-2 text-[10px] font-medium transition ${activeView === tab.id ? 'bg-cyan-400/15 text-cyan-300 shadow-neon' : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'}`} onClick={() => setActiveView(tab.id)}>{tab.label}</button>)}</nav><span className="hidden text-[10px] font-mono text-emerald-400 lg:block">● LIVE</span></header>
    <footer className="pointer-events-auto absolute bottom-0 left-0 right-0 z-30 flex h-9 items-center justify-between border-t border-slate-800/80 bg-slate-950/90 px-4 text-[9px] font-mono text-slate-500 backdrop-blur-xl md:px-6"><span className="text-emerald-400">● SOCKET.IO CONNECTED</span><span className="hidden sm:block">{notice}</span><span className="text-cyan-300">DB · POSTGRESQL</span></footer>
  </div>;
}

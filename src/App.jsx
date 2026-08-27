import { useEffect, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import GlassLayout from './components/ui/GlassLayout';
import LoginScreen from './components/ui/LoginScreen';
import StaffWorkspace from './components/ui/StaffWorkspace';
import UserOrderStatus from './components/ui/UserOrderStatus';
import AnonymousOrderStatus from './components/ui/AnonymousOrderStatus';

const API_BASE = process.env.REACT_APP_API_URL || 'https://stockpos-production-d146.up.railway.app';
const SESSION_KEY = 'stockpos-session';
const roles = new Set(['admin', 'staff', 'user']);
const loadSession = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(SESSION_KEY) || 'null');
    return saved?.token && roles.has(saved.role) ? saved : null;
  } catch (error) { return null; }
};

const initialOrders = [];

const inventory = [
  { name: 'Fresh milk', code: 'MLK-001', stock: 18, unit: 'bottles', expiry: '18 Aug 2026', level: 'healthy' },
  { name: 'Brown sugar syrup', code: 'SYR-004', stock: 4, unit: 'bottles', expiry: '06 Sep 2026', level: 'low' },
  { name: 'Tapioca pearls', code: 'TOP-018', stock: 12, unit: 'bags', expiry: '24 Aug 2026', level: 'healthy' },
  { name: 'Matcha powder', code: 'MAT-007', stock: 2, unit: 'packs', expiry: '02 Oct 2026', level: 'low' },
  { name: 'Ice cubes', code: 'ICE-011', stock: 26, unit: 'bags', expiry: 'Today', level: 'healthy' },
];

const fallbackChannels = [{ id: 1, name: 'Front Store' }, { id: 2, name: 'GrabFood' }, { id: 3, name: 'LINE MAN' }];
const fallbackProducts = [{ id: 1, name: 'ชานมไข่มุก', price_retail: 55, icon: '🧋' }, { id: 2, name: 'กาแฟเย็น', price_retail: 60, icon: '☕' }, { id: 3, name: 'เค้กช็อกโกแลต', price_retail: 85, icon: '🍰' }];
const money = (amount) => `฿${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
const formatItems = (items) => Array.isArray(items) ? items.map((item) => `${item.name || `Product #${item.product_id}`} x ${item.quantity || item.qty}`).join(' · ') : String(items || 'Order items');
const normalizeOrder = (order) => {
  const rawItems = Array.isArray(order.items) ? order.items : (order.rawItems || []);
  return {
    ...order,
    rawItems,
    channel_name: order.channel_name || `Channel #${order.channel_id}`,
    net_revenue: Number(order.net_revenue || 0),
    items: formatItems(rawItems.length ? rawItems : order.items),
  };
};

function App() {
  const [session, setSession] = useState(loadSession);
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [activeView, setActiveView] = useState('pos');
  const [orders, setOrders] = useState(initialOrders);
  const [restocked, setRestocked] = useState([]);
  const [notice, setNotice] = useState('LIVE SYNC · 14:32:08');
  const [channels, setChannels] = useState(fallbackChannels);
  const [products, setProducts] = useState(fallbackProducts);
  const [inventoryRows, setInventoryRows] = useState(inventory);
  const [expenses, setExpenses] = useState(0);
  const [expenseRows, setExpenseRows] = useState([]);
  const [metrics, setMetrics] = useState({ gross: 0, net: 0, gp: 0, cogs: 0, profit: 0 });

  const startSession = (data) => {
    const account = { ...data.user, token: data.token, role: String(data.user.role).toLowerCase() };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setSession(account);
    setActiveView('pos');
  };
  const login = async (credentials) => {
    try {
      const response = await axios.post(`${API_BASE}/api/auth/login`, credentials);
      if (!response.data?.success) throw new Error(response.data?.error || 'เข้าสู่ระบบไม่สำเร็จ');
      startSession(response.data.data);
    } catch (error) { throw new Error(error.response?.data?.error || error.message || 'เข้าสู่ระบบไม่สำเร็จ'); }
  };
  const register = async (details) => {
    try {
      const response = await axios.post(`${API_BASE}/api/auth/register`, details);
      if (!response.data?.success) throw new Error(response.data?.error || 'สมัครใช้งานไม่สำเร็จ');
      startSession(response.data.data);
    } catch (error) { throw new Error(error.response?.data?.error || error.message || 'สมัครใช้งานไม่สำเร็จ'); }
  };
  const logout = () => { window.localStorage.removeItem(SESSION_KEY); delete axios.defaults.headers.common.Authorization; setSession(null); setAnonymousMode(true); setActiveView('pos'); };

  useEffect(() => {
    if (session?.token) axios.defaults.headers.common.Authorization = `Bearer ${session.token}`;
    else delete axios.defaults.headers.common.Authorization;
  }, [session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    axios.get(`${API_BASE}/api/auth/me`).then((response) => {
      if (!active || !response.data?.success) return;
      setSession((current) => current ? { ...current, ...response.data.data, role: String(response.data.data.role).toLowerCase() } : current);
    }).catch(() => {
      if (!active) return;
      window.localStorage.removeItem(SESSION_KEY);
      delete axios.defaults.headers.common.Authorization;
      setSession(null);
    });
    return () => { active = false; };
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let mounted = true;
    const fetchOrders = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/orders`);
        if (mounted && response.data?.success && Array.isArray(response.data.data)) setOrders(response.data.data.map(normalizeOrder));
      } catch (error) {
        console.warn('Live order sync unavailable; showing local queue.', error);
      }
    };
    const fetchDashboardData = async () => {
      const responses = await Promise.allSettled([
        axios.get(`${API_BASE}/api/channels`), axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/inventory`), axios.get(`${API_BASE}/api/financial-summary`), axios.get(`${API_BASE}/api/expenses`),
      ]);
      if (!mounted) return;
      const [channelResult, productResult, inventoryResult, summaryResult, expensesResult] = responses;
      const channelResponse = channelResult.status === 'fulfilled' ? channelResult.value : null;
      const productResponse = productResult.status === 'fulfilled' ? productResult.value : null;
      const inventoryResponse = inventoryResult.status === 'fulfilled' ? inventoryResult.value : null;
      const summaryResponse = summaryResult.status === 'fulfilled' ? summaryResult.value : null;
      const expensesResponse = expensesResult.status === 'fulfilled' ? expensesResult.value : null;
      if (channelResponse?.data?.success && Array.isArray(channelResponse.data.data)) setChannels(channelResponse.data.data);
      if (productResponse?.data?.success && Array.isArray(productResponse.data.data)) setProducts(productResponse.data.data.map((product) => ({ ...product, icon: product.icon || '▦' })));
      if (inventoryResponse?.data?.success && Array.isArray(inventoryResponse.data.data)) setInventoryRows(inventoryResponse.data.data);
      if (summaryResponse?.data?.success) {
        const data = summaryResponse.data.data || {};
        setMetrics({ gross: Number(data.total_gross || 0), net: Number(data.total_net_revenue || data.total_net || 0), gp: Number(data.total_gp || 0), cogs: Number(data.total_cogs || 0), profit: Number(data.total_net_profit || 0) });
        setExpenses(Number(data.total_expenses ?? data.expenses ?? 0));
      }
      if (expensesResponse?.data?.success && Array.isArray(expensesResponse.data.data)) setExpenseRows(expensesResponse.data.data);
    };
    fetchOrders();
    fetchDashboardData();
    const interval = window.setInterval(fetchOrders, 15000);
    const socket = io(API_BASE, { auth: { token: session.token }, transports: ['websocket', 'polling'] });
    socket.on('new_order_created', (event) => { if (event?.order) { setOrders((current) => [normalizeOrder({ ...event.order, channel_name: event.channel, items: event.order.items || [] }), ...current.filter((order) => order.id !== event.order.id)]); setNotice(`NEW ORDER RECEIVED · #${event.order.order_no}`); } });
    socket.on('order_status_updated', (event) => { setOrders((current) => current.map((order) => order.id === event.orderId ? { ...order, status: event.status } : order)); setNotice(`ORDER STATUS UPDATED · ${event.orderNo || event.orderId}`); });
    socket.on('order_cancelled', (event) => { setOrders((current) => current.map((order) => order.id === event.orderId ? { ...order, status: 'CANCELLED' } : order)); setNotice('ORDER CANCELLED · STOCK RESTORED'); });
    return () => { mounted = false; window.clearInterval(interval); socket.disconnect(); };
  }, [session]);

  const addOrder = async (payload = {}) => { const nextNumber = 1049 + orders.length; try { const response = await axios.post(`${API_BASE}/api/orders`, { order_no: `POS-${nextNumber}`, channel_id: payload.channel_id || channels[0]?.id, items: payload.items || [{ product_id: products[0]?.id, qty: 1, price: products[0]?.price_retail || 55 }], customer_nickname: payload.customer_nickname || undefined, customer_phone: payload.customer_phone || undefined }); if (response.data?.success) { setOrders((current) => [normalizeOrder({ ...response.data.data, channel_name: payload.channel_name, items: payload.items }), ...current]); setNotice('NEW ORDER RECEIVED · ACCOUNTANT PRINTING'); return true; } } catch (error) { window.alert(error.response?.data?.error || 'ไม่สามารถบันทึกออเดอร์ได้'); console.warn('Order API failed.', error); } return false; };
  const updateOrder = async (id, status) => { try { const response = status === 'CANCELLED' ? await axios.put(`${API_BASE}/api/orders/${id}/cancel`) : await axios.put(`${API_BASE}/api/orders/${id}/status`, { status }); if (response.data?.success) { setOrders((current) => current.map((order) => order.id === id ? { ...order, status } : order)); setNotice(status === 'COMPLETED' ? 'PAYMENT RECEIVED · SECURE CASH DROP' : 'ORDER CANCELLED'); return true; } } catch (error) { window.alert(error.response?.data?.error || 'ไม่สามารถอัปเดตออเดอร์ได้'); console.warn('Order update failed.', error); } return false; };
  const refreshFinancialSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/financial-summary`);
      if (response.data?.success) {
        const data = response.data.data || {};
        setMetrics({ gross: Number(data.total_gross || 0), net: Number(data.total_net_revenue || data.total_net || 0), gp: Number(data.total_gp || 0), cogs: Number(data.total_cogs || 0), profit: Number(data.total_net_profit || 0) });
        setExpenses(Number(data.total_expenses ?? data.expenses ?? 0));
      }
    } catch (error) { console.warn('Financial summary refresh unavailable.', error); }
  };
  const createSalesRecord = async (record) => {
    try {
      const response = await axios.post(`${API_BASE}/api/orders`, record);
      if (response.data?.success) {
        const channel = channels.find((item) => Number(item.id) === Number(record.channel_id));
        const created = normalizeOrder({ ...response.data.data, channel_name: channel?.name, items: record.items });
        if (record.status && record.status !== 'COOKING') await axios.put(`${API_BASE}/api/orders/${created.id}/status`, { status: record.status });
        setOrders((current) => [{ ...created, status: record.status || created.status }, ...current]);
        await refreshFinancialSummary();
        setNotice('SALES RECORD CREATED · FINANCIAL HUD UPDATED');
        return true;
      }
    } catch (error) { console.warn('Sales record create failed.', error); }
    return false;
  };
  const updateSalesRecord = async (id, record) => {
    try {
      const response = await axios.put(`${API_BASE}/api/orders/${id}`, record);
      if (response.data?.success) {
        const channel = channels.find((item) => Number(item.id) === Number(record.channel_id));
        setOrders((current) => current.map((order) => order.id === id ? normalizeOrder({ ...response.data.data, channel_name: channel?.name, items: record.items }) : order));
        await refreshFinancialSummary();
        setNotice('SALES RECORD UPDATED · FINANCIAL HUD UPDATED');
        return true;
      }
    } catch (error) { console.warn('Sales record update failed.', error); }
    return false;
  };
  const deleteSalesRecord = async (order) => {
    if (!order?.id || !window.confirm(`Delete sales record #${order.order_no}?`)) return;
    try {
      const response = await axios.delete(`${API_BASE}/api/orders/${order.id}`);
      if (response.data?.success) {
        setOrders((current) => current.filter((item) => item.id !== order.id));
        await refreshFinancialSummary();
        setNotice('SALES RECORD DELETED · STOCK RESTORED');
      }
    } catch (error) { console.warn('Sales record delete failed.', error); }
  };
  const handleRestock = async (item) => { if (!item) return; setNotice(`RESTOCK REQUEST SENT · WAREHOUSE MANAGER MOVING ${item.name.toUpperCase()}`); try { const response = await axios.post(`${API_BASE}/api/inventory/restock`, { ingredient_id: item.id, qty_to_add: item.level === 'low' ? 12 : 6 }); if (response.data?.success) { setRestocked((current) => [...current, item.code || item.id]); setInventoryRows((current) => current.map((row) => row.id === item.id ? response.data.data : row)); } } catch (error) { console.warn('Restock API unavailable; request was not recorded.', error); } };
  const createInventory = async (item) => { try { const response = await axios.post(`${API_BASE}/api/inventory`, item); if (response.data?.success) { setInventoryRows((current) => [...current, response.data.data]); setNotice('INVENTORY ITEM CREATED · WAREHOUSE UPDATED'); return true; } } catch (error) { console.warn('Inventory create API unavailable.', error); } return false; };
  const updateInventory = async (id, item) => { try { const response = await axios.put(`${API_BASE}/api/inventory/${id}`, item); if (response.data?.success) { setInventoryRows((current) => current.map((row) => row.id === id ? response.data.data : row)); setNotice('INVENTORY ITEM UPDATED · WAREHOUSE UPDATED'); return true; } } catch (error) { console.warn('Inventory update API unavailable.', error); } return false; };
  const deleteInventory = async (item) => { if (!item?.id || !window.confirm(`Delete ${item.name}?`)) return; try { const response = await axios.delete(`${API_BASE}/api/inventory/${item.id}`); if (response.data?.success) { setInventoryRows((current) => current.filter((row) => row.id !== item.id)); setNotice('INVENTORY ITEM DELETED · WAREHOUSE UPDATED'); } } catch (error) { console.warn('Inventory delete API unavailable.', error); } };
  const createMenu = async (menu) => { try { const response = await axios.post(`${API_BASE}/api/products`, { ...menu, price_retail: Number(menu.price_retail), price_wholesale: menu.price_wholesale ? Number(menu.price_wholesale) : null, recipe: menu.recipe.map((item) => ({ ingredient_id: Number(item.ingredient_id), quantity_used: Number(item.quantity_used) })) }); if (response.data?.success) { const refreshed = await axios.get(`${API_BASE}/api/products`); setProducts(refreshed.data.data.map((product) => ({ ...product, icon: product.icon || '▦' }))); setNotice('MENU CREATED · RECIPE SAVED'); return true; } } catch (error) { console.warn('Menu create API unavailable.', error); } return false; };
  const updateMenu = async (id, menu) => { try { const response = await axios.put(`${API_BASE}/api/products/${id}`, { ...menu, price_retail: Number(menu.price_retail), price_wholesale: menu.price_wholesale ? Number(menu.price_wholesale) : null, recipe: menu.recipe.map((item) => ({ ingredient_id: Number(item.ingredient_id), quantity_used: Number(item.quantity_used) })) }); if (response.data?.success) { const refreshed = await axios.get(`${API_BASE}/api/products`); setProducts(refreshed.data.data.map((product) => ({ ...product, icon: product.icon || '▦' }))); setNotice('MENU UPDATED · RECIPE SAVED'); return true; } } catch (error) { console.warn('Menu update API unavailable.', error); } return false; };
  const deleteMenu = async (menu) => { if (!menu?.id || !window.confirm(`Delete menu ${menu.name}?`)) return; try { const response = await axios.delete(`${API_BASE}/api/products/${menu.id}`); if (response.data?.success) { setProducts((current) => current.filter((product) => product.id !== menu.id)); setNotice('MENU DELETED · CATALOG UPDATED'); } } catch (error) { console.warn('Menu delete API unavailable.', error); } };
  const createExpense = async (amount, category, description, recordDate) => { try { const response = await axios.post(`${API_BASE}/api/expenses`, { amount: Number(amount), category, description, record_date: recordDate }); if (response.data?.success) { setExpenseRows((current) => [response.data.data, ...current]); setExpenses((current) => current + Number(amount)); setNotice('EXPENSE CREATED · LEDGER UPDATED'); return true; } } catch (error) { console.warn('Expense create API unavailable.', error); } return false; };
  const updateExpense = async (id, amount, category, description, recordDate) => { try { const previous = expenseRows.find((row) => row.id === id); const response = await axios.put(`${API_BASE}/api/expenses/${id}`, { amount: Number(amount), category, description, record_date: recordDate }); if (response.data?.success) { setExpenseRows((current) => current.map((row) => row.id === id ? response.data.data : row)); setExpenses((current) => current + Number(amount) - Number(previous?.amount || 0)); setNotice('EXPENSE UPDATED · LEDGER UPDATED'); return true; } } catch (error) { console.warn('Expense update API unavailable.', error); } return false; };
  const deleteExpense = async (item) => { if (!item?.id || !window.confirm(`Delete expense ${money(item.amount)}?`)) return; try { const response = await axios.delete(`${API_BASE}/api/expenses/${item.id}`); if (response.data?.success) { setExpenseRows((current) => current.filter((row) => row.id !== item.id)); setExpenses((current) => current - Number(item.amount)); setNotice('EXPENSE DELETED · LEDGER UPDATED'); } } catch (error) { console.warn('Expense delete API unavailable.', error); } };
  const recordExpense = async (amount, category) => { try { const response = await axios.post(`${API_BASE}/api/expenses`, { amount, category }); if (response.data?.success) { setExpenses((current) => current + amount); setNotice(`EXPENSE RECORDED · ${money(amount)} MOVED TO SAFE`); } } catch (error) { console.warn('Expense API unavailable; expense was not recorded.', error); } };

  if (!session && anonymousMode) return <AnonymousOrderStatus apiBase={API_BASE} onBack={() => setAnonymousMode(false)} />;
  if (!session) return <LoginScreen onLogin={login} onRegister={register} onAnonymous={() => setAnonymousMode(true)} onHome={() => setAnonymousMode(true)} />;
  if (session.role === 'user') return <UserOrderStatus user={session} orders={orders} onLogout={logout} />;
  if (session.role === 'staff') return <StaffWorkspace user={session} orders={orders} channels={channels} products={products} onAdd={addOrder} onUpdate={updateOrder} onLogout={logout} />;
  return <><div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl border border-sky-100 bg-white/95 p-2 shadow-sm backdrop-blur"><span className="hidden px-1 text-xs font-semibold text-slate-600 sm:inline">{session.name}</span><button className="rounded-lg px-2 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50" onClick={logout}>ออกจากระบบ</button></div><GlassLayout activeView={activeView} setActiveView={setActiveView} orders={orders} channels={channels} products={products} inventoryRows={inventoryRows} metrics={metrics} expenses={expenses} expenseRows={expenseRows} notice={notice} onAdd={addOrder} onUpdate={updateOrder} onRestock={handleRestock} onCreateInventory={createInventory} onUpdateInventory={updateInventory} onDeleteInventory={deleteInventory} onCreateMenu={createMenu} onUpdateMenu={updateMenu} onDeleteMenu={deleteMenu} onExpense={recordExpense} onCreateExpense={createExpense} onUpdateExpense={updateExpense} onDeleteExpense={deleteExpense} onCreateSales={createSalesRecord} onUpdateSales={updateSalesRecord} onDeleteSales={deleteSalesRecord} /></>;
}

export default App;

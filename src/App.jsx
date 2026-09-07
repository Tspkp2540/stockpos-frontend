import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import GlassLayout from "./components/ui/GlassLayout";
import LoginScreen from "./components/ui/LoginScreen";
import StaffWorkspace from "./components/ui/StaffWorkspace";
import UserOrderStatus from "./components/ui/UserOrderStatus";
import AnonymousOrderStatus from "./components/ui/AnonymousOrderStatus";
import { ActionDialogProvider, useActionDialog } from "./components/ui/ActionDialog";

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://stockpos-production-d146.up.railway.app";
const SESSION_KEY = "stockpos-session";
const PENDING_ORDER_SUBMISSIONS_KEY = "stockpos-pending-order-submissions";
const roles = new Set(["admin", "staff", "user"]);
const loadSession = () => {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(SESSION_KEY) || "null",
    );
    return saved?.token && roles.has(saved.role) ? saved : null;
  } catch (error) {
    return null;
  }
};

const initialOrders = [];

const inventory = [
  {
    name: "Fresh milk",
    code: "MLK-001",
    stock: 18,
    unit: "bottles",
    expiry: "18 Aug 2026",
    level: "healthy",
  },
  {
    name: "Brown sugar syrup",
    code: "SYR-004",
    stock: 4,
    unit: "bottles",
    expiry: "06 Sep 2026",
    level: "low",
  },
  {
    name: "Tapioca pearls",
    code: "TOP-018",
    stock: 12,
    unit: "bags",
    expiry: "24 Aug 2026",
    level: "healthy",
  },
  {
    name: "Matcha powder",
    code: "MAT-007",
    stock: 2,
    unit: "packs",
    expiry: "02 Oct 2026",
    level: "low",
  },
  {
    name: "Ice cubes",
    code: "ICE-011",
    stock: 26,
    unit: "bags",
    expiry: "Today",
    level: "healthy",
  },
];

const fallbackChannels = [
  { id: 1, name: "Front Store" },
  { id: 2, name: "GrabFood" },
  { id: 3, name: "LINE MAN" },
];
const fallbackProducts = [
  { id: 1, name: "ชานมไข่มุก", price_retail: 55, icon: "🧋" },
  { id: 2, name: "กาแฟเย็น", price_retail: 60, icon: "☕" },
  { id: 3, name: "เค้กช็อกโกแลต", price_retail: 85, icon: "🍰" },
];
const money = (amount) =>
  `฿${amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
const formatItems = (items) =>
  Array.isArray(items)
    ? items
      .map(
          (item) => {
            const modifiers = Array.isArray(item.modifiers) && item.modifiers.length
              ? ` (${item.modifiers.map((modifier) => modifier.name).join(", ")})`
              : "";
            return `${item.name || `Product #${item.product_id}`} x ${item.quantity || item.qty}${modifiers}`;
          },
        )
        .join(" · ")
    : String(items || "Order items");
const normalizeOrder = (order) => {
  const rawItems = Array.isArray(order.items)
    ? order.items
    : order.rawItems || [];
  return {
    ...order,
    rawItems,
    channel_name: order.channel_name || `Channel #${order.channel_id}`,
    net_revenue: Number(order.net_revenue || 0),
    items: formatItems(rawItems.length ? rawItems : order.items),
  };
};
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

const newClientRequestId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `pos-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const readPendingOrderSubmissions = () => {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(PENDING_ORDER_SUBMISSIONS_KEY) || "{}",
    );
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
    const twoDaysAgo = Date.now() - 2 * 24 * 60 * 60 * 1000;
    return Object.fromEntries(
      Object.entries(saved).filter(([, value]) =>
        value?.createdAt && new Date(value.createdAt).getTime() >= twoDaysAgo,
      ),
    );
  } catch (error) {
    return {};
  }
};

const writePendingOrderSubmissions = (submissions) => {
  try {
    window.localStorage.setItem(
      PENDING_ORDER_SUBMISSIONS_KEY,
      JSON.stringify(submissions),
    );
  } catch (error) {
    console.warn("Unable to persist pending order submission.", error);
  }
};

const orderSubmissionFingerprint = (payload) =>
  JSON.stringify({
    channel_id: Number(payload.channel_id),
    record_date: payload.record_date || todayInBangkok(),
    customer_name: String(payload.customer_name || "").trim(),
    customer_nickname: String(payload.customer_nickname || "").trim(),
    customer_phone: String(payload.customer_phone || "").replace(/\D/g, ""),
    manual_discount_amount: Number(payload.manual_discount_amount) || 0,
    coupon_code: String(payload.coupon_code || "").trim().toUpperCase(),
    loyalty_points_redeemed: Number(payload.loyalty_points_redeemed) || 0,
    payment_method: String(payload.payment_method || "OTHER").toUpperCase(),
    amount_received:
      payload.amount_received === undefined || payload.amount_received === ""
        ? null
        : Number(payload.amount_received),
    items: (payload.items || []).map((item) => ({
      product_id: Number(item.product_id),
      qty: Number(item.qty),
      price: Number(item.price),
      modifiers: (item.modifiers || [])
        .map((modifier) => Number(modifier?.option_id ?? modifier))
        .sort((left, right) => left - right),
    })),
  });

function ConnectionBanner({ systemStatus, realtimeConnected }) {
  const state = systemStatus?.state || "checking";
  const details = state === "offline"
    ? { tone: "rose", title: "ไม่มีการเชื่อมต่ออินเทอร์เน็ต", message: "ระบบจะไม่บันทึกรายการขายใหม่จนกว่าอินเทอร์เน็ตกลับมา เพื่อป้องกันออเดอร์ซ้ำ" }
    : state === "database_offline"
      ? { tone: "rose", title: "ฐานข้อมูลกำลังมีปัญหา", message: "หยุดยืนยันรายการใหม่ชั่วคราว และรอให้ระบบกลับมาเชื่อมต่อ" }
      : state === "api_offline"
        ? { tone: "amber", title: "ติดต่อระบบไม่ได้", message: "กำลังตรวจสอบและเชื่อมต่อใหม่อัตโนมัติ ข้อมูลที่เปิดอยู่ยังแสดงได้" }
        : state === "checking"
          ? { tone: "sky", title: "กำลังตรวจสอบการเชื่อมต่อ", message: "รอผลตรวจ API และฐานข้อมูลก่อนทำรายการสำคัญ" }
          : realtimeConnected === false
            ? { tone: "amber", title: "กำลังเชื่อมต่ออัปเดตทันทีใหม่", message: "การขายยังใช้ได้เมื่อ API พร้อม ข้อมูลออเดอร์จะซิงก์เป็นระยะจนกว่าการเชื่อมต่อทันทีจะกลับมา" }
            : null;
  if (!details) return null;
  const styles = details.tone === "rose"
    ? "border-rose-200 bg-rose-50 text-rose-950"
    : details.tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-sky-200 bg-sky-50 text-sky-950";
  return (
    <div className={`fixed inset-x-3 top-3 z-[120] mx-auto max-w-3xl rounded-2xl border px-4 py-3 shadow-xl shadow-slate-900/10 sm:inset-x-6 ${styles}`} role="status">
      <p className="text-sm font-bold">{details.title}</p>
      <p className="mt-0.5 text-xs leading-5 opacity-80">{details.message}</p>
    </div>
  );
}

const apiErrorDetails = (error, fallback = "ไม่สามารถทำรายการกับระบบได้") => {
  const status = Number(error?.response?.status || 0);
  const apiMessage = error?.response?.data?.error || error?.response?.data?.message;
  const statusLabels = {
    400: "ข้อมูลไม่ถูกต้อง",
    401: "ต้องเข้าสู่ระบบใหม่",
    403: "ไม่มีสิทธิ์ทำรายการ",
    404: "ไม่พบข้อมูลหรือบริการ",
    409: "ข้อมูลขัดแย้งกับสถานะปัจจุบัน",
    422: "ข้อมูลไม่ผ่านการตรวจสอบ",
    429: "ส่งคำขอมากเกินไป",
    500: "ระบบภายในขัดข้อง",
    502: "ระบบต้นทางตอบกลับผิดพลาด",
    503: "ระบบหรือฐานข้อมูลไม่พร้อมใช้งาน",
    504: "ระบบใช้เวลาตอบกลับนานเกินไป",
  };
  if (status) {
    return {
      code: `API_${status}`,
      title: statusLabels[status] || `API ตอบกลับผิดพลาด (${status})`,
      message: apiMessage || fallback,
    };
  }
  if (error?.code === "ECONNABORTED") {
    return { code: "API_TIMEOUT", title: "ระบบตอบกลับช้าเกินไป", message: "หมดเวลารอการตอบกลับ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่" };
  }
  return { code: "API_NETWORK", title: "เชื่อมต่อระบบไม่ได้", message: apiMessage || "ตรวจสอบอินเทอร์เน็ตหรือสถานะระบบ แล้วลองใหม่อีกครั้ง" };
};

function AppContent() {
  const { confirmAction, showMessage } = useActionDialog();
  const [session, setSession] = useState(loadSession);
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [activeView, setActiveView] = useState("operations");
  const [orders, setOrders] = useState(initialOrders);
  const [restocked, setRestocked] = useState([]);
  const [notice, setNotice] = useState("LIVE SYNC · 14:32:08");
  const [loyalty, setLoyalty] = useState({ account: null, rules: null });
  const [channels, setChannels] = useState(fallbackChannels);
  const [products, setProducts] = useState(fallbackProducts);
  const [inventoryRows, setInventoryRows] = useState(inventory);
  const [suppliers, setSuppliers] = useState([]);
  const [stockReceipts, setStockReceipts] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [cashShifts, setCashShifts] = useState([]);
  const [salesBreakdown, setSalesBreakdown] = useState({ channels: [], payments: [] });
  const [inventoryLots, setInventoryLots] = useState([]);
  const [expenses, setExpenses] = useState(0);
  const [expenseRows, setExpenseRows] = useState([]);
  const [currentShift, setCurrentShift] = useState(null);
  const [systemStatus, setSystemStatus] = useState(() => ({ state: typeof navigator !== "undefined" && !navigator.onLine ? "offline" : "checking", checkedAt: null }));
  const [realtimeConnected, setRealtimeConnected] = useState(null);
  const [metrics, setMetrics] = useState({
    gross: 0,
    net: 0,
    gp: 0,
    cogs: 0,
    profit: 0,
  });
  const showError = (error, fallback) =>
    {
      if (error?.stockposErrorNotified) return;
      const details = apiErrorDetails(error, fallback);
      error.stockposErrorNotified = true;
      showMessage({
        tone: "danger",
        title: `${details.title} · ${details.code}`,
        message: details.message,
      });
    };

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const method = String(error?.config?.method || "get").toLowerCase();
        const url = String(error?.config?.url || "");
        const isOrderCreate = method === "post" && /\/api\/orders$/.test(url);
        if (["post", "put", "patch", "delete"].includes(method) && !isOrderCreate && !error.stockposErrorNotified) {
          const details = apiErrorDetails(error);
          error.stockposErrorNotified = true;
          showMessage({
            tone: "danger",
            title: `${details.title} · ${details.code}`,
            message: details.message,
          });
        }
        return Promise.reject(error);
      },
    );
    return () => axios.interceptors.response.eject(interceptorId);
  }, [showMessage]);

  const checkSystemHealth = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setSystemStatus({ state: "offline", checkedAt: new Date().toISOString() });
      return false;
    }
    try {
      const response = await axios.get(`${API_BASE}/api/health`, { timeout: 6000 });
      const databaseAvailable = response.data?.success && response.data?.data?.database === "ok";
      setSystemStatus({ state: databaseAvailable ? "online" : "database_offline", checkedAt: new Date().toISOString() });
      return databaseAvailable;
    } catch (error) {
      const state = error.response?.status === 503 ? "database_offline" : "api_offline";
      setSystemStatus({ state, checkedAt: new Date().toISOString() });
      return false;
    }
  }, []);

  useEffect(() => {
    const markOffline = () => setSystemStatus({ state: "offline", checkedAt: new Date().toISOString() });
    const reconnect = () => {
      setSystemStatus({ state: "checking", checkedAt: new Date().toISOString() });
      checkSystemHealth();
    };
    window.addEventListener("offline", markOffline);
    window.addEventListener("online", reconnect);
    checkSystemHealth();
    const timer = window.setInterval(checkSystemHealth, 30000);
    return () => {
      window.removeEventListener("offline", markOffline);
      window.removeEventListener("online", reconnect);
      window.clearInterval(timer);
    };
  }, [checkSystemHealth]);

  const refreshProducts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/products`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setProducts(response.data.data.map((product) => ({
          ...product,
          icon: product.icon || "▦",
        })));
        return true;
      }
    } catch (error) {
      console.warn("Product availability refresh unavailable.", error);
    }
    return false;
  };
  const refreshPurchaseOrders = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/purchase-orders?limit=30`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setPurchaseOrders(response.data.data);
        return true;
      }
    } catch (error) {
      console.warn("Purchase order refresh unavailable.", error);
    }
    return false;
  };
  const refreshCoupons = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/coupons`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setCoupons(response.data.data);
        return true;
      }
    } catch (error) {
      console.warn("Coupon refresh unavailable.", error);
    }
    return false;
  };
  const refreshCashShifts = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/shifts`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setCashShifts(response.data.data);
        return true;
      }
    } catch (error) {
      console.warn("Cash shift history refresh unavailable.", error);
    }
    return false;
  };
  const refreshSalesBreakdown = useCallback(async (recordDate = todayInBangkok()) => {
    try {
      const response = await axios.get(`${API_BASE}/api/sales-breakdown`, {
        params: { date: recordDate },
      });
      if (response.data?.success) {
        const data = response.data.data || {};
        setSalesBreakdown({
          channels: Array.isArray(data.channels) ? data.channels : [],
          payments: Array.isArray(data.payments) ? data.payments : [],
        });
        return true;
      }
    } catch (error) {
      console.warn("Sales breakdown refresh unavailable.", error);
    }
    return false;
  }, []);
  const refreshSalesReport = useCallback(async (from, to) => {
    try {
      const response = await axios.get(`${API_BASE}/api/reports/summary`, {
        params: { from, to },
      });
      return response.data?.success ? response.data.data : null;
    } catch (error) {
      console.warn("Sales report refresh unavailable.", error);
      return null;
    }
  }, []);
  const loadGoLiveReadiness = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/go-live/readiness`);
      return response.data?.success ? response.data.data : null;
    } catch (error) {
      console.warn("Go-live readiness refresh unavailable.", error);
      return null;
    }
  }, []);
  const loadGoLiveChecks = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/go-live-checks`);
      return response.data?.success && Array.isArray(response.data.data) ? response.data.data : [];
    } catch (error) {
      console.warn("Go-live checks refresh unavailable.", error);
      return [];
    }
  }, []);
  const saveGoLiveCheck = async (key, status, note = "") => {
    try {
      const response = await axios.put(`${API_BASE}/api/admin/go-live-checks/${key}`, { status, note });
      return response.data?.success ? response.data.data : null;
    } catch (error) {
      showError(error, "ไม่สามารถบันทึกผลการตรวจสอบได้");
      return null;
    }
  };
  const loadAuditLogs = useCallback(async (limit = 20) => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/audit-logs`, { params: { limit } });
      return response.data?.success && Array.isArray(response.data.data) ? response.data.data : [];
    } catch (error) {
      console.warn("Audit log refresh unavailable.", error);
      return [];
    }
  }, []);
  const downloadBusinessBackup = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/backups/export`, { responseType: "blob" });
      const disposition = response.headers?.["content-disposition"] || "";
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `stockpos-business-backup-${todayInBangkok()}.json`;
      const url = window.URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      showError(error, "ไม่สามารถดาวน์โหลดข้อมูลสำรองได้");
      return false;
    }
  };
  const fetchDailyClosing = useCallback(async (businessDate) => {
    try {
      const response = await axios.get(`${API_BASE}/api/daily-closings`, {
        params: { date: businessDate },
      });
      return response.data?.success ? response.data.data : null;
    } catch (error) {
      console.warn("Daily closing lookup unavailable.", error);
      return null;
    }
  }, []);
  const closeBusinessDay = async (businessDate) => {
    try {
      const response = await axios.post(`${API_BASE}/api/daily-closings`, {
        business_date: businessDate,
      });
      if (response.data?.success) {
        setNotice(`DAILY CLOSING SAVED · ${businessDate}`);
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถปิดยอดประจำวันได้");
      console.warn("Daily closing failed.", error);
    }
    return null;
  };
  const createChannel = async (channel) => {
    try {
      const response = await axios.post(`${API_BASE}/api/channels`, channel);
      if (response.data?.success) {
        setChannels((current) => [...current, response.data.data]);
        setNotice("SALES CHANNEL CREATED · READY FOR POS");
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเพิ่มช่องทางขายได้");
      console.warn("Sales channel create failed.", error);
    }
    return null;
  };
  const updateChannel = async (id, channel) => {
    try {
      const response = await axios.put(`${API_BASE}/api/channels/${id}`, channel);
      if (response.data?.success) {
        setChannels((current) => current.map((item) =>
          String(item.id) === String(id) ? response.data.data : item,
        ));
        setNotice("SALES CHANNEL UPDATED · POS OPTIONS SYNCED");
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขช่องทางขายได้");
      console.warn("Sales channel update failed.", error);
    }
    return null;
  };

  const startSession = (data) => {
    const account = {
      ...data.user,
      token: data.token,
      role: String(data.user.role).toLowerCase(),
    };
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(account));
    setSession(account);
    setActiveView(account.role === "admin" ? "operations" : "pos");
  };
  const login = async (credentials) => {
    try {
      const response = await axios.post(
        `${API_BASE}/api/auth/login`,
        credentials,
      );
      if (!response.data?.success)
        throw new Error(response.data?.error || "เข้าสู่ระบบไม่สำเร็จ");
      startSession(response.data.data);
    } catch (error) {
      throw new Error(
        error.response?.data?.error || error.message || "เข้าสู่ระบบไม่สำเร็จ",
      );
    }
  };
  const register = async (details) => {
    try {
      const response = await axios.post(
        `${API_BASE}/api/auth/register`,
        details,
      );
      if (!response.data?.success)
        throw new Error(response.data?.error || "สมัครใช้งานไม่สำเร็จ");
      startSession(response.data.data);
    } catch (error) {
      throw new Error(
        error.response?.data?.error || error.message || "สมัครใช้งานไม่สำเร็จ",
      );
    }
  };
  const logout = () => {
    window.localStorage.removeItem(SESSION_KEY);
    delete axios.defaults.headers.common.Authorization;
    setSession(null);
    setAnonymousMode(true);
    setActiveView("operations");
    setCurrentShift(null);
    setCashShifts([]);
    setSalesBreakdown({ channels: [], payments: [] });
  };

  const refreshCurrentShift = async () => {
    if (!session?.token || !["admin", "staff"].includes(session.role)) {
      setCurrentShift(null);
      return null;
    }
    try {
      const response = await axios.get(`${API_BASE}/api/shifts/current`);
      const shift = response.data?.success ? response.data.data : null;
      setCurrentShift(shift);
      return shift;
    } catch (error) {
      console.warn("Cash shift sync unavailable.", error);
      return null;
    }
  };
  const lookupLoyalty = async (phone) => {
    const response = await axios.post(`${API_BASE}/api/loyalty/lookup`, { phone });
    if (response.data?.success) return response.data.data;
    throw new Error(response.data?.error || "ไม่สามารถค้นหาข้อมูลสมาชิกได้");
  };
  const refreshMyLoyalty = useCallback(async () => {
    if (session?.role !== "user") {
      setLoyalty({ account: null, rules: null });
      return null;
    }
    try {
      const response = await axios.get(`${API_BASE}/api/loyalty/me`);
      if (response.data?.success) {
        setLoyalty(response.data.data || { account: null, rules: null });
        return response.data.data;
      }
    } catch (error) {
      console.warn("Loyalty balance refresh unavailable.", error);
    }
    return null;
  }, [session?.role]);

  useEffect(() => {
    if (session?.token)
      axios.defaults.headers.common.Authorization = `Bearer ${session.token}`;
    else delete axios.defaults.headers.common.Authorization;
  }, [session]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    axios
      .get(`${API_BASE}/api/auth/me`)
      .then((response) => {
        if (!active || !response.data?.success) return;
        setSession((current) =>
          current
            ? {
                ...current,
                ...response.data.data,
                role: String(response.data.data.role).toLowerCase(),
              }
            : current,
        );
      })
      .catch((error) => {
        if (!active) return;
        if (Number(error?.response?.status) === 401) {
          window.localStorage.removeItem(SESSION_KEY);
          delete axios.defaults.headers.common.Authorization;
          setSession(null);
          return;
        }
        // A temporary API/network failure must not sign staff out in the middle of a sale.
        console.warn("Session verification unavailable; keeping the current session.", error);
        if (!error?.response) {
          setSystemStatus({
            state: "api_offline",
            checkedAt: new Date().toISOString(),
          });
        }
      });
    return () => {
      active = false;
    };
  }, [session?.token]);

  useEffect(() => {
    refreshCurrentShift();
  }, [session?.token]);

  useEffect(() => {
    if (session?.role !== "user") {
      setLoyalty({ account: null, rules: null });
      return undefined;
    }
    refreshMyLoyalty();
    const interval = window.setInterval(refreshMyLoyalty, 15000);
    return () => window.clearInterval(interval);
  }, [session?.role, session?.token, refreshMyLoyalty]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let mounted = true;
    const fetchOrders = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/orders`);
        if (
          mounted &&
          response.data?.success &&
          Array.isArray(response.data.data)
        )
          setOrders(response.data.data.map(normalizeOrder));
      } catch (error) {
        console.warn(
          "Live order sync unavailable; showing local queue.",
          error,
        );
      }
    };
    const fetchDashboardData = async () => {
      const responses = await Promise.allSettled([
        axios.get(`${API_BASE}/api/channels`),
        axios.get(`${API_BASE}/api/products`),
        axios.get(`${API_BASE}/api/inventory`),
        axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`),
        axios.get(`${API_BASE}/api/inventory/suppliers`),
        axios.get(`${API_BASE}/api/inventory/receipts?limit=20`),
        axios.get(`${API_BASE}/api/purchase-orders?limit=30`),
        axios.get(`${API_BASE}/api/financial-summary`),
        axios.get(`${API_BASE}/api/expenses`),
      ]);
      if (!mounted) return;
      const [
        channelResult,
        productResult,
        inventoryResult,
        inventoryLotsResult,
        suppliersResult,
        stockReceiptsResult,
        purchaseOrdersResult,
        summaryResult,
        expensesResult,
      ] = responses;
      const channelResponse =
        channelResult.status === "fulfilled" ? channelResult.value : null;
      const productResponse =
        productResult.status === "fulfilled" ? productResult.value : null;
      const inventoryResponse =
        inventoryResult.status === "fulfilled" ? inventoryResult.value : null;
      const inventoryLotsResponse =
        inventoryLotsResult.status === "fulfilled" ? inventoryLotsResult.value : null;
      const suppliersResponse =
        suppliersResult.status === "fulfilled" ? suppliersResult.value : null;
      const stockReceiptsResponse =
        stockReceiptsResult.status === "fulfilled" ? stockReceiptsResult.value : null;
      const purchaseOrdersResponse =
        purchaseOrdersResult.status === "fulfilled" ? purchaseOrdersResult.value : null;
      const summaryResponse =
        summaryResult.status === "fulfilled" ? summaryResult.value : null;
      const expensesResponse =
        expensesResult.status === "fulfilled" ? expensesResult.value : null;
      if (
        channelResponse?.data?.success &&
        Array.isArray(channelResponse.data.data)
      )
        setChannels(channelResponse.data.data);
      if (
        productResponse?.data?.success &&
        Array.isArray(productResponse.data.data)
      )
        setProducts(
          productResponse.data.data.map((product) => ({
            ...product,
            icon: product.icon || "▦",
          })),
        );
      if (
        inventoryResponse?.data?.success &&
        Array.isArray(inventoryResponse.data.data)
      )
        setInventoryRows(inventoryResponse.data.data);
      if (
        inventoryLotsResponse?.data?.success &&
        Array.isArray(inventoryLotsResponse.data.data)
      )
        setInventoryLots(inventoryLotsResponse.data.data);
      if (
        suppliersResponse?.data?.success &&
        Array.isArray(suppliersResponse.data.data)
      )
        setSuppliers(suppliersResponse.data.data);
      if (
        stockReceiptsResponse?.data?.success &&
        Array.isArray(stockReceiptsResponse.data.data)
      )
        setStockReceipts(stockReceiptsResponse.data.data);
      if (
        purchaseOrdersResponse?.data?.success &&
        Array.isArray(purchaseOrdersResponse.data.data)
      )
        setPurchaseOrders(purchaseOrdersResponse.data.data);
      if (summaryResponse?.data?.success) {
        const data = summaryResponse.data.data || {};
        setMetrics({
          gross: Number(data.total_gross || 0),
          net: Number(data.total_net_revenue || data.total_net || 0),
          gp: Number(data.total_gp || 0),
          cogs: Number(data.total_cogs || 0),
          profit: Number(data.total_net_profit || 0),
        });
        setExpenses(Number(data.total_expenses ?? data.expenses ?? 0));
      }
      if (
        expensesResponse?.data?.success &&
        Array.isArray(expensesResponse.data.data)
      )
        setExpenseRows(expensesResponse.data.data);
      if (session.role === "admin") {
        await Promise.all([refreshCoupons(), refreshCashShifts(), refreshSalesBreakdown()]);
      }
    };
    fetchOrders();
    fetchDashboardData();
    const interval = window.setInterval(fetchOrders, 15000);
    const socket = io(API_BASE, {
      auth: { token: session.token },
      transports: ["websocket", "polling"],
    });
    socket.on("connect", () => {
      setRealtimeConnected(true);
      setNotice("LIVE SYNC RESTORED · DATA REFRESHING");
      fetchOrders();
      if (session.role === "admin") fetchDashboardData();
    });
    socket.on("disconnect", () => setRealtimeConnected(false));
    socket.on("connect_error", () => setRealtimeConnected(false));
    socket.on("new_order_created", (event) => {
      if (event?.order) {
        setOrders((current) => [
          normalizeOrder({
            ...event.order,
            channel_name: event.channel,
            items: event.order.items || [],
          }),
          ...current.filter((order) => order.id !== event.order.id),
        ]);
        setNotice(`NEW ORDER RECEIVED · #${event.order.order_no}`);
      }
    });
    socket.on("order_status_updated", (event) => {
      setOrders((current) =>
        current.map((order) =>
          order.id === event.orderId
            ? { ...order, status: event.status }
            : order,
        ),
      );
      setNotice(`ORDER STATUS UPDATED · ${event.orderNo || event.orderId}`);
    });
    socket.on("order_cancelled", (event) => {
      setOrders((current) =>
        current.map((order) =>
          order.id === event.orderId
            ? { ...order, status: "CANCELLED" }
            : order,
        ),
      );
      setNotice("ORDER CANCELLED · STOCK RESTORED");
    });
    return () => {
      mounted = false;
      window.clearInterval(interval);
      setRealtimeConnected(null);
      socket.disconnect();
    };
  }, [session]);

  const addOrder = async (payload = {}) => {
    if (systemStatus.state !== "online") {
      showMessage({
        tone: "danger",
        title: "ยังบันทึกออเดอร์ไม่ได้",
        message: "ระบบยังไม่พร้อมเชื่อมต่อ จึงหยุดการส่งรายการเพื่อป้องกันออเดอร์ซ้ำ กรุณารอให้แถบแจ้งเตือนหายแล้วลองใหม่",
      });
      return false;
    }
    const recordDate = payload.record_date || todayInBangkok();
    const fingerprint = orderSubmissionFingerprint({ ...payload, record_date: recordDate });
    const pendingSubmissions = readPendingOrderSubmissions();
    const previousSubmission = pendingSubmissions[fingerprint];
    const submission = previousSubmission || {
      clientRequestId: newClientRequestId(),
      orderNo: `POS-${1049 + orders.length}`,
      createdAt: new Date().toISOString(),
    };
    if (!previousSubmission) {
      writePendingOrderSubmissions({
        ...pendingSubmissions,
        [fingerprint]: submission,
      });
    }
    const clearPendingSubmission = () => {
      const current = readPendingOrderSubmissions();
      delete current[fingerprint];
      writePendingOrderSubmissions(current);
    };
    try {
      const response = await axios.post(`${API_BASE}/api/orders`, {
        order_no: submission.orderNo,
        channel_id: payload.channel_id || channels[0]?.id,
        record_date: recordDate,
        client_request_id: submission.clientRequestId,
        items: payload.items || [
          {
            product_id: products[0]?.id,
            qty: 1,
            price: products[0]?.price_retail || 55,
          },
        ],
        customer_name: payload.customer_name || undefined,
        customer_nickname: payload.customer_nickname || undefined,
        customer_phone: payload.customer_phone || undefined,
        manual_discount_amount: Number(payload.manual_discount_amount) || 0,
        coupon_code: payload.coupon_code || undefined,
        payment_method: payload.payment_method || "OTHER",
        amount_received:
          payload.amount_received === undefined || payload.amount_received === ""
            ? undefined
            : Number(payload.amount_received),
      }, {
        headers: { "Idempotency-Key": submission.clientRequestId },
      });
      if (response.data?.success) {
        setOrders((current) => [
          normalizeOrder({
            ...response.data.data,
            channel_name: payload.channel_name,
            items: payload.items,
          }),
          ...current.filter((order) => order.id !== response.data.data?.id),
        ]);
        clearPendingSubmission();
        setNotice("NEW ORDER RECEIVED · ACCOUNTANT PRINTING");
        if (payload.payment_method === "CASH") refreshCurrentShift();
        if (session?.role === "admin") await refreshSalesBreakdown(payload.record_date || todayInBangkok());
        await refreshProducts();
        return true;
      }
    } catch (error) {
      const isAmbiguousResult = !error.response || Number(error.response.status) >= 500;
      if (isAmbiguousResult) {
        setSystemStatus({ state: "api_offline", checkedAt: new Date().toISOString() });
        error.stockposErrorNotified = true;
        showMessage({
          tone: "danger",
          title: "ยังไม่ทราบผลการบันทึกออเดอร์ · API_NETWORK",
          message: "ระบบจะใช้รหัสยืนยันเดิมหากกดส่งซ้ำ จึงไม่ตัดสต็อกหรือใช้คูปองซ้ำ กรุณารอการเชื่อมต่อกลับมาแล้วกดยืนยันรายการเดิมอีกครั้ง",
        });
      } else {
        clearPendingSubmission();
        showError(error, "ไม่สามารถบันทึกออเดอร์ได้");
      }
      console.warn("Order API failed.", error);
    }
    return false;
  };
  const openCashShift = async (openingCash, openingNote = "") => {
    try {
      const response = await axios.post(`${API_BASE}/api/shifts/open`, {
        opening_cash: Number(openingCash) || 0,
        opening_note: openingNote,
      });
      if (response.data?.success) {
        setCurrentShift(response.data.data);
        if (session?.role === "admin") await refreshCashShifts();
        setNotice("CASH SHIFT OPENED · READY FOR CASH SALES");
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเปิดกะเงินสดได้");
      console.warn("Cash shift open failed.", error);
    }
    return false;
  };
  const closeCashShift = async (shiftId, closingCash, closingNote = "") => {
    try {
      const response = await axios.post(`${API_BASE}/api/shifts/${shiftId}/close`, {
        closing_cash: Number(closingCash),
        closing_note: closingNote,
      });
      if (response.data?.success) {
        setCurrentShift(null);
        if (session?.role === "admin") await refreshCashShifts();
        setNotice("CASH SHIFT CLOSED · DIFFERENCE CALCULATED");
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถปิดกะเงินสดได้");
      console.warn("Cash shift close failed.", error);
    }
    return null;
  };
  const validateCoupon = async ({ code, amount }) => {
    const response = await axios.post(`${API_BASE}/api/coupons/validate`, {
      code,
      amount,
    });
    if (!response.data?.success) {
      throw new Error(response.data?.error || "ไม่สามารถใช้คูปองนี้ได้");
    }
    return response.data.data;
  };
  const updateOrder = async (id, status) => {
    try {
      const response =
        status === "CANCELLED"
          ? await axios.put(`${API_BASE}/api/orders/${id}/cancel`)
          : await axios.put(`${API_BASE}/api/orders/${id}/status`, { status });
      if (response.data?.success) {
        setOrders((current) =>
          current.map((order) =>
            order.id === id ? { ...order, status } : order,
          ),
        );
        setNotice(
          status === "COMPLETED"
            ? "PAYMENT RECEIVED · SECURE CASH DROP"
            : status === "READY"
              ? "ORDER READY FOR PICKUP"
              : status === "CANCELLED"
                ? "ORDER CANCELLED"
                : "ORDER STATUS UPDATED",
        );
        if (session?.role === "admin") await refreshSalesBreakdown();
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถอัปเดตออเดอร์ได้");
      console.warn("Order update failed.", error);
    }
    return false;
  };
  const refreshFinancialSummary = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/financial-summary`);
      if (response.data?.success) {
        const data = response.data.data || {};
        setMetrics({
          gross: Number(data.total_gross || 0),
          net: Number(data.total_net_revenue || data.total_net || 0),
          gp: Number(data.total_gp || 0),
          cogs: Number(data.total_cogs || 0),
          profit: Number(data.total_net_profit || 0),
        });
        setExpenses(Number(data.total_expenses ?? data.expenses ?? 0));
      }
    } catch (error) {
      console.warn("Financial summary refresh unavailable.", error);
    }
  };
  const createSalesRecord = async (record) => {
    try {
      const response = await axios.post(`${API_BASE}/api/orders`, record);
      if (response.data?.success) {
        const channel = channels.find(
          (item) => Number(item.id) === Number(record.channel_id),
        );
        const created = normalizeOrder({
          ...response.data.data,
          channel_name: channel?.name,
          items: record.items,
        });
        if (record.status && record.status !== "COOKING")
          await axios.put(`${API_BASE}/api/orders/${created.id}/status`, {
            status: record.status,
          });
        setOrders((current) => [
          { ...created, status: record.status || created.status },
          ...current,
        ]);
        await refreshFinancialSummary();
        await refreshSalesBreakdown(record.record_date || todayInBangkok());
        setNotice("SALES RECORD CREATED · FINANCIAL HUD UPDATED");
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถบันทึกรายการขายได้");
      console.warn("Sales record create failed.", error);
    }
    return false;
  };
  const updateSalesRecord = async (id, record) => {
    try {
      const response = await axios.put(`${API_BASE}/api/orders/${id}`, record);
      if (response.data?.success) {
        const channel = channels.find(
          (item) => Number(item.id) === Number(record.channel_id),
        );
        setOrders((current) =>
          current.map((order) =>
            order.id === id
              ? normalizeOrder({
                  ...response.data.data,
                  channel_name: channel?.name,
                  items: record.items,
                })
              : order,
          ),
        );
        await refreshFinancialSummary();
        await refreshSalesBreakdown(record.record_date || todayInBangkok());
        setNotice("SALES RECORD UPDATED · FINANCIAL HUD UPDATED");
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขรายการขายได้");
      console.warn("Sales record update failed.", error);
    }
    return false;
  };
  const deleteSalesRecord = async (order) => {
    if (!order?.id) return;
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ลบรายการขาย?",
      message: `ต้องการลบรายการขาย #${order.order_no} ใช่หรือไม่\nสต็อกและยอดการเงินของรายการนี้จะถูกปรับกลับ`,
      confirmLabel: "ลบรายการขาย",
    });
    if (!confirmed) return;
    try {
      const response = await axios.delete(`${API_BASE}/api/orders/${order.id}`);
      if (response.data?.success) {
        setOrders((current) => current.filter((item) => item.id !== order.id));
        await refreshFinancialSummary();
        await refreshSalesBreakdown(todayInBangkok());
        setNotice("SALES RECORD DELETED · STOCK RESTORED");
      }
    } catch (error) {
      showError(error, "ไม่สามารถลบรายการขายได้");
      console.warn("Sales record delete failed.", error);
    }
  };
  const handleRestock = async (item) => {
    if (!item) return;
    setNotice(
      `RESTOCK REQUEST SENT · WAREHOUSE MANAGER MOVING ${item.name.toUpperCase()}`,
    );
    try {
      const response = await axios.post(`${API_BASE}/api/inventory/restock`, {
        ingredient_id: item.id,
        qty_to_add: item.level === "low" ? 12 : 6,
      });
      if (response.data?.success) {
        setRestocked((current) => [...current, item.code || item.id]);
        setInventoryRows((current) =>
          current.map((row) => (row.id === item.id ? response.data.data : row)),
        );
        const lotsResponse = await axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`);
        if (lotsResponse.data?.success) setInventoryLots(lotsResponse.data.data);
        await refreshProducts();
      }
    } catch (error) {
      console.warn("Restock API unavailable; request was not recorded.", error);
    }
  };
  const adjustInventory = async (adjustment) => {
    try {
      const response = await axios.post(`${API_BASE}/api/inventory/adjustments`, adjustment);
      if (response.data?.success) {
        const result = response.data.data;
        setInventoryRows((current) => current.map((item) =>
          String(item.id) === String(result.ingredient.id) ? result.ingredient : item,
        ));
        const lotsResponse = await axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`);
        if (lotsResponse.data?.success) setInventoryLots(lotsResponse.data.data);
        await refreshProducts();
        const direction = Number(result.difference || 0) > 0 ? "+" : "";
        setNotice(`${result.adjustment_type === "WASTE" ? "WASTE RECORDED" : "STOCK COUNT UPDATED"} · ${direction}${Number(result.difference || 0)}`);
        return result;
      }
    } catch (error) {
      showError(error, "ไม่สามารถบันทึกการปรับยอดสต็อกได้");
      console.warn("Inventory adjustment failed.", error);
    }
    return null;
  };
  const createSupplier = async (supplier) => {
    try {
      const response = await axios.post(`${API_BASE}/api/inventory/suppliers`, supplier);
      if (response.data?.success) {
        const created = response.data.data;
        setSuppliers((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name, "th")));
        setNotice(`SUPPLIER ADDED · ${created.name.toUpperCase()}`);
        return created;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเพิ่มผู้ขายได้");
      console.warn("Supplier create failed.", error);
    }
    return null;
  };
  const updateSupplier = async (supplierId, supplier) => {
    try {
      const response = await axios.put(`${API_BASE}/api/inventory/suppliers/${supplierId}`, supplier);
      if (response.data?.success) {
        const updated = response.data.data;
        setSuppliers((current) => current
          .map((item) => String(item.id) === String(updated.id) ? { ...item, ...updated } : item)
          .sort((left, right) => left.name.localeCompare(right.name, "th")));
        setNotice(`SUPPLIER UPDATED · ${updated.name.toUpperCase()}`);
        return updated;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขข้อมูลผู้ขายได้");
      console.warn("Supplier update failed.", error);
    }
    return null;
  };
  const fetchSupplierHistory = async (supplierId) => {
    try {
      const response = await axios.get(`${API_BASE}/api/inventory/suppliers/${supplierId}/history`, {
        params: { limit: 100 },
      });
      return response.data?.success ? response.data.data : null;
    } catch (error) {
      showError(error, "ไม่สามารถโหลดประวัติผู้ขายได้");
      console.warn("Supplier history refresh failed.", error);
    }
    return null;
  };
  const createStockReceipt = async (receipt) => {
    try {
      const response = await axios.post(`${API_BASE}/api/inventory/receipts`, receipt);
      if (response.data?.success) {
        const created = response.data.data;
        const updates = new Map((created.updated_ingredients || []).map((item) => [String(item.id), item]));
        setInventoryRows((current) => current.map((item) => updates.get(String(item.id)) || item));
        const lotsResponse = await axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`);
        if (lotsResponse.data?.success) setInventoryLots(lotsResponse.data.data);
        await refreshProducts();
        const supplier = suppliers.find((item) => String(item.id) === String(created.supplier_id));
        setStockReceipts((current) => [{ ...created, supplier_name: supplier?.name || "" }, ...current].slice(0, 20));
        setNotice(`STOCK RECEIVED · ${created.receipt_no}`);
        return created;
      }
    } catch (error) {
      showError(error, "ไม่สามารถบันทึกรับวัตถุดิบได้");
      console.warn("Stock receipt create failed.", error);
    }
    return null;
  };
  const createPurchaseOrder = async (purchaseOrder) => {
    try {
      const response = await axios.post(`${API_BASE}/api/purchase-orders`, {
        supplier_id: purchaseOrder.supplier_id || null,
        expected_date: purchaseOrder.expected_date || null,
        note: purchaseOrder.note || "",
        items: purchaseOrder.items.map((item) => ({
          ingredient_id: Number(item.ingredient_id),
          quantity: Number(item.quantity),
          unit_cost: Number(item.unit_cost || 0),
        })),
      });
      if (response.data?.success) {
        setPurchaseOrders((current) => [response.data.data, ...current.filter((item) => item.id !== response.data.data.id)]);
        setNotice(`PURCHASE ORDER CREATED · ${response.data.data.po_no}`);
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถสร้างใบสั่งซื้อได้");
      console.warn("Purchase order create failed.", error);
    }
    return null;
  };
  const updatePurchaseOrderStatus = async (purchaseOrder, status) => {
    try {
      const response = await axios.patch(`${API_BASE}/api/purchase-orders/${purchaseOrder.id}/status`, { status });
      if (response.data?.success) {
        setPurchaseOrders((current) => current.map((item) => item.id === purchaseOrder.id ? response.data.data : item));
        setNotice(status === "SENT" ? `PURCHASE ORDER SENT · ${purchaseOrder.po_no}` : `PURCHASE ORDER CANCELLED · ${purchaseOrder.po_no}`);
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเปลี่ยนสถานะใบสั่งซื้อได้");
      console.warn("Purchase order status update failed.", error);
    }
    return null;
  };
  const receivePurchaseOrder = async (purchaseOrder, receiptInput = {}) => {
    try {
      const items = Array.isArray(receiptInput.items) && receiptInput.items.length
        ? receiptInput.items.map((item) => ({
          ingredient_id: item.ingredient_id,
          quantity: item.quantity,
          unit_cost: item.unit_cost,
          lot_no: item.lot_no || undefined,
          expiry_date: item.expiry_date || undefined,
        }))
        : undefined;
      const response = await axios.post(`${API_BASE}/api/purchase-orders/${purchaseOrder.id}/receive`, {
        received_at: receiptInput.received_at || undefined,
        note: receiptInput.note?.trim() || undefined,
        items,
      });
      if (response.data?.success) {
        const { purchase_order: updatedOrder, receipt } = response.data.data;
        const updates = new Map((receipt.updated_ingredients || []).map((item) => [String(item.id), item]));
        setInventoryRows((current) => current.map((item) => updates.get(String(item.id)) || item));
        const lotsResponse = await axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`);
        if (lotsResponse.data?.success) setInventoryLots(lotsResponse.data.data);
        await refreshProducts();
        setPurchaseOrders((current) => current.map((item) => item.id === updatedOrder.id ? updatedOrder : item));
        setStockReceipts((current) => [{ ...receipt, supplier_name: updatedOrder.supplier_name || "" }, ...current].slice(0, 20));
        setNotice(`PURCHASE ORDER RECEIVED · ${updatedOrder.po_no}`);
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถรับของตามใบสั่งซื้อได้");
      console.warn("Purchase order receive failed.", error);
    }
    return null;
  };
  const createCoupon = async (coupon) => {
    try {
      const response = await axios.post(`${API_BASE}/api/coupons`, coupon);
      if (response.data?.success) {
        setCoupons((current) => [response.data.data, ...current]);
        setNotice(`COUPON CREATED · ${response.data.data.code}`);
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถสร้างคูปองได้");
      console.warn("Coupon create failed.", error);
    }
    return null;
  };
  const updateCoupon = async (couponId, coupon) => {
    try {
      const response = await axios.put(`${API_BASE}/api/coupons/${couponId}`, coupon);
      if (response.data?.success) {
        setCoupons((current) => current.map((item) => item.id === couponId ? response.data.data : item));
        setNotice(`COUPON UPDATED · ${response.data.data.code}`);
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขคูปองได้");
      console.warn("Coupon update failed.", error);
    }
    return null;
  };
  const createInventory = async (item) => {
    try {
      const response = await axios.post(`${API_BASE}/api/inventory`, item);
      if (response.data?.success) {
        setInventoryRows((current) => [...current, response.data.data]);
        const lotsResponse = await axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`);
        if (lotsResponse.data?.success) setInventoryLots(lotsResponse.data.data);
        await refreshProducts();
        setNotice("INVENTORY ITEM CREATED · WAREHOUSE UPDATED");
        return true;
      }
    } catch (error) {
      console.warn("Inventory create API unavailable.", error);
    }
    return false;
  };
  const updateInventory = async (id, item) => {
    try {
      const response = await axios.put(`${API_BASE}/api/inventory/${id}`, item);
      if (response.data?.success) {
        setInventoryRows((current) =>
          current.map((row) => (row.id === id ? response.data.data : row)),
        );
        const lotsResponse = await axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`);
        if (lotsResponse.data?.success) setInventoryLots(lotsResponse.data.data);
        await refreshProducts();
        setNotice("INVENTORY ITEM UPDATED · WAREHOUSE UPDATED");
        return true;
      }
    } catch (error) {
      console.warn("Inventory update API unavailable.", error);
    }
    return false;
  };
  const deleteInventory = async (item) => {
    if (!item?.id) return;
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ลบวัตถุดิบ?",
      message: `ต้องการลบ “${item.name}” ออกจากคลังใช่หรือไม่`,
      confirmLabel: "ลบวัตถุดิบ",
    });
    if (!confirmed) return;
    try {
      const response = await axios.delete(
        `${API_BASE}/api/inventory/${item.id}`,
      );
      if (response.data?.success) {
        setInventoryRows((current) =>
          current.filter((row) => row.id !== item.id),
        );
        setNotice("INVENTORY ITEM DELETED · WAREHOUSE UPDATED");
      }
    } catch (error) {
      console.warn("Inventory delete API unavailable.", error);
    }
  };
  const createMenu = async (menu) => {
    try {
      const response = await axios.post(`${API_BASE}/api/products`, {
        ...menu,
        price_retail: Number(menu.price_retail),
        price_wholesale: menu.price_wholesale
          ? Number(menu.price_wholesale)
          : null,
        recipe: menu.recipe.map((item) => ({
          ingredient_id: Number(item.ingredient_id),
          quantity_used: Number(item.quantity_used),
        })),
      });
      if (response.data?.success) {
        await refreshProducts();
        setNotice("MENU CREATED · RECIPE SAVED");
        return true;
      }
    } catch (error) {
      console.warn("Menu create API unavailable.", error);
    }
    return false;
  };
  const updateMenu = async (id, menu) => {
    try {
      const response = await axios.put(`${API_BASE}/api/products/${id}`, {
        ...menu,
        price_retail: Number(menu.price_retail),
        price_wholesale: menu.price_wholesale
          ? Number(menu.price_wholesale)
          : null,
        recipe: menu.recipe.map((item) => ({
          ingredient_id: Number(item.ingredient_id),
          quantity_used: Number(item.quantity_used),
        })),
      });
      if (response.data?.success) {
        await refreshProducts();
        setNotice("MENU UPDATED · RECIPE SAVED");
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขเมนูได้");
      console.warn("Menu update API unavailable.", error);
    }
    return false;
  };
  const deleteMenu = async (menu) => {
    if (!menu?.id) return;
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ลบเมนูสินค้า?",
      message: `ต้องการลบเมนู “${menu.name}” ใช่หรือไม่`,
      confirmLabel: "ลบเมนู",
    });
    if (!confirmed) return;
    try {
      const response = await axios.delete(
        `${API_BASE}/api/products/${menu.id}`,
      );
      if (response.data?.success) {
        setProducts((current) =>
          current.filter((product) => product.id !== menu.id),
        );
        setNotice("MENU DELETED · CATALOG UPDATED");
      }
    } catch (error) {
      console.warn("Menu delete API unavailable.", error);
    }
  };
  const setMenuAvailability = async (menu, isSoldOut) => {
    try {
      const response = await axios.patch(
        `${API_BASE}/api/products/${menu.id}/availability`,
        { is_sold_out: isSoldOut },
      );
      if (response.data?.success) {
        await refreshProducts();
        setNotice(isSoldOut ? `MENU PAUSED · ${menu.name}` : `MENU ENABLED · ${menu.name}`);
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเปลี่ยนสถานะเมนูได้");
      console.warn("Menu availability update failed.", error);
    }
    return false;
  };
  const createExpense = async (amount, category, description, recordDate) => {
    try {
      const response = await axios.post(`${API_BASE}/api/expenses`, {
        amount: Number(amount),
        category,
        description,
        record_date: recordDate,
      });
      if (response.data?.success) {
        setExpenseRows((current) => [response.data.data, ...current]);
        setExpenses((current) => current + Number(amount));
        setNotice("EXPENSE CREATED · LEDGER UPDATED");
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเพิ่มค่าใช้จ่ายได้");
      console.warn("Expense create API unavailable.", error);
    }
    return false;
  };
  const updateExpense = async (
    id,
    amount,
    category,
    description,
    recordDate,
  ) => {
    try {
      const previous = expenseRows.find((row) => row.id === id);
      const response = await axios.put(`${API_BASE}/api/expenses/${id}`, {
        amount: Number(amount),
        category,
        description,
        record_date: recordDate,
      });
      if (response.data?.success) {
        setExpenseRows((current) =>
          current.map((row) => (row.id === id ? response.data.data : row)),
        );
        setExpenses(
          (current) => current + Number(amount) - Number(previous?.amount || 0),
        );
        setNotice("EXPENSE UPDATED · LEDGER UPDATED");
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขค่าใช้จ่ายได้");
      console.warn("Expense update API unavailable.", error);
    }
    return false;
  };
  const deleteExpense = async (item) => {
    if (!item?.id) return;
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ลบรายการค่าใช้จ่าย?",
      message: `ต้องการลบรายการค่าใช้จ่าย ${money(item.amount)} ใช่หรือไม่`,
      confirmLabel: "ลบค่าใช้จ่าย",
    });
    if (!confirmed) return;
    try {
      const response = await axios.delete(
        `${API_BASE}/api/expenses/${item.id}`,
      );
      if (response.data?.success) {
        setExpenseRows((current) =>
          current.filter((row) => row.id !== item.id),
        );
        setExpenses((current) => current - Number(item.amount));
        setNotice("EXPENSE DELETED · LEDGER UPDATED");
      }
    } catch (error) {
      showError(error, "ไม่สามารถลบค่าใช้จ่ายได้");
      console.warn("Expense delete API unavailable.", error);
    }
  };
  const recordExpense = async (amount, category) => {
    try {
      const response = await axios.post(`${API_BASE}/api/expenses`, {
        amount,
        category,
      });
      if (response.data?.success) {
        setExpenses((current) => current + amount);
        setNotice(`EXPENSE RECORDED · ${money(amount)} MOVED TO SAFE`);
      }
    } catch (error) {
      console.warn("Expense API unavailable; expense was not recorded.", error);
    }
  };

  if (!session && anonymousMode)
    return (
      <>
        <ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} />
        <AnonymousOrderStatus
          apiBase={API_BASE}
          onBack={() => setAnonymousMode(false)}
        />
      </>
    );
  if (!session)
    return (
      <>
        <ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} />
        <LoginScreen
          onLogin={login}
          onRegister={register}
          onAnonymous={() => setAnonymousMode(true)}
          onHome={() => setAnonymousMode(true)}
        />
      </>
    );
  if (session.role === "user")
    return <><ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} /><UserOrderStatus user={session} orders={orders} loyalty={loyalty} onRefreshLoyalty={refreshMyLoyalty} onLogout={logout} /></>;
  if (session.role === "staff")
    return (
      <>
        <ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} />
        <StaffWorkspace
          user={session}
          orders={orders}
          channels={channels}
          products={products}
          currentShift={currentShift}
          onAdd={addOrder}
          onLookupLoyalty={lookupLoyalty}
          onValidateCoupon={validateCoupon}
          onOpenCashShift={openCashShift}
          onCloseCashShift={closeCashShift}
          onUpdate={updateOrder}
          onLogout={logout}
        />
      </>
    );
  return (
    <>
      <ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} />
      <GlassLayout
        user={session}
        onLogout={logout}
        activeView={activeView}
        setActiveView={setActiveView}
        orders={orders}
        channels={channels}
        products={products}
        inventoryRows={inventoryRows}
        inventoryLots={inventoryLots}
        suppliers={suppliers}
        stockReceipts={stockReceipts}
        purchaseOrders={purchaseOrders}
        coupons={coupons}
        cashShifts={cashShifts}
        salesBreakdown={salesBreakdown}
        metrics={metrics}
        expenses={expenses}
        expenseRows={expenseRows}
        currentShift={currentShift}
        notice={notice}
        systemStatus={systemStatus}
        onAdd={addOrder}
        onLookupLoyalty={lookupLoyalty}
        onValidateCoupon={validateCoupon}
        onOpenCashShift={openCashShift}
        onCloseCashShift={closeCashShift}
        onUpdate={updateOrder}
        onRestock={handleRestock}
        onAdjustInventory={adjustInventory}
        onCreateSupplier={createSupplier}
        onUpdateSupplier={updateSupplier}
        onFetchSupplierHistory={fetchSupplierHistory}
        onCreateStockReceipt={createStockReceipt}
        onCreatePurchaseOrder={createPurchaseOrder}
        onUpdatePurchaseOrderStatus={updatePurchaseOrderStatus}
        onReceivePurchaseOrder={receivePurchaseOrder}
        onCreateCoupon={createCoupon}
        onUpdateCoupon={updateCoupon}
        onCreateChannel={createChannel}
        onUpdateChannel={updateChannel}
        onRefreshCashShifts={refreshCashShifts}
        onRefreshSalesBreakdown={refreshSalesBreakdown}
        onRefreshSalesReport={refreshSalesReport}
        onLoadGoLiveReadiness={loadGoLiveReadiness}
        onLoadGoLiveChecks={loadGoLiveChecks}
        onSaveGoLiveCheck={saveGoLiveCheck}
        onLoadAuditLogs={loadAuditLogs}
        onDownloadBusinessBackup={downloadBusinessBackup}
        onFetchDailyClosing={fetchDailyClosing}
        onCloseBusinessDay={closeBusinessDay}
        onCreateInventory={createInventory}
        onUpdateInventory={updateInventory}
        onDeleteInventory={deleteInventory}
        onCreateMenu={createMenu}
        onUpdateMenu={updateMenu}
        onDeleteMenu={deleteMenu}
        onSetMenuAvailability={setMenuAvailability}
        onExpense={recordExpense}
        onCreateExpense={createExpense}
        onUpdateExpense={updateExpense}
        onDeleteExpense={deleteExpense}
        onCreateSales={createSalesRecord}
        onUpdateSales={updateSalesRecord}
        onDeleteSales={deleteSalesRecord}
      />
    </>
  );
}

export default function App() {
  return (
    <ActionDialogProvider>
      <AppContent />
    </ActionDialogProvider>
  );
}

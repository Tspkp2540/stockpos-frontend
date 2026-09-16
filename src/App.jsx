import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import { ActionDialogProvider, useActionDialog } from "./components/ui/ActionDialog";
import { createOrderSubmissionFingerprint } from "./utils/orderSubmission";

const GlassLayout = lazy(() => import("./components/ui/GlassLayout"));
const LoginScreen = lazy(() => import("./components/ui/LoginScreen"));
const StaffWorkspace = lazy(() => import("./components/ui/StaffWorkspace"));
const UserOrderStatus = lazy(() => import("./components/ui/UserOrderStatus"));
const AnonymousOrderStatus = lazy(() => import("./components/ui/AnonymousOrderStatus"));

const API_BASE =
  import.meta.env.VITE_API_URL ||
  "https://stockpos-production-d146.up.railway.app";
const SESSION_KEY = "stockpos-session";
const SESSION_LOCK_KEY = "stockpos-session-locked";
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
const loadSessionLock = () => {
  try {
    return Boolean(loadSession() && window.sessionStorage.getItem(SESSION_LOCK_KEY) === "true");
  } catch (error) {
    return false;
  }
};

const tokenExpiresAt = (token) => {
  try {
    const body = String(token || "").split(".")[0];
    const payload = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    const expiresAt = Number(payload?.exp) * 1000;
    return Number.isFinite(expiresAt) ? expiresAt : 0;
  } catch (error) {
    return 0;
  }
};

const initialOrders = [];
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

function SessionExpiredDialog({ onContinue }) {
  return (
    <div className="fixed inset-0 z-[220] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="session-expired-title">
      <section className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 text-center shadow-2xl shadow-slate-950/20">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-2xl text-amber-700" aria-hidden="true">⌛</div>
        <h2 id="session-expired-title" className="mt-4 text-xl font-extrabold text-slate-900">เซสชันหมดอายุแล้ว</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">เพื่อความปลอดภัย กรุณาเข้าสู่ระบบอีกครั้ง</p>
        <button type="button" className="mt-6 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200" onClick={onContinue}>ไปหน้าเข้าสู่ระบบ</button>
      </section>
    </div>
  );
}

function SessionLockDialog({ onUnlock, onLogout }) {
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!password || isSubmitting) return;
    setIsSubmitting(true);
    setError("");
    try {
      const result = await onUnlock(password);
      if (result !== true) setError(result || "ไม่สามารถปลดล็อกหน้าจอได้");
      else setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="session-lock-title">
      <form className="w-full max-w-sm rounded-3xl border border-white/70 bg-white p-6 shadow-2xl shadow-slate-950/20" onSubmit={handleSubmit}>
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-100 text-2xl text-sky-700" aria-hidden="true">🔒</div>
        <h2 id="session-lock-title" className="mt-4 text-center text-xl font-extrabold text-slate-900">ล็อกหน้าจอชั่วคราว</h2>
        <p className="mt-2 text-center text-sm leading-6 text-slate-600">ไม่มีการใช้งานเกิน 10 นาที กรุณากรอกรหัสผ่านเพื่อใช้งานต่อ</p>
        <label className="mt-5 block text-sm font-bold text-slate-700">
          รหัสผ่าน
          <input autoFocus autoComplete="current-password" className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        {error ? <p className="mt-2 text-sm font-semibold text-rose-600" role="alert">{error}</p> : null}
        <button type="submit" disabled={!password || isSubmitting} className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-sky-600/20 transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "กำลังตรวจสอบ..." : "ปลดล็อก"}</button>
        <button type="button" className="mt-3 w-full rounded-xl px-4 py-2 text-sm font-bold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700" onClick={onLogout}>ออกจากระบบ</button>
      </form>
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
  const [sessionLocked, setSessionLocked] = useState(loadSessionLock);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [anonymousMode, setAnonymousMode] = useState(true);
  const [activeView, setActiveView] = useState("home");
  const [orders, setOrders] = useState(initialOrders);
  const [restocked, setRestocked] = useState([]);
  const [notice, setNotice] = useState("กำลังตรวจสอบการเชื่อมต่อ...");
  const [loyalty, setLoyalty] = useState({ account: null, rules: null });
  const [loyaltyMembers, setLoyaltyMembers] = useState([]);
  const [rolePermissions, setRolePermissions] = useState([]);
  const [systemUsers, setSystemUsers] = useState([]);
  const [loyaltySettings, setLoyaltySettings] = useState({
    is_enabled: true,
    earn_enabled: true,
    redeem_enabled: true,
    earn_mode: "SPEND",
    spend_per_point: 25,
    cups_per_point: 1,
    baht_per_point: 0.1,
    max_redeem_percent: 50,
  });
  const [channels, setChannels] = useState([]);
  const [diningTables, setDiningTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [inventoryRows, setInventoryRows] = useState([]);
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

  const expireSession = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_LOCK_KEY);
    delete axios.defaults.headers.common.Authorization;
    setSessionLocked(false);
    setAnonymousMode(false);
    setSession(null);
    setSessionExpired(true);
  }, []);
  const lockSession = useCallback(() => {
    const expiresAt = tokenExpiresAt(session?.token);
    if (!session?.token || !expiresAt || expiresAt <= Date.now()) {
      expireSession();
      return;
    }
    window.sessionStorage.setItem(SESSION_LOCK_KEY, "true");
    setSessionLocked(true);
  }, [expireSession, session?.token]);

  useEffect(() => {
    const interceptorId = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        const method = String(error?.config?.method || "get").toLowerCase();
        const url = String(error?.config?.url || "");
        const isPublicAuth = /\/api\/auth\/(login|register)$/.test(url);
        const isUnlockRequest = /\/api\/auth\/verify-password$/.test(url);
        if (Number(error?.response?.status) === 401 && !isPublicAuth) {
          error.stockposErrorNotified = true;
          expireSession();
          return Promise.reject(error);
        }
        const isOrderCreate = method === "post" && /\/api\/orders$/.test(url);
        if (["post", "put", "patch", "delete"].includes(method) && !isOrderCreate && !isUnlockRequest && !error.stockposErrorNotified) {
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
  }, [expireSession, showMessage]);

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
  const refreshDiningTables = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/tables`);
      if (response.data?.success) {
        setDiningTables(response.data.data || []);
        return response.data.data || [];
      }
    } catch (error) {
      showError(error, "ไม่สามารถโหลดข้อมูลโต๊ะได้");
    }
    return null;
  };
  const createDiningTable = async (table) => {
    try {
      const response = await axios.post(`${API_BASE}/api/tables`, table);
      if (response.data?.success) {
        setDiningTables((current) => [...current, response.data.data].sort((a, b) => String(a.table_code).localeCompare(String(b.table_code))));
        setNotice("TABLE CREATED · READY FOR DINE IN");
        return response.data.data;
      }
    } catch (error) { showError(error, "ไม่สามารถเพิ่มโต๊ะได้"); }
    return null;
  };
  const updateDiningTable = async (id, table) => {
    try {
      const response = await axios.put(`${API_BASE}/api/tables/${id}`, table);
      if (response.data?.success) {
        setDiningTables((current) => current.map((item) => String(item.id) === String(id) ? response.data.data : item));
        return response.data.data;
      }
    } catch (error) { showError(error, "ไม่สามารถแก้ไขโต๊ะได้"); }
    return null;
  };
  const tableSessionAction = async (id, action, payload = {}) => {
    try {
      const response = await axios.post(`${API_BASE}/api/tables/${id}/${action}`, payload);
      if (response.data?.success) {
        await refreshDiningTables();
        setNotice("TABLE STATUS UPDATED");
        return response.data.data || true;
      }
    } catch (error) { showError(error, "ไม่สามารถจัดการบิลโต๊ะได้"); }
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
    window.sessionStorage.removeItem(SESSION_LOCK_KEY);
    setSessionExpired(false);
    setSessionLocked(false);
    setAnonymousMode(false);
    setSession(account);
    setActiveView(account.role === "admin" ? "home" : "pos");
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
    window.sessionStorage.removeItem(SESSION_LOCK_KEY);
    delete axios.defaults.headers.common.Authorization;
    setSessionLocked(false);
    setSessionExpired(false);
    setSession(null);
    setAnonymousMode(true);
    setActiveView("home");
    setCurrentShift(null);
    setCashShifts([]);
    setSalesBreakdown({ channels: [], payments: [] });
  };
  const unlockSession = async (password) => {
    if (!session?.token || tokenExpiresAt(session.token) <= Date.now()) {
      expireSession();
      return "เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง";
    }
    try {
      const response = await axios.post(`${API_BASE}/api/auth/verify-password`, { password });
      if (!response.data?.success) return response.data?.error || "รหัสผ่านไม่ถูกต้อง";
      window.sessionStorage.removeItem(SESSION_LOCK_KEY);
      setSessionLocked(false);
      return true;
    } catch (error) {
      if (Number(error?.response?.status) === 401) {
        expireSession();
        return "เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบอีกครั้ง";
      }
      return error?.response?.data?.error || "รหัสผ่านไม่ถูกต้อง";
    }
  };

  const refreshCurrentShift = async () => {
    if (!session?.token || !["admin", "staff"].includes(session.role) || session?.permissions?.["cash-shifts"]?.view !== true) {
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
  const refreshLoyaltySettings = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/loyalty/settings`);
      if (response.data?.success) {
        setLoyaltySettings(response.data.data);
        return response.data.data;
      }
    } catch (error) {
      console.warn("Loyalty settings refresh unavailable.", error);
    }
    return null;
  };
  const updateLoyaltySettings = async (settings) => {
    try {
      const response = await axios.put(`${API_BASE}/api/loyalty/settings`, settings);
      if (response.data?.success) {
        setLoyaltySettings(response.data.data);
        setNotice("LOYALTY SETTINGS UPDATED · POS RULES SYNCED");
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถบันทึกการตั้งค่าคะแนนสะสมได้");
      console.warn("Loyalty settings update failed.", error);
    }
    return null;
  };
  const refreshLoyaltyMembers = async (search = "") => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/loyalty-members`, { params: { search, limit: 200 } });
      if (response.data?.success && Array.isArray(response.data.data)) {
        setLoyaltyMembers(response.data.data);
        return response.data.data;
      }
    } catch (error) {
      console.warn("Loyalty members refresh unavailable.", error);
    }
    return [];
  };
  const createLoyaltyMember = async (member) => {
    try {
      const response = await axios.post(`${API_BASE}/api/admin/loyalty-members`, member);
      if (response.data?.success) {
        await refreshLoyaltyMembers();
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถเพิ่มสมาชิกได้");
    }
    return null;
  };
  const updateLoyaltyMember = async (id, member) => {
    try {
      const response = await axios.put(`${API_BASE}/api/admin/loyalty-members/${id}`, member);
      if (response.data?.success) {
        await refreshLoyaltyMembers();
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถแก้ไขสมาชิกได้");
    }
    return null;
  };
  const deleteLoyaltyMember = async (member) => {
    const confirmed = await confirmAction({
      tone: "danger",
      title: "ลบสมาชิก?",
      message: `ต้องการลบข้อมูลสมาชิก ${member.customer_name || member.customer_phone} ใช่หรือไม่\nประวัติคะแนนของสมาชิกนี้จะถูกลบด้วย`,
      confirmLabel: "ลบสมาชิก",
    });
    if (!confirmed) return false;
    try {
      const response = await axios.delete(`${API_BASE}/api/admin/loyalty-members/${member.id}`);
      if (response.data?.success) {
        await refreshLoyaltyMembers();
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถลบสมาชิกได้");
    }
    return false;
  };
  const refreshRolePermissions = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/role-permissions`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setRolePermissions(response.data.data);
        return response.data.data;
      }
    } catch (error) {
      console.warn("Role permissions refresh unavailable.", error);
    }
    return [];
  };
  const loadAuditLogs = async (limit = 100, filters = {}) => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/audit-logs`, {
        params: { limit, scope: "important", ...filters },
      });
      return response.data?.success && Array.isArray(response.data.data) ? response.data.data : [];
    } catch (error) {
      showError(error, "ไม่สามารถโหลดประวัติการแก้ไขได้");
      return [];
    }
  };
  const updateRolePermissions = async (role, permissions) => {
    try {
      const response = await axios.put(`${API_BASE}/api/admin/role-permissions/${role}`, { permissions });
      if (response.data?.success) {
        setRolePermissions((current) => current.map((item) => item.role === response.data.data.role ? response.data.data : item));
        setNotice("ROLE PERMISSIONS UPDATED");
        return response.data.data;
      }
    } catch (error) {
      showError(error, "ไม่สามารถบันทึกสิทธิ์บทบาทได้");
    }
    return null;
  };
  const createRole = async (role) => {
    try {
      const response = await axios.post(`${API_BASE}/api/admin/role-permissions`, role);
      if (response.data?.success) { await refreshRolePermissions(); return response.data.data; }
    } catch (error) { showError(error, "ไม่สามารถเพิ่มบทบาทได้"); }
    return null;
  };
  const deleteRole = async (role) => {
    const confirmed = await confirmAction({ tone: "danger", title: "ลบบทบาท?", message: `ต้องการลบบทบาท ${role.display_name || role.role} ใช่หรือไม่`, confirmLabel: "ลบบทบาท" });
    if (!confirmed) return false;
    try {
      const response = await axios.delete(`${API_BASE}/api/admin/role-permissions/${role.role}`);
      if (response.data?.success) { await refreshRolePermissions(); return true; }
    } catch (error) { showError(error, "ไม่สามารถลบบทบาทได้"); }
    return false;
  };
  const refreshSystemUsers = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/admin/users`);
      if (response.data?.success && Array.isArray(response.data.data)) { setSystemUsers(response.data.data); return response.data.data; }
    } catch (error) { console.warn("System users refresh unavailable.", error); }
    return [];
  };
  const assignUserRole = async (userId, roleKey) => {
    try {
      const response = await axios.put(`${API_BASE}/api/admin/users/${userId}/role`, { role_key: roleKey });
      if (response.data?.success) { await refreshSystemUsers(); return response.data.data; }
    } catch (error) { showError(error, "ไม่สามารถกำหนดบทบาทให้บัญชีได้"); }
    return null;
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
    const expiresAt = tokenExpiresAt(session.token);
    if (!expiresAt || expiresAt <= Date.now()) {
      expireSession();
      return undefined;
    }
    const timer = window.setTimeout(expireSession, expiresAt - Date.now());
    return () => window.clearTimeout(timer);
  }, [expireSession, session?.token]);

  useEffect(() => {
    if (!session?.token || sessionLocked) return undefined;
    const idleTimeoutMs = 10 * 60 * 1000;
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    let timer;
    const scheduleLock = () => {
      window.clearTimeout(timer);
      const expiresAt = tokenExpiresAt(session.token);
      if (!expiresAt || expiresAt <= Date.now()) {
        expireSession();
        return;
      }
      timer = window.setTimeout(() => {
        if (tokenExpiresAt(session.token) <= Date.now()) expireSession();
        else lockSession();
      }, Math.min(idleTimeoutMs, expiresAt - Date.now()));
    };
    events.forEach((eventName) => window.addEventListener(eventName, scheduleLock, { passive: true }));
    scheduleLock();
    return () => {
      window.clearTimeout(timer);
      events.forEach((eventName) => window.removeEventListener(eventName, scheduleLock));
    };
  }, [expireSession, lockSession, session?.token, sessionLocked]);

  useEffect(() => {
    if (!session?.token) return undefined;
    let active = true;
    axios
      .get(`${API_BASE}/api/auth/me`)
      .then((response) => {
        if (!active || !response.data?.success) return;
        setSession((current) => {
          if (!current) return current;
          const nextSession = {
            ...current,
            ...response.data.data,
            role: String(response.data.data.role).toLowerCase(),
          };
          window.localStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
          return nextSession;
        });
      })
      .catch((error) => {
        if (!active) return;
        if (Number(error?.response?.status) === 401) {
          expireSession();
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
  }, [expireSession, session?.token]);

  useEffect(() => {
    refreshCurrentShift();
  }, [session?.token, session?.permissions]);

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
    if (!session?.token || !session?.permissions) return undefined;
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
        axios.get(`${API_BASE}/api/tables`),
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
        tablesResult,
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
      const tablesResponse =
        tablesResult.status === "fulfilled" ? tablesResult.value : null;
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
      if (tablesResponse?.data?.success && Array.isArray(tablesResponse.data.data)) {
        setDiningTables(tablesResponse.data.data);
      }
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
        await Promise.all([refreshCoupons(), refreshCashShifts(), refreshSalesBreakdown(), refreshLoyaltySettings(), refreshLoyaltyMembers(), refreshRolePermissions(), refreshSystemUsers()]);
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
            ? {
              ...order,
              status: event.status,
              rawItems: event.productionStation
                ? (order.rawItems || []).map((item) => String(item.production_station || "BAR") === String(event.productionStation)
                  ? { ...item, production_status: event.productionStatus }
                  : item)
                : order.rawItems,
            }
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
    const fingerprint = createOrderSubmissionFingerprint({ ...payload, record_date: recordDate }, recordDate);
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
        loyalty_points_redeemed: Number(payload.loyalty_points_redeemed) || 0,
        table_id: payload.table_id || undefined,
        payment_method: payload.payment_method || "OTHER",
        payments: Array.isArray(payload.payments) && payload.payments.length
          ? payload.payments.map((payment) => ({
              payment_method: payment.payment_method,
              paid_amount: Number(payment.paid_amount) || 0,
              amount_received: payment.amount_received === undefined || payment.amount_received === ""
                ? undefined
                : Number(payment.amount_received),
            }))
          : undefined,
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
        if (payload.payment_method === "CASH" || payload.payments?.some((payment) => payment.payment_method === "CASH")) refreshCurrentShift();
        if (session?.role === "admin") await refreshSalesBreakdown(payload.record_date || todayInBangkok());
        await Promise.all([refreshProducts(), refreshDiningTables()]);
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
  const quotePromotion = async ({ channel_id, amount, customer_phone }) => {
    const response = await axios.post(`${API_BASE}/api/promotions/quote`, { channel_id, amount, customer_phone });
    if (!response.data?.success) throw new Error(response.data?.error || "ไม่สามารถคำนวณโปรโมชั่นได้");
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
  const updateKitchenStation = async (orderId, station, productionStatus) => {
    try {
      const response = await axios.put(`${API_BASE}/api/orders/${orderId}/kitchen-stations/${station}`, {
        production_status: productionStatus,
      });
      if (response.data?.success) {
        const data = response.data.data;
        setOrders((current) => current.map((order) => String(order.id) !== String(orderId) ? order : {
          ...order,
          status: data.order_status,
          rawItems: (order.rawItems || []).map((item) => String(item.production_station || "BAR") === String(station)
            ? {
              ...item,
              production_status: productionStatus,
              production_accepted_at: data.production_accepted_at ?? item.production_accepted_at,
              production_started_at: data.production_started_at ?? item.production_started_at,
              production_completed_at: data.production_completed_at ?? item.production_completed_at,
            }
            : item),
        }));
        setNotice({
          ACCEPTED: "KITCHEN ORDER ACCEPTED",
          IN_PROGRESS: "KITCHEN PREPARATION STARTED",
          READY: "PRODUCTION STATION READY",
          PENDING: "PRODUCTION STATION REOPENED",
        }[productionStatus] || "PRODUCTION STATUS UPDATED");
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถอัปเดตจุดผลิตได้");
    }
    return false;
  };
  const returnOrder = async (id, payload) => {
    try {
      const response = await axios.post(`${API_BASE}/api/orders/${id}/returns`, payload);
      if (response.data?.success) {
        const refreshed = await axios.get(`${API_BASE}/api/orders`);
        if (refreshed.data?.success && Array.isArray(refreshed.data.data)) {
          setOrders(refreshed.data.data.map(normalizeOrder));
        }
        await refreshFinancialSummary();
        if (session?.role === "admin") await refreshSalesBreakdown(todayInBangkok());
        if (response.data.data?.return?.refund_method === "CASH") await refreshCurrentShift();
        const returned = response.data.data?.return || {};
        setNotice(`RETURN COMPLETED · ${returned.return_no || "ORDER UPDATED"}`);
        showMessage({
          tone: "success",
          title: "คืนสินค้าและคืนเงินแล้ว",
          message: `เลขที่คืน ${returned.return_no || "-"} · คืนเงิน ฿${Number(returned.refund_amount || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
        });
        return true;
      }
    } catch (error) {
      showError(error, "ไม่สามารถคืนสินค้าได้");
      console.warn("Order return failed.", error);
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
  const reloadCurrentPage = async () => {
    const reloadOrders = async () => {
      const response = await axios.get(`${API_BASE}/api/orders`);
      if (response.data?.success && Array.isArray(response.data.data)) {
        setOrders(response.data.data.map(normalizeOrder));
      }
    };
    const reloadInventory = async () => {
      const [inventory, lots] = await Promise.all([
        axios.get(`${API_BASE}/api/inventory`),
        axios.get(`${API_BASE}/api/inventory/lots?active=true&limit=1000`),
      ]);
      if (inventory.data?.success && Array.isArray(inventory.data.data)) setInventoryRows(inventory.data.data);
      if (lots.data?.success && Array.isArray(lots.data.data)) setInventoryLots(lots.data.data);
    };
    const reloadExpenses = async () => {
      const response = await axios.get(`${API_BASE}/api/expenses`);
      if (response.data?.success && Array.isArray(response.data.data)) setExpenseRows(response.data.data);
    };
    const pageLoaders = {
      home: [reloadOrders, refreshFinancialSummary, refreshProducts, refreshDiningTables],
      pos: [reloadOrders, refreshProducts, refreshDiningTables, refreshCurrentShift],
      orders: [reloadOrders],
      kitchen: [reloadOrders],
      tables: [reloadOrders, refreshDiningTables],
      inventory: [reloadInventory],
      alerts: [reloadInventory, refreshProducts, refreshPurchaseOrders],
      procurement: [refreshPurchaseOrders],
      menu: [refreshProducts],
      coupons: [refreshCoupons],
      finance: [reloadOrders, refreshFinancialSummary, reloadExpenses, refreshSalesBreakdown],
      "cash-shifts": [refreshCurrentShift, refreshCashShifts],
      "loyalty-settings": [refreshLoyaltySettings],
      "loyalty-members": [refreshLoyaltyMembers],
      "role-permissions": [refreshRolePermissions, refreshSystemUsers],
      "sales-channels": [refreshSalesBreakdown],
      "business-reports": [refreshSalesBreakdown, refreshFinancialSummary],
    };
    try {
      const results = await Promise.allSettled([checkSystemHealth(), ...(pageLoaders[activeView] || [reloadOrders])].map((loader) => typeof loader === "function" ? loader() : loader));
      const failed = results.find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
      setNotice("รีโหลดข้อมูลของหน้านี้แล้ว");
    } catch (error) {
      showError(error, "ไม่สามารถรีโหลดข้อมูลของหน้านี้ได้");
    }
  };
  const sessionLockOverlay = sessionLocked ? <SessionLockDialog onUnlock={unlockSession} onLogout={logout} /> : null;
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
        {sessionExpired ? <SessionExpiredDialog onContinue={() => setSessionExpired(false)} /> : null}
      </>
    );
  if (session.role === "user")
    return <><ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} /><UserOrderStatus user={session} orders={orders} loyalty={loyalty} onRefreshLoyalty={refreshMyLoyalty} onLock={lockSession} onLogout={logout} />{sessionLockOverlay}</>;
  if (session.role === "staff")
    return (
      <>
        <ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} />
        <StaffWorkspace
          user={session}
          orders={orders}
          channels={channels}
          products={products}
          diningTables={diningTables}
          currentShift={currentShift}
          loyaltyRules={loyaltySettings}
          onAdd={addOrder}
          onLookupLoyalty={lookupLoyalty}
          onValidateCoupon={validateCoupon}
          onQuotePromotion={quotePromotion}
          onOpenCashShift={openCashShift}
          onCloseCashShift={closeCashShift}
          onUpdate={updateOrder}
          onUpdateKitchenStation={updateKitchenStation}
          onReturnOrder={returnOrder}
          onLock={lockSession}
          onLogout={logout}
        />
        {sessionLockOverlay}
      </>
    );
  return (
    <>
      <ConnectionBanner systemStatus={systemStatus} realtimeConnected={realtimeConnected} />
      <GlassLayout
        user={session}
        onLock={lockSession}
        onLogout={logout}
        onReload={reloadCurrentPage}
        activeView={activeView}
        setActiveView={setActiveView}
        orders={orders}
        channels={channels}
        products={products}
        diningTables={diningTables}
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
        loyaltySettings={loyaltySettings}
        loyaltyMembers={loyaltyMembers}
        rolePermissions={rolePermissions}
        systemUsers={systemUsers}
        notice={notice}
        systemStatus={systemStatus}
        onAdd={addOrder}
        onLookupLoyalty={lookupLoyalty}
        onUpdateLoyaltySettings={updateLoyaltySettings}
        onRefreshLoyaltyMembers={refreshLoyaltyMembers}
        onCreateLoyaltyMember={createLoyaltyMember}
        onUpdateLoyaltyMember={updateLoyaltyMember}
        onDeleteLoyaltyMember={deleteLoyaltyMember}
        onRefreshRolePermissions={refreshRolePermissions}
        onUpdateRolePermissions={updateRolePermissions}
        onCreateRole={createRole}
        onDeleteRole={deleteRole}
        onRefreshSystemUsers={refreshSystemUsers}
        onAssignUserRole={assignUserRole}
        onLoadAuditLogs={loadAuditLogs}
        onValidateCoupon={validateCoupon}
        onQuotePromotion={quotePromotion}
        onOpenCashShift={openCashShift}
        onCloseCashShift={closeCashShift}
        onUpdate={updateOrder}
        onUpdateKitchenStation={updateKitchenStation}
        onReturnOrder={returnOrder}
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
        onCreateDiningTable={createDiningTable}
        onUpdateDiningTable={updateDiningTable}
        onRefreshDiningTables={refreshDiningTables}
        onTableSessionAction={tableSessionAction}
        onRefreshCashShifts={refreshCashShifts}
        onRefreshSalesBreakdown={refreshSalesBreakdown}
        onRefreshSalesReport={refreshSalesReport}
        onFetchDailyClosing={fetchDailyClosing}
        onCloseBusinessDay={closeBusinessDay}
        onCreateInventory={createInventory}
        onUpdateInventory={updateInventory}
        onDeleteInventory={deleteInventory}
        onCreateMenu={createMenu}
        onUpdateMenu={updateMenu}
        onDeleteMenu={deleteMenu}
        onSetMenuAvailability={setMenuAvailability}
        onCreateExpense={createExpense}
        onUpdateExpense={updateExpense}
        onDeleteExpense={deleteExpense}
        onCreateSales={createSalesRecord}
        onUpdateSales={updateSalesRecord}
        onDeleteSales={deleteSalesRecord}
      />
      {sessionLockOverlay}
    </>
  );
}

export default function App() {
  return (
    <ActionDialogProvider>
      <Suspense fallback={<main className="flex min-h-screen items-center justify-center bg-sky-50 font-sans text-sm font-semibold text-sky-700">กำลังโหลดระบบ...</main>}>
        <AppContent />
      </Suspense>
    </ActionDialogProvider>
  );
}

import { useState } from "react";
import coffeeBarista from "../../assets/coffee-barista-login-clean.png";

const inputClass = "w-full rounded-xl border border-sky-200 px-3 py-2.5 text-sm outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100";

export default function LoginScreen({ onLogin, onRegister, onAnonymous, onHome }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const switchMode = (nextMode) => { setMode(nextMode); setError(""); };
  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      if (mode === "login") await onLogin({ username: username.trim().toLowerCase(), password });
      else await onRegister({ username: username.trim().toLowerCase(), full_name: fullName.trim(), phone: phone.trim(), password });
    } catch (requestError) {
      setError(requestError.message || "ไม่สามารถดำเนินการได้");
    } finally {
      setPending(false);
    }
  };

  return <main className="app-viewport shop-scene grid place-items-center p-4 sm:p-8">
    <section className="shop-panel grid w-full max-w-5xl overflow-hidden rounded-3xl border md:grid-cols-[1fr_420px]">
      <div className="relative hidden min-h-[640px] overflow-hidden bg-sky-100 md:block">
        <img className="absolute inset-0 h-full w-full object-cover object-[50%_22%]" src={coffeeBarista} alt="ตัวละครบาริสต้า KIN CHA KAN ชูแก้วกาแฟ" />
      </div>
      <div className="p-6 sm:p-10"><button className="mb-6 inline-flex items-center gap-1 rounded-lg px-1 py-1.5 text-sm font-bold text-sky-700 transition hover:text-sky-900 hover:underline focus:outline-none focus:ring-4 focus:ring-sky-100" type="button" onClick={onHome}>← หน้าหลัก</button>
        <div className="flex items-center gap-3 md:hidden"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-600 font-black text-white">S</span><strong className="text-slate-900">STOCKPOS</strong></div>
        <h2 className="mt-8 text-2xl font-bold text-slate-900 md:mt-0">{mode === "login" ? "เข้าสู่ระบบ" : "สมัครบัญชีผู้ใช้งาน"}</h2>
        <p className="mt-1 text-sm text-slate-500">{mode === "login" ? "ใช้ชื่อผู้ใช้และรหัสผ่านที่ผู้ดูแลกำหนดไว้ในฐานข้อมูล" : "กรอกชื่อและเบอร์โทร เพื่อผูกออเดอร์กับบัญชีของคุณ"}</p>
        <form className="mt-6 grid gap-4" onSubmit={submit}>
          {mode === "register" && <><label className="grid gap-1.5 text-xs font-semibold text-slate-600">ชื่อที่แสดง<input className={inputClass} autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="เช่น สมชาย ใจดี" minLength="2" required /></label><label className="grid gap-1.5 text-xs font-semibold text-slate-600">เบอร์โทรศัพท์<input className={inputClass} autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="เช่น 0812345678" minLength="9" maxLength="20" required /></label></>}
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">ชื่อผู้ใช้<input className={inputClass} autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="ตัวอักษรอังกฤษ ตัวเลข . _ -" pattern="[A-Za-z0-9._-]{3,64}" minLength="3" required /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">รหัสผ่าน<input className={inputClass} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" minLength="8" required /></label>
          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">{error}</p>}
          <button className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-200 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={pending}>{pending ? "กำลังตรวจสอบ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครและเข้าสู่ระบบ"}</button>
        </form>
        <div className="mt-5 text-center text-sm text-slate-500">{mode === "login" ? <>ยังไม่มีบัญชี? <button className="font-bold text-sky-700 hover:underline" type="button" onClick={() => switchMode("register")}>สมัครผู้ใช้งาน</button></> : <>มีบัญชีแล้ว? <button className="font-bold text-sky-700 hover:underline" type="button" onClick={() => switchMode("login")}>เข้าสู่ระบบ</button></>}</div>
        {mode === "login" && <button className="mt-5 w-full rounded-xl border border-sky-200 px-4 py-2.5 text-sm font-bold text-sky-700 hover:bg-sky-50" type="button" onClick={onAnonymous}>ดูสถานะออเดอร์ด้วยเบอร์โทร</button>}
      </div>
    </section>
  </main>;
}

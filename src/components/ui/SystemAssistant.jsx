import { useMemo, useState } from "react";
import axios from "axios";
import assistantBarista from "../../assets/system-assistant-barista.webp";

const roleLabel = {
  admin: "ผู้ดูแลระบบ",
  staff: "พนักงานร้าน",
  user: "สมาชิก",
  guest: "ผู้เข้าชม",
};

const guides = [
  {
    id: "home",
    keywords: ["เริ่ม", "เมนู", "หน้าหลัก", "ภาพรวม", "ระบบ"],
    title: "เริ่มต้นใช้งานระบบ",
    summary: "เลือกหมวดงานจากหน้าหลัก แล้วระบบจะแสดงเฉพาะเมนูที่บัญชีของคุณมีสิทธิ์ใช้งาน",
    steps: ["เลือกหมวดงานที่ต้องการ", "เลือกเมนูย่อย", "ใช้ปุ่มกลับหน้าหลักเพื่อเปลี่ยนหมวดงาน"],
    target: "home",
  },
  {
    id: "pos",
    keywords: ["ขาย", "pos", "ตะกร้า", "ชำระ", "เมนู", "ส่วนลด", "คูปอง", "โอน"],
    title: "รับออเดอร์และชำระเงิน",
    summary: "เลือกช่องทางขาย เลือกเมนูและตัวเลือก จากนั้นตรวจสอบตะกร้า ก่อนส่งออเดอร์เข้าครัว",
    steps: ["เลือกช่องทางขายและเมนู", "กดเมนูเพื่อเลือกความหวานหรือท็อปปิ้ง", "เปิดตะกร้าเพื่อลดราคา ระบุลูกค้า และชำระเงิน", "รอครัวยืนยันครบทุกจุดก่อนส่งมอบออเดอร์"],
    target: "pos",
  },
  {
    id: "kitchen",
    keywords: ["ครัว", "เตรียม", "บาร์", "คิว", "ทำอาหาร", "กำลังทำ"],
    title: "จัดการคิวครัว",
    summary: "แต่ละจุดผลิตทำงานตามลำดับ รับออเดอร์ → กำลังทำ → เสร็จสิ้น",
    steps: ["กดรับออเดอร์เมื่อเริ่มรับงาน", "เปลี่ยนเป็นกำลังทำขณะเตรียม", "ยืนยันเสร็จสิ้นเมื่อส่งงานของจุดผลิตนั้นครบ"],
    target: "kitchen",
  },
  {
    id: "tables",
    keywords: ["โต๊ะ", "ย้ายโต๊ะ", "รวมโต๊ะ", "แยกโต๊ะ", "บิล"],
    title: "จัดการโต๊ะและบิล",
    summary: "ผังโต๊ะแสดงสีเขียวเมื่อว่าง สีฟ้าเมื่อมีบิลใช้งาน และสีเทาเมื่อปิดใช้",
    steps: ["เปิดบิลจากหน้า POS โดยเลือกโต๊ะ", "ใช้ปุ่มย้าย รวม หรือแยกเมื่อมีหลายออเดอร์", "ปิดโต๊ะหลังไม่มีงานค้างในครัวหรือรอรับสินค้า"],
    target: "tables",
  },
  {
    id: "inventory",
    keywords: ["สต็อก", "วัตถุดิบ", "ใกล้หมด", "รับของ", "ล็อต"],
    title: "ดูแลวัตถุดิบและสต็อก",
    summary: "บันทึกวัตถุดิบ รับสินค้าเข้าตามล็อต และติดตามรายการใกล้หมดจากหน้าแจ้งเตือน",
    steps: ["เพิ่มหรือแก้ไขข้อมูลวัตถุดิบ", "รับของเข้าเพื่อเพิ่มจำนวนและต้นทุนล็อต", "ตรวจสอบรายการใกล้หมดก่อนเริ่มกะ"],
    target: "inventory",
  },
  {
    id: "menu",
    keywords: ["เพิ่มเมนู", "ราคา", "ท็อปปิ้ง", "ความหวาน", "บาร์โค้ด", "รูป"],
    title: "ตั้งค่าเมนูขาย",
    summary: "กำหนดชื่อ ราคา รูปภาพ บาร์โค้ด สูตร และตัวเลือกของแต่ละเมนู เพื่อให้พร้อมขายใน POS",
    steps: ["กดเพิ่มเมนู", "ใส่ราคาและหมวดหมู่", "กำหนดตัวเลือกความหวานหรือท็อปปิ้งตามต้องการ", "ตรวจสอบว่าเมนูเปิดขายสำหรับช่องทางที่ต้องการ"],
    target: "menu",
  },
  {
    id: "finance",
    keywords: ["การเงิน", "ยอดขาย", "กำไร", "รายงาน", "ค่าใช้จ่าย", "ค้นหา"],
    title: "ตรวจสอบการเงินและรายงาน",
    summary: "ค้นหาออเดอร์ด้วยเลขออเดอร์ ชื่อลูกค้า หรือสมาชิก แล้วดูยอดขาย ต้นทุน ส่วนลด และค่าใช้จ่าย",
    steps: ["เลือกช่วงวันที่", "ใช้ช่องค้นหาเพื่อตรวจสอบรายการเฉพาะ", "ตรวจสอบผลกระทบจากส่วนลดและคืนเงินก่อนสรุปยอด"],
    target: "finance",
  },
  {
    id: "members",
    keywords: ["สมาชิก", "แต้ม", "คะแนน", "ลูกค้า", "สะสม"],
    title: "จัดการสมาชิกและคะแนนสะสม",
    summary: "ใช้เบอร์โทรเพื่อระบุสมาชิก ตรวจสอบแต้ม และตัดคะแนนก่อนยืนยันออเดอร์",
    steps: ["กรอกเบอร์โทรลูกค้าในตะกร้า", "ตรวจสอบคะแนนก่อนใช้เป็นส่วนลด", "คะแนนจะถูกบันทึกเมื่อยืนยันออเดอร์สำเร็จ"],
    target: "loyalty-members",
  },
  {
    id: "orders",
    keywords: ["สถานะ", "ติดตาม", "ออเดอร์", "ประวัติ", "คิว"],
    title: "ติดตามออเดอร์",
    summary: "ดูคิวและสถานะของออเดอร์ปัจจุบัน รวมถึงประวัติการสั่งซื้อของบัญชีนี้",
    steps: ["ค้นหาด้วยเลขออเดอร์ ชื่อเล่น หรือหมายเลขคิว", "ดูสถานะรอดำเนินการ กำลังจัดเตรียม และพร้อมรับ", "รีเฟรชข้อมูลเมื่อรอสถานะล่าสุด"],
    target: "orders",
  },
];

const roleDefaultGuide = { admin: "home", staff: "pos", user: "orders", guest: "orders" };

function findGuide(query, fallbackId) {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) return guides.find((guide) => guide.id === fallbackId) || guides[0];
  return guides.find((guide) => guide.keywords.some((keyword) => normalized.includes(keyword)))
    || guides.find((guide) => guide.title.toLowerCase().includes(normalized))
    || guides.find((guide) => guide.id === fallbackId)
    || guides[0];
}

export default function SystemAssistant({ role = "guest", view, apiBase, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("");
  const [question, setQuestion] = useState("");
  const [askedQuestion, setAskedQuestion] = useState("");
  const currentGuideId = view === "loyalty-settings" ? "members" : view;
  const [selectedGuideId, setSelectedGuideId] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiError, setAiError] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [messages, setMessages] = useState([]);
  const [pendingScopes, setPendingScopes] = useState([]);
  const [approvedScopes, setApprovedScopes] = useState([]);
  const selectedGuide = useMemo(
    () => findGuide(askedQuestion, selectedGuideId || currentGuideId || roleDefaultGuide[role]),
    [askedQuestion, selectedGuideId, currentGuideId, role],
  );
  const suggestions = role === "user" || role === "guest"
    ? ["ดูสถานะออเดอร์", "ค้นหาคิว", "ประวัติการสั่งซื้อ"]
    : ["เริ่มรับออเดอร์", "ออเดอร์ค้างทำอย่างไร", "ดูสต็อกใกล้หมด", "สรุปยอดขาย"];
  const canNavigate = typeof onNavigate === "function" && role === "admin";
  const dataScopes = [
    { id: "operations", title: "สรุปงานหน้าร้าน", detail: "ออเดอร์ค้าง พร้อมรับ และจำนวนวัตถุดิบใกล้หมด" },
    { id: "finance", title: "สรุปการเงินวันนี้", detail: "จำนวนออเดอร์ รายได้สุทธิ และส่วนลดรวม" },
    { id: "personal_orders", title: "สรุปออเดอร์ของบัญชีนี้", detail: "จำนวนออเดอร์และยอดสุทธิสะสมของบัญชีที่เข้าสู่ระบบ" },
  ];

  const showGuide = (nextQuestion = question) => {
    const prompt = String(nextQuestion || "").trim();
    setQuestion(prompt);
    setAskedQuestion(prompt);
    setSelectedGuideId("");
    setAiAnswer("");
    setAiError("");
  };

  const ask = async (nextQuestion = question) => {
    const prompt = String(nextQuestion || "").trim();
    if (!prompt) return;
    setQuestion(prompt);
    setAskedQuestion(prompt);
    setSelectedGuideId("");
    setAiAnswer("");
    setAiError("");
    if (role === "guest" || !apiBase) return;
    const priorMessages = messages.slice(-6);
    setMessages((current) => [...current, { role: "user", content: prompt }].slice(-12));
    setIsAsking(true);
    try {
      const response = await axios.post(`${apiBase}/api/assistant/chat`, {
        question: prompt, current_view: view, history: priorMessages, context_scopes: approvedScopes,
      });
      const answer = String(response.data?.data?.answer || "").trim();
      if (!response.data?.success || !answer) throw new Error(response.data?.error || "ผู้ช่วยยังไม่สามารถตอบได้");
      setAiAnswer(answer);
      setMessages((current) => [...current, { role: "assistant", content: answer }].slice(-12));
    } catch (error) {
      setAiError(error.response?.data?.error || error.message || "ไม่สามารถติดต่อผู้ช่วย AI ได้");
    } finally {
      setIsAsking(false);
    }
  };

  const chooseMode = (nextMode) => {
    setMode(nextMode);
    setQuestion("");
    setAiAnswer("");
    setAiError("");
    setPendingScopes([]);
    setApprovedScopes([]);
  };

  const togglePendingScope = (scope) => setPendingScopes((current) => current.includes(scope)
    ? current.filter((item) => item !== scope)
    : [...current, scope]);
  const approveScopes = () => setApprovedScopes(pendingScopes);

  return (
    <div className="fixed bottom-4 right-4 z-[90] sm:bottom-6 sm:right-6">
      {open ? (
        <section aria-label="ผู้ช่วย StockPOS" className="mb-3 w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border border-sky-300/30 bg-slate-950/95 shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
          <header className="flex items-start gap-3 border-b border-slate-700/70 bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-4 text-white">
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white/10" aria-hidden="true"><img alt="" className="h-14 w-14 max-w-none object-contain" src={assistantBarista} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">ผู้ช่วย StockPOS</p>
              <p className="mt-0.5 text-xs text-sky-100">{mode === "ai" ? "สนทนากับ AI" : mode === "offline" ? "คู่มือออฟไลน์" : `เลือกวิธีใช้งานสำหรับ${roleLabel[role] || "ผู้ใช้งาน"}`}</p>
            </div>
            {mode ? <button className="rounded-lg bg-white/15 px-2 py-1 text-xs font-bold transition hover:bg-white/25" type="button" onClick={() => chooseMode("")}>เปลี่ยน</button> : null}
            <button aria-label="ปิดผู้ช่วย" className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-lg font-bold transition hover:bg-white/25" type="button" onClick={() => { setOpen(false); chooseMode(""); }}>×</button>
          </header>
          <div className="max-h-[min(66vh,38rem)] overflow-y-auto p-4">
            {!mode ? (
              <section className="space-y-3">
                <p className="text-sm leading-6 text-slate-300">เลือกวิธีที่ต้องการก่อนเริ่มใช้งาน</p>
                <button className="w-full rounded-2xl border border-sky-300/30 bg-sky-500/10 p-4 text-left transition hover:bg-sky-500/20" type="button" onClick={() => chooseMode("offline")}>
                  <span className="block text-sm font-extrabold text-sky-100">คู่มือออฟไลน์</span><span className="mt-1 block text-xs leading-5 text-slate-300">ค้นหาขั้นตอนใช้งานจากคู่มือในระบบ ไม่ส่งข้อความออกไปยัง AI</span>
                </button>
                {role !== "guest" && apiBase ? <button className="w-full rounded-2xl border border-violet-300/30 bg-violet-500/10 p-4 text-left transition hover:bg-violet-500/20" type="button" onClick={() => chooseMode("ai")}>
                  <span className="block text-sm font-extrabold text-violet-100">คุยกับ AI</span><span className="mt-1 block text-xs leading-5 text-slate-300">ถามต่อเนื่องในห้องแชท โดยส่งเฉพาะข้อความที่พิมพ์ถึง Ollama</span>
                </button> : null}
              </section>
            ) : mode === "offline" ? <>
            <label className="sr-only" htmlFor="system-assistant-question">ถามวิธีใช้งานระบบ</label>
            <div className="flex gap-2">
              <input id="system-assistant-question" className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-400 focus:ring-4 focus:ring-sky-500/15" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); showGuide(question); } }} placeholder="ค้นหาคู่มือ เช่น รับออเดอร์อย่างไร" />
              <button className="rounded-xl border border-sky-300/35 bg-sky-500/10 px-3 text-sm font-bold text-sky-100 transition hover:bg-sky-500/20" type="button" onClick={() => showGuide(question)}>คู่มือ</button>
            </div>
            <p className="mt-2 text-xs text-slate-400">ปุ่มคู่มือค้นหาจากข้อมูลในระบบโดยไม่เรียก AI</p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {suggestions.map((suggestion) => <button className="shrink-0 rounded-full border border-sky-400/25 bg-sky-500/10 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20" key={suggestion} type="button" onClick={() => showGuide(suggestion)}>{suggestion}</button>)}
            </div>
            {isAsking ? <div className="mt-4 rounded-2xl border border-sky-400/30 bg-sky-500/10 p-4 text-sm font-semibold text-sky-100">ผู้ช่วยกำลังตรวจสอบคำตอบ...</div> : null}
            {aiError ? <div className="mt-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-100">{aiError}<p className="mt-1 text-xs text-amber-200/80">ด้านล่างเป็นคู่มือใช้งานพื้นฐานของหน้านี้</p></div> : null}
            {aiAnswer ? <article className="mt-4 rounded-2xl border border-sky-400/35 bg-sky-500/10 p-4"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300">คำตอบจากผู้ช่วย AI</p><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-100">{aiAnswer}</p></article> : null}
            <article className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300">คู่มือในระบบ · ไม่ใช้ AI API</p>
              <h2 className="mt-1 text-lg font-bold text-white">{selectedGuide.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">{selectedGuide.summary}</p>
              <ol className="mt-4 space-y-2">
                {selectedGuide.steps.map((step, index) => <li className="flex gap-2 text-sm leading-5 text-slate-200" key={step}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sky-500/20 text-[11px] font-bold text-sky-200">{index + 1}</span><span>{step}</span></li>)}
              </ol>
              {canNavigate && selectedGuide.target ? <button className="mt-4 rounded-xl bg-sky-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-400" type="button" onClick={() => { onNavigate(selectedGuide.target); setOpen(false); }}>ไปที่เมนูนี้</button> : null}
            </article>
            {role === "admin" ? <div className="mt-4"><p className="mb-2 text-xs font-bold text-slate-400">หัวข้อที่พบบ่อย</p><div className="grid grid-cols-2 gap-2">{guides.filter((guide) => ["pos", "kitchen", "tables", "inventory", "menu", "finance", "members"].includes(guide.id)).map((guide) => <button className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs font-semibold text-slate-200 transition hover:border-sky-400/50 hover:bg-sky-500/10" key={guide.id} type="button" onClick={() => { setQuestion(""); setSelectedGuideId(guide.id); }}>{guide.title}</button>)}</div></div> : null}
            </> : (
              <section>
                <div className="rounded-2xl border border-violet-300/25 bg-violet-500/10 p-3 text-xs leading-5 text-violet-100">AI จะได้รับเฉพาะข้อความแชท คู่มือระบบ และข้อมูลสรุปที่คุณเลือกแล้วกดยืนยันด้านล่าง ไม่มีชื่อ เบอร์โทร รายการสินค้า หรือข้อมูลลูกค้ารายบุคคล</div>
                <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-3">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-extrabold text-white">อนุญาตข้อมูลให้ AI</p><span className="text-xs font-semibold text-sky-300">อนุมัติแล้ว {approvedScopes.length}/3</span></div>
                  <div className="mt-3 space-y-2">
                    {dataScopes.map((scope) => <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-700 p-3 transition hover:border-violet-300/40" key={scope.id}><input className="mt-0.5 h-4 w-4 accent-violet-500" type="checkbox" checked={pendingScopes.includes(scope.id)} onChange={() => togglePendingScope(scope.id)} /><span><span className="block text-sm font-bold text-slate-100">{scope.title}</span><span className="mt-0.5 block text-xs leading-5 text-slate-400">{scope.detail}</span></span></label>)}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3"><p className="text-xs leading-5 text-slate-400">สิทธิ์จริงของบัญชียังคงบังคับใช้ เช่น ข้อมูลการเงินสำหรับผู้ที่มีสิทธิ์เท่านั้น</p><button className="shrink-0 rounded-xl bg-violet-500 px-3 py-2 text-xs font-extrabold text-white transition hover:bg-violet-400" type="button" onClick={approveScopes}>ยืนยัน</button></div>
                </div>
                <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1" aria-live="polite">
                  {messages.length ? messages.map((message, index) => <div className={`rounded-2xl p-3 text-sm leading-6 ${message.role === "user" ? "ml-8 bg-sky-500 text-white" : "mr-4 border border-slate-700 bg-slate-900 text-slate-100"}`} key={`${message.role}-${index}`}><p className="mb-1 text-[10px] font-bold uppercase tracking-wider opacity-70">{message.role === "user" ? "คุณ" : "ผู้ช่วย AI"}</p><p className="whitespace-pre-line">{message.content}</p></div>) : <p className="rounded-2xl border border-slate-700 bg-slate-900 p-4 text-sm leading-6 text-slate-300">เริ่มต้นด้วยคำถาม เช่น “ขั้นตอนรับออเดอร์คืออะไร”</p>}
                  {isAsking ? <div className="mr-4 rounded-2xl border border-violet-300/25 bg-violet-500/10 p-3 text-sm text-violet-100">ผู้ช่วยกำลังตอบ...</div> : null}
                </div>
                {aiError ? <div className="mt-3 rounded-2xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">{aiError}</div> : null}
                <label className="sr-only" htmlFor="system-assistant-ai-question">พิมพ์ข้อความถึงผู้ช่วย AI</label>
                <div className="mt-3 flex gap-2"><input id="system-assistant-ai-question" className="min-w-0 flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15" value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); ask(question); } }} placeholder="พิมพ์คำถามหรือคำตอบกลับ AI" /><button className="rounded-xl bg-violet-500 px-3 text-sm font-bold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-70" disabled={isAsking || !question.trim()} type="button" onClick={() => ask(question)}>ส่ง</button></div>
                {messages.length ? <button className="mt-3 text-xs font-bold text-slate-400 underline decoration-slate-600 underline-offset-4 hover:text-white" type="button" onClick={() => { setMessages([]); setAiAnswer(""); setAiError(""); }}>เริ่มบทสนทนาใหม่</button> : null}
              </section>
            )}
          </div>
        </section>
      ) : null}
      <button aria-expanded={open} aria-label="เปิดผู้ช่วย StockPOS" className="group flex h-16 items-center gap-2 rounded-full border border-sky-300/30 bg-gradient-to-br from-sky-500 to-blue-700 py-1 pl-1.5 pr-4 text-sm font-extrabold text-white shadow-xl shadow-sky-950/40 transition hover:-translate-y-0.5 hover:from-sky-400 hover:to-blue-600 focus:outline-none focus:ring-4 focus:ring-sky-300/50" type="button" onClick={() => setOpen((current) => !current)}><span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-sky-950/15"><img alt="" className="h-20 w-20 max-w-none object-contain transition duration-200 group-hover:scale-105" src={assistantBarista} /></span><span className="hidden sm:inline">ถามผู้ช่วย</span></button>
    </div>
  );
}

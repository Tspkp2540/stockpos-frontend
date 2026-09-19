import { useEffect, useMemo, useState } from "react";

const money = (amount) =>
  `฿${Number(amount || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CashShiftDialog({ mode, shift, onClose, onSubmit }) {
  const isClosing = mode === "close";
  const expectedCash = useMemo(
    () => Number(shift?.expected_cash ?? Number(shift?.opening_cash || 0) + Number(shift?.cash_sales || 0)),
    [shift],
  );
  const [amount, setAmount] = useState("0");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const numericAmount = Number(amount);
  const difference = isClosing && Number.isFinite(numericAmount) ? numericAmount - expectedCash : 0;
  const hasDifference = Math.abs(difference) >= 0.005;

  useEffect(() => {
    setAmount(isClosing ? expectedCash.toFixed(2) : "0");
    setNote("");
    setError("");
    setSaving(false);
  }, [expectedCash, isClosing]);

  const submit = async (event) => {
    event.preventDefault();
    if (!String(amount).trim() || !Number.isFinite(numericAmount) || numericAmount < 0) {
      setError("กรุณาระบุจำนวนเงินที่ถูกต้อง");
      return;
    }
    if (isClosing && hasDifference && !note.trim()) {
      setError("กรุณาระบุเหตุผลของยอดเงินที่ต่างก่อนปิดกะ");
      return;
    }
    setError("");
    setSaving(true);
    const saved = await onSubmit?.({
      cash: Number(numericAmount.toFixed(2)),
      note: note.trim(),
    });
    setSaving(false);
    if (saved) onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose?.();
      }}
    >
      <section aria-label={isClosing ? "ปิดกะเงินสด" : "เปิดกะเงินสด"} aria-modal="true" className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-5 shadow-2xl shadow-slate-900/30 sm:p-6" role="dialog">
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${isClosing ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{isClosing ? "สรุปยอดก่อนปิดกะ" : "เริ่มต้นกะใหม่"}</span>
            <h2 className="mt-3 text-xl font-bold text-slate-900">{isClosing ? "ปิดกะเงินสด" : "เปิดกะเงินสด"}</h2>
            <p className="mt-1 text-sm text-slate-500">{isClosing ? "ตรวจนับเงินสดจริงและบันทึกผลต่างก่อนยืนยัน" : "บันทึกเงินทอนและหมายเหตุเริ่มกะ"}</p>
          </div>
          <button aria-label="ปิดหน้าต่าง" className="modal-close grid h-11 w-11 shrink-0 place-items-center rounded-full border border-rose-400 bg-rose-500 text-white transition hover:bg-rose-600 focus:outline-none focus:ring-4 focus:ring-rose-200 disabled:opacity-50" disabled={saving} type="button" onClick={onClose}><svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.8"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></button>
        </div>

        {isClosing ? (
          <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-amber-100 bg-amber-50/60 p-3">
            <div><p className="text-[11px] text-slate-500">เงินทอนเริ่มกะ</p><strong className="mt-1 block text-sm text-slate-800">{money(shift?.opening_cash)}</strong></div>
            <div><p className="text-[11px] text-slate-500">ขายเงินสด</p><strong className="mt-1 block text-sm text-sky-700">{money(shift?.cash_sales)}</strong></div>
            <div><p className="text-[11px] text-slate-500">ยอดที่ควรมี</p><strong className="mt-1 block text-sm text-emerald-700">{money(expectedCash)}</strong></div>
          </div>
        ) : null}

        <form className="mt-5 grid gap-4" onSubmit={submit}>
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            {isClosing ? "ยอดเงินสดที่นับได้" : "เงินทอนเริ่มกะ"}
            <input autoFocus className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" inputMode="decimal" min="0" step="0.01" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          {isClosing ? (
            <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${hasDifference ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>
              ยอดต่าง {difference > 0 ? "+" : ""}{money(difference)}
            </div>
          ) : null}
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            {isClosing ? <>หมายเหตุการปิดกะ {hasDifference ? <span className="text-rose-600">(จำเป็นเมื่อยอดต่าง)</span> : <span className="font-normal text-slate-400">(ไม่บังคับ)</span>}</> : <>หมายเหตุเริ่มกะ <span className="font-normal text-slate-400">(ไม่บังคับ)</span></>}
            <textarea className="min-h-24 w-full resize-y rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-500 focus:ring-4 focus:ring-sky-100" maxLength="500" placeholder={isClosing ? "เช่น เงินทอนขาดจากการนับ หรือเงินเกินจากลูกค้าจ่ายเกิน" : "เช่น เงินทอนเริ่มต้นจากตู้เก็บเงิน"} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50" disabled={saving} type="button" onClick={onClose}>ยกเลิก</button>
            <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${isClosing ? "bg-amber-600 hover:bg-amber-700" : "bg-sky-600 hover:bg-sky-700"}`} disabled={saving} type="submit">{saving ? "กำลังบันทึก…" : isClosing ? "ยืนยันปิดกะ" : "ยืนยันเปิดกะ"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

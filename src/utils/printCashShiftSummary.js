const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const money = (amount) =>
  Number(amount || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const dateTime = (value) =>
  value ? new Date(value).toLocaleString("th-TH") : "-";

export const printCashShiftSummary = (shift) => {
  const reportWindow = window.open("", "_blank", "popup,width=420,height=720");
  if (!reportWindow) return false;

  const expected = Number(shift.expected_cash ?? Number(shift.opening_cash || 0) + Number(shift.cash_sales || 0));
  const difference = Number(shift.difference_amount || 0);
  reportWindow.document.write(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>สรุปปิดกะ #${escapeHtml(shift.id)}</title>
<style>
  @page { margin: 10mm; } * { box-sizing: border-box; } body { color: #172033; font: 14px/1.45 Arial, 'Kanit', sans-serif; margin: 0; } h1 { font-size: 21px; margin: 0; } .center { text-align: center; } .muted { color: #64748b; font-size: 12px; } .rule { border: 0; border-top: 1px dashed #94a3b8; margin: 14px 0; } .summary p { display: flex; justify-content: space-between; gap: 12px; margin: 7px 0; } .total { font-size: 17px; font-weight: 700; } .difference { color: ${difference === 0 ? "#047857" : "#b45309"}; font-weight: 700; } .note { border-radius: 8px; background: #f8fafc; color: #475569; padding: 10px; white-space: pre-line; }
</style></head><body>
  <header class="center"><h1>KIN CHA KAN</h1><p class="muted">สรุปปิดกะเงินสด / Cash Shift Summary</p></header>
  <hr class="rule"><section class="summary"><p><span>เลขที่กะ</span><strong>#${escapeHtml(shift.id)}</strong></p><p><span>ผู้เปิดกะ</span><strong>${escapeHtml(shift.opened_by_name || "-")}</strong></p><p><span>เปิดเมื่อ</span><span>${escapeHtml(dateTime(shift.opened_at))}</span></p><p><span>ผู้ปิดกะ</span><strong>${escapeHtml(shift.closed_by_name || "-")}</strong></p><p><span>ปิดเมื่อ</span><span>${escapeHtml(dateTime(shift.closed_at))}</span></p></section>
  <hr class="rule"><section class="summary"><p><span>เงินทอนเริ่มกะ</span><span>฿${money(shift.opening_cash)}</span></p><p><span>ยอดขายเงินสด</span><span>฿${money(shift.cash_sales)}</span></p><p class="total"><span>ยอดเงินสดที่ควรมี</span><span>฿${money(expected)}</span></p><p><span>ยอดเงินสดที่นับได้</span><span>฿${money(shift.closing_cash)}</span></p><p class="difference"><span>ยอดต่าง</span><span>${difference > 0 ? "+" : ""}฿${money(difference)}</span></p></section>
  ${shift.opening_note ? `<hr class="rule"><p class="muted">หมายเหตุเริ่มกะ</p><div class="note">${escapeHtml(shift.opening_note)}</div>` : ""}
  ${shift.closing_note ? `<hr class="rule"><p class="muted">หมายเหตุปิดกะ</p><div class="note">${escapeHtml(shift.closing_note)}</div>` : ""}
  <hr class="rule"><p class="center muted">พิมพ์เมื่อ ${escapeHtml(new Date().toLocaleString("th-TH"))}</p>
  <script>window.addEventListener('load', () => window.print());</script>
</body></html>`);
  reportWindow.document.close();
  return true;
};

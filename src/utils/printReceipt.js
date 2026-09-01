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

const paymentLabel = (method) =>
  ({ CASH: "เงินสด", QR: "QR พร้อมเพย์", TRANSFER: "โอนเงิน", CARD: "บัตร", OTHER: "อื่น ๆ" }[method] || "ไม่ระบุ");

export const printReceipt = (order) => {
  const receiptWindow = window.open("", "_blank", "popup,width=420,height=720");
  if (!receiptWindow) {
    window.alert("กรุณาอนุญาตหน้าต่างป๊อปอัปเพื่อพิมพ์ใบเสร็จ");
    return;
  }

  const items = Array.isArray(order.rawItems) ? order.rawItems : [];
  const payment = order.payment && typeof order.payment === "object" ? order.payment : {};
  const subtotal = Number(order.subtotal_amount ?? items.reduce(
    (sum, item) => sum + Number(item.unit_price ?? item.price ?? 0) * Number(item.quantity ?? item.qty ?? 0),
    0,
  ));
  const manualDiscount = Number(order.manual_discount_amount || 0);
  const couponDiscount = Number(order.coupon_discount_amount || 0);
  const total = Number(order.gross_amount ?? subtotal - manualDiscount - couponDiscount);
  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const itemRows = items.length
    ? items.map((item) => {
        const quantity = Number(item.quantity ?? item.qty ?? 0);
        const unitPrice = Number(item.unit_price ?? item.price ?? 0);
        const modifierNames = (item.modifiers || []).map((modifier) => modifier.name).filter(Boolean).join(" · ");
        return `<tr><td><strong>${escapeHtml(item.name || "สินค้า")}</strong>${modifierNames ? `<small>${escapeHtml(modifierNames)}</small>` : ""}</td><td>${quantity}</td><td>${money(unitPrice * quantity)}</td></tr>`;
      }).join("")
    : "<tr><td colspan=\"3\">ไม่มีรายละเอียดสินค้า</td></tr>";

  receiptWindow.document.write(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>ใบเสร็จ ${escapeHtml(order.order_no)}</title>
<style>
  @page { margin: 10mm; } * { box-sizing: border-box; } body { color: #172033; font: 14px/1.45 Arial, 'Kanit', sans-serif; margin: 0; } h1 { font-size: 22px; margin: 0; } .center { text-align: center; } .muted { color: #64748b; font-size: 12px; } .rule { border: 0; border-top: 1px dashed #94a3b8; margin: 14px 0; } .meta, .summary { display: grid; gap: 4px; } .summary p { display: flex; justify-content: space-between; margin: 0; } table { border-collapse: collapse; width: 100%; } td { padding: 5px 0; vertical-align: top; } td:nth-child(2) { text-align: center; width: 32px; } td:last-child { text-align: right; white-space: nowrap; } small { color: #64748b; display: block; margin-top: 2px; } .total { font-size: 18px; font-weight: 700; } .thanks { color: #0369a1; font-weight: 700; margin-top: 18px; }
</style></head><body>
  <header class="center"><h1>KIN CHA KAN</h1><p class="muted">ใบเสร็จรับเงิน / Receipt</p></header>
  <hr class="rule"><section class="meta"><div>เลขที่: <strong>#${escapeHtml(order.order_no || "-")}</strong>${order.queue_no ? ` · คิว ${escapeHtml(order.queue_no)}` : ""}</div><div>วันที่: ${escapeHtml(createdAt.toLocaleString("th-TH"))}</div><div>ช่องทาง: ${escapeHtml(order.channel_name || "หน้าร้าน")}</div>${order.customer_nickname || order.customer_name ? `<div>ลูกค้า: ${escapeHtml(order.customer_nickname || order.customer_name)}</div>` : ""}</section>
  <hr class="rule"><table><tbody>${itemRows}</tbody></table>
  <hr class="rule"><section class="summary"><p><span>ยอดก่อนลด</span><span>฿${money(subtotal)}</span></p>${manualDiscount ? `<p><span>ส่วนลดหน้าร้าน</span><span>-฿${money(manualDiscount)}</span></p>` : ""}${couponDiscount ? `<p><span>คูปอง ${escapeHtml(order.coupon_code || "")}</span><span>-฿${money(couponDiscount)}</span></p>` : ""}<p class="total"><span>ยอดสุทธิ</span><span>฿${money(total)}</span></p></section>
  <hr class="rule"><section class="summary"><p><span>ชำระโดย</span><span>${escapeHtml(paymentLabel(payment.payment_method))}</span></p>${payment.payment_method === "CASH" ? `<p><span>รับเงิน</span><span>฿${money(payment.amount_received)}</span></p><p><span>เงินทอน</span><span>฿${money(payment.change_amount)}</span></p>` : ""}</section>
  <p class="center thanks">ขอบคุณที่อุดหนุนครับ</p>
  <script>window.addEventListener('load', () => window.print());</script>
</body></html>`);
  receiptWindow.document.close();
};

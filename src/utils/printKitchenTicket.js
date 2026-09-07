import { loadPrintSettings } from "./printSettings";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const printKitchenTicket = (order) => {
  const kitchenWindow = window.open("", "_blank", "popup,width=420,height=720");
  if (!kitchenWindow) return false;

  const settings = loadPrintSettings();
  const paperWidth = settings.kitchen_paper_width === "58" ? "58mm" : "80mm";
  const createdAt = order.created_at ? new Date(order.created_at) : new Date();
  const items = Array.isArray(order.rawItems) ? order.rawItems : [];
  const itemRows = items.length
    ? items.map((item) => {
      const quantity = Number(item.quantity ?? item.qty ?? 0);
      const modifierNames = (item.modifiers || [])
        .map((modifier) => modifier.name)
        .filter(Boolean)
        .join(" · ");
      return `<li><strong>${escapeHtml(item.name || "สินค้า")} × ${quantity}</strong>${modifierNames ? `<small>${escapeHtml(modifierNames)}</small>` : ""}</li>`;
    }).join("")
    : `<li>${escapeHtml(order.items || "ไม่มีรายละเอียดสินค้า")}</li>`;

  kitchenWindow.document.write(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>ใบครัว ${escapeHtml(order.order_no)}</title>
<style>
  @page { size: ${paperWidth} auto; margin: 3mm; }
  * { box-sizing: border-box; }
  body { width: ${paperWidth}; color: #111827; font: 14px/1.4 Arial, 'Kanit', sans-serif; margin: 0; }
  h1 { font-size: 19px; letter-spacing: .02em; margin: 0; } .center { text-align: center; }
  .muted { color: #475569; font-size: 11px; } .queue { font-size: 28px; font-weight: 900; margin: 8px 0; }
  .rule { border: 0; border-top: 1px dashed #64748b; margin: 10px 0; }
  .meta { display: grid; gap: 3px; font-size: 12px; } ul { list-style: none; margin: 0; padding: 0; }
  li { border-bottom: 1px solid #e2e8f0; font-size: 16px; padding: 9px 0; } li:last-child { border: 0; }
  small { color: #5b21b6; display: block; font-size: 12px; font-weight: 700; margin-top: 3px; }
  .target { color: #64748b; font-size: 10px; margin-top: 12px; }
</style></head><body>
  <header class="center"><h1>KIN CHA KAN</h1><p class="muted">ใบเตรียมสินค้า / KITCHEN TICKET</p></header>
  <p class="queue center">คิว ${escapeHtml(order.queue_no || "-")}</p>
  <section class="meta"><div>เลขที่: <strong>#${escapeHtml(order.order_no || "-")}</strong></div><div>เวลา: ${escapeHtml(createdAt.toLocaleString("th-TH"))}</div><div>ช่องทาง: ${escapeHtml(order.channel_name || "หน้าร้าน")}</div>${order.customer_nickname || order.customer_name ? `<div>ชื่อลูกค้า: ${escapeHtml(order.customer_nickname || order.customer_name)}</div>` : ""}</section>
  <hr class="rule"><ul>${itemRows}</ul>
  ${settings.kitchen_printer_label ? `<p class="target">จุดพิมพ์: ${escapeHtml(settings.kitchen_printer_label)}</p>` : ""}
  <script>window.addEventListener('load', () => window.print());</script>
</body></html>`);
  kitchenWindow.document.close();
  return true;
};

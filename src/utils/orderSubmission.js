export const normalizePhone = (value) => String(value || "").replace(/\D/g, "");

export const createOrderSubmissionFingerprint = (payload = {}, recordDate) =>
  JSON.stringify({
    channel_id: Number(payload.channel_id),
    record_date: payload.record_date || recordDate,
    customer_name: String(payload.customer_name || "").trim(),
    customer_nickname: String(payload.customer_nickname || "").trim(),
    customer_phone: normalizePhone(payload.customer_phone),
    manual_discount_amount: Number(payload.manual_discount_amount) || 0,
    coupon_code: String(payload.coupon_code || "").trim().toUpperCase(),
    loyalty_points_redeemed: Number(payload.loyalty_points_redeemed) || 0,
    table_id: payload.table_id ? Number(payload.table_id) : null,
    payment_method: String(payload.payment_method || "OTHER").toUpperCase(),
    amount_received:
      payload.amount_received === undefined || payload.amount_received === ""
        ? null
        : Number(payload.amount_received),
    payments: Array.isArray(payload.payments)
      ? payload.payments.map((payment) => ({
          payment_method: String(payment?.payment_method || "OTHER").toUpperCase(),
          paid_amount: Number(payment?.paid_amount) || 0,
          amount_received: payment?.amount_received === undefined || payment?.amount_received === ""
            ? null
            : Number(payment.amount_received),
        }))
      : [],
    items: (payload.items || []).map((item) => ({
      product_id: Number(item.product_id),
      qty: Number(item.qty),
      price: Number(item.price),
      modifiers: (item.modifiers || [])
        .map((modifier) => Number(modifier?.option_id ?? modifier))
        .sort((left, right) => left - right),
    })),
  });

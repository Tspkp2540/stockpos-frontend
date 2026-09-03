const sameId = (left, right) => String(left) === String(right);

export const productForChannel = (product, channelId) => {
  const setting = (product?.channel_settings || []).find((item) =>
    sameId(item.channel_id, channelId),
  );
  const configuredPrice = setting?.price_retail;
  const priceRetail = configuredPrice === null || configuredPrice === undefined || configuredPrice === ""
    ? Number(product?.price_retail || 0)
    : Number(configuredPrice);
  return {
    ...product,
    price_retail: Number.isFinite(priceRetail) ? priceRetail : 0,
    channel_available: setting?.is_active !== false,
  };
};

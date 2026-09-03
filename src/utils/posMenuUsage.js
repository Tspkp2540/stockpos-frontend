const STORAGE_KEY = "stockpos.pos-menu-usage";

export const loadPosMenuUsage = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
};

export const recordPosMenuUsage = (current, productId) => {
  const key = String(productId);
  const next = {
    ...current,
    [key]: Math.min(9999, Number(current?.[key] || 0) + 1),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The POS remains usable if browser storage is unavailable.
  }
  return next;
};

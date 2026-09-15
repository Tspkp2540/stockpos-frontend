const STORAGE_KEY = "stockpos.pos-menu-usage";
const FAVORITES_KEY = "stockpos.pos-menu-favorites";

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

export const loadPosMenuFavorites = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "[]");
    return Array.isArray(saved) ? saved.map(String) : [];
  } catch {
    return [];
  }
};

export const togglePosMenuFavorite = (current, productId) => {
  const id = String(productId);
  const next = current.includes(id)
    ? current.filter((value) => value !== id)
    : [...current, id];
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
  } catch {
    // Favorites are optional and must never block a sale.
  }
  return next;
};

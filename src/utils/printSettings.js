const storageKey = "stockpos.print-settings";

export const defaultPrintSettings = Object.freeze({
  receipt_paper_width: "80",
  kitchen_paper_width: "80",
  receipt_printer_label: "",
  kitchen_printer_label: "",
});

const normalizeSettings = (value) => ({
  ...defaultPrintSettings,
  ...(value && typeof value === "object" ? value : {}),
});

export const loadPrintSettings = () => {
  try {
    return normalizeSettings(JSON.parse(window.localStorage.getItem(storageKey) || "{}"));
  } catch {
    return { ...defaultPrintSettings };
  }
};

export const savePrintSettings = (settings) => {
  const next = normalizeSettings(settings);
  window.localStorage.setItem(storageKey, JSON.stringify(next));
  return next;
};

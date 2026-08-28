export const maskPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `${"x".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

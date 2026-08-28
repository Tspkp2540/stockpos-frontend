import * as XLSX from "xlsx";

const safeValue = (value) => {
  if (value === null || value === undefined) return "";
  return typeof value === "string" && /^[=+\-@]/.test(value) ? `'${value}` : value;
};

const widthFor = (column, rows) => Math.min(42, Math.max(
  column.label.length + 2,
  ...rows.map((row) => String(safeValue(row[column.key])).length + 2),
));

export function exportExcel({ filename, sheets }) {
  const workbook = XLSX.utils.book_new();

  sheets.forEach(({ name, columns, rows }) => {
    const worksheetRows = [
      columns.map((column) => column.label),
      ...rows.map((row) => columns.map((column) => safeValue(row[column.key]))),
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
    worksheet["!cols"] = columns.map((column) => ({ wch: widthFor(column, rows) }));
    worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: columns.length - 1 } }) };
    XLSX.utils.book_append_sheet(workbook, worksheet, name);
  });

  XLSX.writeFile(workbook, filename, { compression: true });
}

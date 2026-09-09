import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultPrintSettings, loadPrintSettings, savePrintSettings } from "./printSettings";

const storage = new Map();

afterEach(() => {
  storage.clear();
  vi.unstubAllGlobals();
});

const mockStorage = () => vi.stubGlobal("window", {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
});

describe("print settings", () => {
  it("merges saved printer preferences with safe defaults", () => {
    mockStorage();
    expect(savePrintSettings({ receipt_paper_width: '58', receipt_printer_label: 'Counter' }))
      .toMatchObject({ ...defaultPrintSettings, receipt_paper_width: '58', receipt_printer_label: 'Counter' });
    expect(loadPrintSettings().receipt_paper_width).toBe('58');
  });

  it("falls back to defaults when stored data is invalid", () => {
    mockStorage();
    storage.set('stockpos.print-settings', '{invalid');
    expect(loadPrintSettings()).toEqual({ ...defaultPrintSettings });
  });
});

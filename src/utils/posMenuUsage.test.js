import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPosMenuUsage, recordPosMenuUsage } from "./posMenuUsage";

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

describe("POS menu usage", () => {
  it("stores and reloads a selected menu count", () => {
    mockStorage();
    expect(recordPosMenuUsage({}, 9)).toEqual({ 9: 1 });
    expect(loadPosMenuUsage()).toEqual({ 9: 1 });
  });

  it("caps a repeated count and survives unavailable browser storage", () => {
    mockStorage();
    expect(recordPosMenuUsage({ 9: 9999 }, 9)).toEqual({ 9: 9999 });
    vi.stubGlobal("window", { localStorage: { getItem: () => '{bad json', setItem: () => { throw new Error('blocked'); } } });
    expect(loadPosMenuUsage()).toEqual({});
    expect(recordPosMenuUsage({}, 3)).toEqual({ 3: 1 });
  });
});

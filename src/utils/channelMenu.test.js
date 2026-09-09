import { describe, expect, it } from "vitest";
import { productForChannel } from "./channelMenu";

describe("productForChannel", () => {
  it("uses the base product price when no channel-specific price is configured", () => {
    expect(productForChannel({ id: 1, price_retail: 55 }, 2)).toMatchObject({ price_retail: 55, channel_available: true });
  });

  it("uses a configured channel price and availability", () => {
    expect(productForChannel({ price_retail: 55, channel_settings: [{ channel_id: '2', price_retail: '65', is_active: false }] }, 2))
      .toMatchObject({ price_retail: 65, channel_available: false });
  });

  it("fails safe to zero when a configured price is invalid", () => {
    expect(productForChannel({ price_retail: 'not-a-price', channel_settings: [{ channel_id: 2, price_retail: 'invalid' }] }, 2).price_retail).toBe(0);
  });
});

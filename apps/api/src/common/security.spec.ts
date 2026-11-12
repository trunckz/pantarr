import { trustProxy } from "./security";

describe("client address behind proxies", () => {
  it("trusts the reverse proxy right in front, when its address is private", () => {
    expect(trustProxy("10.20.0.2", 0)).toBe(true);
    expect(trustProxy("::ffff:192.168.10.10", 0)).toBe(true);
    expect(trustProxy("203.0.113.9", 0)).toBe(false);
  });
  it("trusts Cloudflare at any hop, never a private address further away (a LAN client faking its address)", () => {
    expect(trustProxy("188.114.97.2", 1)).toBe(true);
    expect(trustProxy("2a06:98c1:3121::2", 1)).toBe(true);
    expect(trustProxy("192.168.10.50", 1)).toBe(false);
    expect(trustProxy("203.0.113.9", 1)).toBe(false);
  });
});

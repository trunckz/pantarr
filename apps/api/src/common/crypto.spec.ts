process.env.PANTARR_SECRET = "x".repeat(40);
import { decrypt, encrypt } from "./crypto";

describe("connector secrets encryption", () => {
  it("round-trips a value", () => {
    expect(decrypt(encrypt({ token: "abc", n: 1 }))).toEqual({ token: "abc", n: 1 });
  });
  it("uses a new IV each time", () => {
    expect(encrypt({ a: 1 })).not.toEqual(encrypt({ a: 1 }));
  });
  it("returns nothing for tampered or empty data", () => {
    const blob = encrypt({ token: "abc" });
    const [iv, tag, data] = blob.split(".");
    expect(decrypt([iv, tag, Buffer.from("other").toString("base64")].join("."))).toEqual({});
    expect(decrypt(data)).toEqual({});
    expect(decrypt(null)).toEqual({});
  });
});

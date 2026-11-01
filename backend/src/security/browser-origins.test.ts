import { describe, expect, it } from "vitest";
import { isAllowedBrowserOrigin } from "./browser-origins.js";

describe("browser origin policy", () => {
  const development = {
    NODE_ENV: "development",
    FRONTEND_URL: "http://localhost:5173",
  };

  it("allows exact configured origins", () => {
    expect(
      isAllowedBrowserOrigin("http://localhost:5173", development),
    ).toBe(true);
  });

  it.each([
    "http://localhost:5181",
    "http://127.0.0.1:5181",
    "http://[::1]:5181",
  ])("allows loopback origins with development ports (%s)", (origin) => {
    expect(isAllowedBrowserOrigin(origin, development)).toBe(true);
  });

  it.each([
    "https://localhost:5181",
    "http://localhost.attacker.example",
    "http://192.168.1.10:5181",
    "null",
  ])("rejects non-loopback or non-http development origins (%s)", (origin) => {
    expect(isAllowedBrowserOrigin(origin, development)).toBe(false);
  });

  it("does not allow arbitrary loopback ports in production", () => {
    expect(
      isAllowedBrowserOrigin("http://localhost:5181", {
        ...development,
        NODE_ENV: "production",
      }),
    ).toBe(false);
  });
});

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type {
  FacilityDirectoryProvider,
  HealthcareFacility,
} from "../facilities/directory.js";
import { isValidFacility } from "../facilities/directory.js";
import { createFacilitiesRouter } from "./facilities.js";

const verifiedFacility: HealthcareFacility = {
  id: "facility-1",
  name: "Verified Health Center",
  address: "Address from an official directory",
  area: "Addis Ababa",
  type: "health_center",
  phone: null,
  sourceUrl: "https://example.org/facilities",
  mapUrl: null,
  verifiedAt: "2026-10-31",
  verificationStatus: "verified",
};

function createTestApp(provider?: FacilityDirectoryProvider) {
  const app = express();
  app.use("/api/v1/facilities", createFacilitiesRouter(provider));
  return app;
}

describe("verified facility directory API", () => {
  it("fails closed when no verified directory provider is configured", async () => {
    const response = await request(createTestApp()).get(
      "/api/v1/facilities?area=Addis%20Ababa",
    );

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: "error",
      code: "FACILITY_DATA_UNAVAILABLE",
      message: "Verified facility information is not available yet.",
    });
  });

  it("validates filters and returns provider-backed verified fields", async () => {
    const provider: FacilityDirectoryProvider = {
      search: vi.fn().mockResolvedValue({
        items: [verifiedFacility],
        total: 1,
      }),
    };

    const response = await request(createTestApp(provider)).get(
      "/api/v1/facilities?area=Addis%20Ababa&type=health_center&limit=5",
    );

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([verifiedFacility]);
    expect(provider.search).toHaveBeenCalledWith({
      area: "Addis Ababa",
      type: "health_center",
      limit: 5,
      offset: 0,
    });
  });

  it("rejects invalid filters before calling the provider", async () => {
    const provider: FacilityDirectoryProvider = {
      search: vi.fn(),
    };

    const response = await request(createTestApp(provider)).get(
      "/api/v1/facilities?type=emergency_department&limit=500",
    );

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("VALIDATION_ERROR");
    expect(provider.search).not.toHaveBeenCalled();
  });

  it("rejects repeated query parameters instead of silently dropping a filter", async () => {
    const provider: FacilityDirectoryProvider = {
      search: vi.fn(),
    };

    const response = await request(createTestApp(provider)).get(
      "/api/v1/facilities?type=clinic&type=hospital",
    );

    expect(response.status).toBe(400);
    expect(provider.search).not.toHaveBeenCalled();
  });

  it("rejects provider records with unsafe links or missing verification evidence", async () => {
    const provider: FacilityDirectoryProvider = {
      search: vi.fn().mockResolvedValue({
        items: [{
          ...verifiedFacility,
          sourceUrl: "http://unverified.example",
        }],
        total: 1,
      }),
    };

    const response = await request(createTestApp(provider)).get(
      "/api/v1/facilities",
    );

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("FACILITY_DATA_INVALID");
  });

  it("rejects provider records with invalid verification dates", async () => {
    const provider: FacilityDirectoryProvider = {
      search: vi.fn().mockResolvedValue({
        items: [
          {
            ...verifiedFacility,
            verifiedAt: "2026-02-31",
          },
        ],
        total: 1,
      }),
    };

    const response = await request(createTestApp(provider)).get(
      "/api/v1/facilities",
    );

    expect(response.status).toBe(502);
    expect(response.body.code).toBe("FACILITY_DATA_INVALID");
  });

  it("accepts only documented facility categories", () => {
    expect(
      isValidFacility({
        ...verifiedFacility,
        type: "emergency_department",
      }),
    ).toBe(false);
  });
});

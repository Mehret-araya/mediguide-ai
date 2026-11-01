import { Router } from "express";
import {
  FACILITY_TYPES,
  FacilityDirectoryUnavailableError,
  isValidFacility,
  type FacilityDirectoryProvider,
  type FacilitySearch,
} from "../facilities/directory.js";

function parseSearch(query: Record<string, unknown>): FacilitySearch | null {
  const areaValue = query.area;
  const typeValue = query.type;
  const limitValue = query.limit;
  const offsetValue = query.offset;
  if (
    (areaValue !== undefined && typeof areaValue !== "string") ||
    (typeValue !== undefined && typeof typeValue !== "string")
  ) {
    return null;
  }

  const area = typeof areaValue === "string" ? areaValue.trim() : undefined;
  const type = typeof typeValue === "string" ? typeValue.trim() : undefined;
  const limit = parseInteger(limitValue, 20);
  const offset = parseInteger(offsetValue, 0);

  if (
    (area !== undefined && (area.length === 0 || area.length > 120)) ||
    (type !== undefined && !FACILITY_TYPES.has(type)) ||
    limit === null ||
    limit < 1 ||
    limit > 50 ||
    offset === null ||
    offset < 0 ||
    offset > 10000
  ) {
    return null;
  }

  return {
    ...(area ? { area } : {}),
    ...(type ? { type } : {}),
    limit,
    offset,
  };
}

function parseInteger(value: unknown, fallback: number): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function createFacilitiesRouter(
  provider?: FacilityDirectoryProvider,
): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    const search = parseSearch(request.query);
    if (!search) {
      response.status(400).json({
        status: "error",
        code: "VALIDATION_ERROR",
        message: "The facility search filters are invalid.",
      });
      return;
    }

    if (!provider) {
      response.status(503).json({
        status: "error",
        code: "FACILITY_DATA_UNAVAILABLE",
        message: "Verified facility information is not available yet.",
      });
      return;
    }

    try {
      const result = await provider.search(search);
      if (
        !Array.isArray(result.items) ||
        !result.items.every(isValidFacility) ||
        !Number.isSafeInteger(result.total) ||
        result.total < result.items.length
      ) {
        response.status(502).json({
          status: "error",
          code: "FACILITY_DATA_INVALID",
          message: "Facility information could not be verified.",
        });
        return;
      }

      response.status(200).json({
        status: "ok",
        items: result.items,
        total: result.total,
        limit: search.limit,
        offset: search.offset,
      });
    } catch (error) {
      const unavailable = error instanceof FacilityDirectoryUnavailableError;
      console.error("Facility directory request failed:", {
        failure: unavailable ? "unavailable" : "provider",
      });
      response.status(503).json({
        status: "error",
        code: "FACILITY_DATA_UNAVAILABLE",
        message: "Verified facility information is not available right now.",
      });
    }
  });

  return router;
}

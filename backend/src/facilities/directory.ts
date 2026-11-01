export type FacilityVerificationStatus =
  | "verified"
  | "unverified"
  | "outdated";
export type FacilityType =
  | "clinic"
  | "health_center"
  | "hospital"
  | "other";

export const FACILITY_TYPES: ReadonlySet<string> = new Set([
  "clinic",
  "health_center",
  "hospital",
  "other",
]);

export interface HealthcareFacility {
  id: string;
  name: string;
  address: string;
  area: string | null;
  type: FacilityType;
  phone: string | null;
  sourceUrl: string | null;
  mapUrl: string | null;
  verifiedAt: string | null;
  verificationStatus: FacilityVerificationStatus;
}

export interface FacilitySearch {
  area?: string;
  type?: string;
  limit: number;
  offset: number;
}

export interface FacilitySearchResult {
  items: HealthcareFacility[];
  total: number;
}

export interface FacilityDirectoryProvider {
  search(input: FacilitySearch): Promise<FacilitySearchResult>;
}

export class FacilityDirectoryUnavailableError extends Error {
  constructor() {
    super("A verified healthcare facility directory is not configured.");
    this.name = "FacilityDirectoryUnavailableError";
  }
}

export function isSafeHttpsUrl(value: unknown): value is string | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function isValidFacility(value: unknown): value is HealthcareFacility {
  if (!isRecord(value)) {
    return false;
  }

  if (
    typeof value.id !== "string" ||
    value.id.trim().length === 0 ||
    typeof value.name !== "string" ||
    value.name.trim().length === 0 ||
    typeof value.address !== "string" ||
    value.address.trim().length === 0 ||
    (value.area !== null && typeof value.area !== "string") ||
    typeof value.type !== "string" ||
    !FACILITY_TYPES.has(value.type) ||
    (value.phone !== null && typeof value.phone !== "string") ||
    (value.verifiedAt !== null && typeof value.verifiedAt !== "string") ||
    !["verified", "unverified", "outdated"].includes(
      String(value.verificationStatus),
    ) ||
    !isSafeHttpsUrl(value.sourceUrl) ||
    !isSafeHttpsUrl(value.mapUrl)
  ) {
    return false;
  }

  if (value.verificationStatus === "verified") {
    if (
      value.sourceUrl === null ||
      typeof value.sourceUrl !== "string" ||
      value.verifiedAt === null ||
      typeof value.verifiedAt !== "string" ||
      !isValidDate(value.verifiedAt)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Geolocation helpers for attendance clock-in.
 *
 * The browser reports raw GPS coordinates; we reverse-geocode them to a
 * human-readable address (best-effort) using OpenStreetMap's Nominatim, which
 * needs no API key. Everything here is non-fatal: if coordinates are missing or
 * the geocode lookup fails, we simply store what we have (or nothing).
 */

export interface ClockInLocationInput {
  latitude?: unknown;
  longitude?: unknown;
  accuracy?: unknown;
}

export interface ClockInLocation {
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
}

const EMPTY_LOCATION: ClockInLocation = {
  latitude: null,
  longitude: null,
  accuracy: null,
  address: null,
};

/** Coerce a value to a finite number within [min, max], else null. */
function toCoord(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" ? Number(value) : (value as number);
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) {
    return null;
  }
  return n;
}

/**
 * Reverse-geocode coordinates to a display address via Nominatim.
 * Returns null on any failure (network, rate-limit, bad response, timeout).
 */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
      `&lat=${lat}&lon=${lon}&zoom=18&addressdetails=0`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Nominatim's usage policy requires an identifying User-Agent.
        "User-Agent": "Zithspace-Attendance/1.0 (support@zithspace.com)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const address = data?.display_name;
    return typeof address === "string" && address.trim() ? address.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Validates incoming coordinates and resolves an address for them.
 * Best-effort: invalid/absent coordinates yield an all-null location, and a
 * failed geocode still keeps the coordinates.
 */
export async function resolveClockInLocation(
  input: ClockInLocationInput | undefined | null,
): Promise<ClockInLocation> {
  if (!input) return { ...EMPTY_LOCATION };

  const latitude = toCoord(input.latitude, -90, 90);
  const longitude = toCoord(input.longitude, -180, 180);
  const accuracy = toCoord(input.accuracy, 0, Number.MAX_SAFE_INTEGER);

  if (latitude === null || longitude === null) {
    return { ...EMPTY_LOCATION };
  }

  const address = await reverseGeocode(latitude, longitude);
  return { latitude, longitude, accuracy, address };
}

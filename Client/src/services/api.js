const MOVIE_API_PATH = "/api/movies";
const SCREENING_API_PATH = "/api/screenings";
const BOOKING_API_PATH = "/api/bookings";
const PROMOTION_API_PATH = "/api/promotions";
const ADD_ON_API_PATH = "/api/addons";
const SERVER_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL || "http://localhost:3000";

class ApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ApiError";
    this.status = options.status || 0;
    this.payload = options.payload || null;
    this.details = options.payload || null;
  }
}

function toQueryString(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });

  const queryString = query.toString();
  return queryString ? `?${queryString}` : "";
}

async function parseJsonResponse(response, fallbackMessage) {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error || payload?.message || fallbackMessage;
    const apiError = new ApiError(message, {
      status: response.status,
      payload
    });

    if (Array.isArray(payload?.conflictedSeats)) {
      apiError.conflictedSeats = payload.conflictedSeats;
    }

    if (Array.isArray(payload?.invalidSeats)) {
      apiError.invalidSeats = payload.invalidSeats;
    }

    throw apiError;
  }

  return payload;
}

export async function fetchMovies(params = {}) {
  const response = await fetch(`${MOVIE_API_PATH}${toQueryString(params)}`);
  const payload = await parseJsonResponse(response, "Failed to fetch movies");
  return payload.items || [];
}

export async function fetchMovieById(id) {
  const response = await fetch(`${MOVIE_API_PATH}/${id}`);
  const payload = await parseJsonResponse(response, "Failed to fetch movie");
  return payload.item || null;
}

export async function fetchScreeningSeatPreview(id) {
  const response = await fetch(`${SCREENING_API_PATH}/${id}/seat-preview`);
  const payload = await parseJsonResponse(response, "Failed to fetch screening seat preview");
  return payload.item || null;
}

export async function fetchPromotions(params = {}) {
  const response = await fetch(`${PROMOTION_API_PATH}${toQueryString(params)}`);
  const payload = await parseJsonResponse(response, "Failed to fetch promotions");
  return payload.items || [];
}

export async function fetchAddOns(params = {}) {
  const response = await fetch(`${ADD_ON_API_PATH}${toQueryString(params)}`);
  const payload = await parseJsonResponse(response, "Failed to fetch add-ons");
  return payload.items || [];
}

export async function createBooking(payload) {
  const response = await fetch(BOOKING_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  return parseJsonResponse(response, "Failed to create booking");
}

export async function releaseBookingHold(bookingId) {
  const response = await fetch(`${BOOKING_API_PATH}/${bookingId}/release`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  return parseJsonResponse(response, "Failed to release booking hold");
}

export function releaseBookingHoldBestEffort(bookingId) {
  const id = (bookingId || "").toString().trim();
  if (!id) return;

  const endpoint = `${BOOKING_API_PATH}/${id}/release`;

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const payload = new Blob(["{}"], { type: "application/json" });
      const sent = navigator.sendBeacon(endpoint, payload);
      if (sent) return;
    }
  } catch (_error) {
    // Ignore and fall back to fetch keepalive.
  }

  try {
    fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: "{}",
      keepalive: true
    }).catch(() => null);
  } catch (_error) {
    // Ignore best-effort release failure.
  }
}

export async function extendBookingHold(bookingId) {
  const response = await fetch(`${BOOKING_API_PATH}/${bookingId}/extend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  return parseJsonResponse(response, "Failed to extend booking hold");
}

export function resolveMoviePictureUrl(pictureUrl) {
  const trimmed = (pictureUrl || "").toString().trim();

  if (!trimmed) {
    return `${SERVER_BASE_URL}/images/placeholder.jpg`;
  }

  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("data:")) {
    return trimmed;
  }

  if (trimmed.startsWith("/")) {
    return `${SERVER_BASE_URL}${trimmed}`;
  }

  return trimmed;
}

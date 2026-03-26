const MOVIE_API_PATH = "/api/movies";
const SCREENING_API_PATH = "/api/screenings";
const BOOKING_API_PATH = "/api/bookings";
const SERVER_BASE_URL = import.meta.env.VITE_SERVER_BASE_URL || "http://localhost:3000";

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
    throw new Error(payload?.error || payload?.message || fallbackMessage);
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

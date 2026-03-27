const BOOKING_PIPELINE_SESSION_KEY = "cinevillage_booking_pipeline_session";

function toIsoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

export function readBookingPipelineSession() {
  try {
    const raw = window.sessionStorage.getItem(BOOKING_PIPELINE_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const bookingId = (parsed.bookingId || "").toString().trim();
    const screeningId = (parsed.screeningId || "").toString().trim();
    const movieId = (parsed.movieId || "").toString().trim();
    const expiresAt = toIsoDate(parsed.expiresAt);

    if (!bookingId || !screeningId || !expiresAt) return null;

    return {
      bookingId,
      screeningId,
      movieId,
      expiresAt
    };
  } catch (_error) {
    return null;
  }
}

export function saveBookingPipelineSession(session) {
  if (!session || typeof session !== "object") return;

  const normalized = {
    bookingId: (session.bookingId || "").toString().trim(),
    screeningId: (session.screeningId || "").toString().trim(),
    movieId: (session.movieId || "").toString().trim(),
    expiresAt: toIsoDate(session.expiresAt)
  };

  if (!normalized.bookingId || !normalized.screeningId || !normalized.expiresAt) return;

  window.sessionStorage.setItem(BOOKING_PIPELINE_SESSION_KEY, JSON.stringify(normalized));
}

export function clearBookingPipelineSession() {
  window.sessionStorage.removeItem(BOOKING_PIPELINE_SESSION_KEY);
}

export function getSessionRemainingMs(session, now = new Date()) {
  if (!session?.expiresAt) return 0;
  const expiresAt = new Date(session.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return 0;
  return Math.max(expiresAt.getTime() - now.getTime(), 0);
}

export function hasActiveBookingPipelineSession() {
  const session = readBookingPipelineSession();
  if (!session) return false;
  return getSessionRemainingMs(session, new Date()) > 0;
}

export function formatRemainingMmSs(remainingMs) {
  const totalSeconds = Math.max(Math.floor(remainingMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function buildCountdownDigitsFromRemainingMs(remainingMs) {
  const totalSeconds = Math.max(Math.floor(remainingMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;

  return `${String(hours).padStart(2, "0")}${String(minutePart).padStart(2, "0")}${String(seconds).padStart(2, "0")}`.split("");
}

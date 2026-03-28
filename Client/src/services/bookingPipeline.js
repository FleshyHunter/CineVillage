const BOOKING_PIPELINE_SESSION_KEY = "cinevillage_booking_pipeline_session";
export const BOOKING_TIMER_INITIAL_MS = 15 * 60 * 1000;
export const BOOKING_TIMER_EXTEND_MS = 5 * 60 * 1000;
export const BOOKING_FEE_DEFAULT = 2;
const ADD_ON_TYPE_ALA_CARTE = "ala_carte";
const ADD_ON_TYPE_COMBO = "combo";
const PAYMENT_METHOD_GOOGLE_PAY = "google_pay";
const PAYMENT_METHOD_VISA_MASTERCARD = "visa_mastercard";
const PAYMENT_METHOD_AMEX = "amex";
const PAYMENT_METHODS = new Set([
  PAYMENT_METHOD_GOOGLE_PAY,
  PAYMENT_METHOD_VISA_MASTERCARD,
  PAYMENT_METHOD_AMEX
]);

function toIsoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
}

function normalizeText(value) {
  return (value || "").toString().trim();
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function normalizeSeatLabels(seats = []) {
  if (!Array.isArray(seats)) return [];

  const seen = new Set();
  const normalized = [];

  seats.forEach((seat) => {
    const seatLabel = normalizeText(seat).toUpperCase();
    if (!seatLabel || seen.has(seatLabel)) return;
    seen.add(seatLabel);
    normalized.push(seatLabel);
  });

  return normalized;
}

function normalizeAddOnType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === ADD_ON_TYPE_COMBO) return ADD_ON_TYPE_COMBO;
  return ADD_ON_TYPE_ALA_CARTE;
}

function normalizePromo(promo) {
  if (!promo || typeof promo !== "object") return null;

  const id = normalizeText(promo.id || promo._id);
  const name = normalizeText(promo.name);
  const code = normalizeText(promo.code);
  const discountType = normalizeText(promo.discountType || promo.type).toLowerCase() || "";
  const discountValue = normalizeNonNegativeNumber(promo.discountValue, 0);
  const discountAmount = normalizeNonNegativeNumber(promo.discountAmount, 0);

  if (!id && !name && !code && discountValue <= 0 && discountAmount <= 0) {
    return null;
  }

  return {
    id: id || "",
    name: name || "",
    code: code || "",
    discountType,
    discountValue,
    discountAmount
  };
}

function normalizeAddOns(addons = []) {
  if (!Array.isArray(addons)) return [];

  return addons
    .map((addon) => {
      if (!addon || typeof addon !== "object") return null;

      const id = normalizeText(addon.id || addon._id);
      const name = normalizeText(addon.name);
      const qty = Math.max(0, Number.parseInt(addon.qty, 10) || 0);
      const price = normalizeNonNegativeNumber(addon.price, 0);
      const image = normalizeText(addon.image || addon.pictureUrl);
      const description = normalizeText(addon.description);

      if (!id && !name) return null;
      if (qty <= 0) return null;

      return {
        id: id || name,
        name: name || "Add-on",
        type: normalizeAddOnType(addon.type),
        price,
        qty,
        image,
        description
      };
    })
    .filter(Boolean);
}

function normalizeContactInfo(contactInfo) {
  if (!contactInfo || typeof contactInfo !== "object") {
    return {
      name: "",
      email: ""
    };
  }

  return {
    name: normalizeText(contactInfo.name),
    email: normalizeText(contactInfo.email)
  };
}

function normalizePaymentMethod(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!PAYMENT_METHODS.has(normalized)) return "";
  return normalized;
}

function normalizeBookingPipelineSession(input = {}) {
  const screeningId = normalizeText(input.screeningId);
  const expiresAt = toIsoDate(input.expiresAt);
  if (!screeningId || !expiresAt) return null;

  const selectedSeats = normalizeSeatLabels(input.selectedSeats);
  const ticketPrice = normalizeNonNegativeNumber(input.ticketPrice, 0);
  const seatCountFallback = selectedSeats.length || 0;
  const parsedSeatCount = Number.parseInt(input.seatCount, 10);
  const seatCount = Number.isInteger(parsedSeatCount) && parsedSeatCount >= 0
    ? parsedSeatCount
    : seatCountFallback;

  return {
    bookingId: normalizeText(input.bookingId),
    screeningId,
    movieId: normalizeText(input.movieId),
    stage: normalizeText(input.stage) || "seat-selection",
    lowTimePrompted: Boolean(input.lowTimePrompted),
    expiresAt,
    selectedSeats,
    seatCount,
    ticketPrice,
    seatType: normalizeText(input.seatType) || "Standard",
    ticketType: normalizeText(input.ticketType) || "Adult",
    bookingFee: normalizeNonNegativeNumber(input.bookingFee, BOOKING_FEE_DEFAULT),
    promo: normalizePromo(input.promo),
    addons: normalizeAddOns(input.addons),
    contactInfo: normalizeContactInfo(input.contactInfo),
    paymentMethod: normalizePaymentMethod(input.paymentMethod)
  };
}

export function readBookingPipelineSession() {
  try {
    const raw = window.sessionStorage.getItem(BOOKING_PIPELINE_SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return normalizeBookingPipelineSession(parsed);
  } catch (_error) {
    return null;
  }
}

export function saveBookingPipelineSession(session) {
  const normalized = normalizeBookingPipelineSession(session);
  if (!normalized) return;

  window.sessionStorage.setItem(BOOKING_PIPELINE_SESSION_KEY, JSON.stringify(normalized));
}

export function createStageOneBookingSession({ screeningId, movieId = "" }) {
  const now = Date.now();
  return {
    bookingId: "",
    screeningId: (screeningId || "").toString().trim(),
    movieId: (movieId || "").toString().trim(),
    stage: "seat-selection",
    lowTimePrompted: false,
    expiresAt: new Date(now + BOOKING_TIMER_INITIAL_MS).toISOString(),
    selectedSeats: [],
    seatCount: 0,
    ticketPrice: 0,
    seatType: "Standard",
    ticketType: "Adult",
    bookingFee: BOOKING_FEE_DEFAULT,
    promo: null,
    addons: [],
    contactInfo: {
      name: "",
      email: ""
    },
    paymentMethod: ""
  };
}

export function updateBookingPipelineSession(patch = {}) {
  const current = readBookingPipelineSession();
  if (!current) return null;

  const next = {
    ...current,
    ...patch
  };

  saveBookingPipelineSession(next);
  return next;
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
  return formatRemainingMmSs(remainingMs).split("");
}

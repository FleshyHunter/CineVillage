const { doesScreeningOverlapMaintenance } = require("../public/js/hallStatus");
const {
  isScreeningPurchasableByTime,
  getScreeningPurchaseWindowClosedMessage
} = require("./screeningPurchaseWindow");

const BOOKABLE_SCREENING_STATUSES = new Set(["published", "scheduled", "ongoing"]);

function normalizeLower(value) {
  return (value || "").toString().trim().toLowerCase();
}

function sanitizeText(value) {
  return (value || "").toString().trim();
}

function sanitizeId(value) {
  const text = sanitizeText(value);
  if (!text) return "";
  return text;
}

function getScreeningMaintenanceImpact(screening = {}, hall = null) {
  if (!screening || !hall) return false;
  const startDateTime = screening?.startDateTime ? new Date(screening.startDateTime) : null;
  const endDateTime = screening?.endDateTime ? new Date(screening.endDateTime) : null;
  if (!startDateTime || !endDateTime) return false;
  if (Number.isNaN(startDateTime.getTime()) || Number.isNaN(endDateTime.getTime())) return false;
  return doesScreeningOverlapMaintenance(hall, startDateTime, endDateTime);
}

function evaluateScreeningBookability({ screening = null, hall = null, now = new Date() } = {}) {
  if (!screening) {
    return {
      bookable: false,
      reasonCode: "SCREENING_NOT_FOUND",
      message: "Screening not found."
    };
  }

  const normalizedStatus = normalizeLower(screening.status);
  if (!BOOKABLE_SCREENING_STATUSES.has(normalizedStatus)) {
    return {
      bookable: false,
      reasonCode: "SCREENING_STATUS_UNAVAILABLE",
      message: "This screening is not open for booking."
    };
  }

  if (getScreeningMaintenanceImpact(screening, hall)) {
    return {
      bookable: false,
      reasonCode: "HALL_UNDER_MAINTENANCE",
      message: "This screening is temporarily unavailable due to hall maintenance."
    };
  }

  if (!isScreeningPurchasableByTime(screening, now)) {
    return {
      bookable: false,
      reasonCode: "SCREENING_PURCHASE_WINDOW_CLOSED",
      message: getScreeningPurchaseWindowClosedMessage()
    };
  }

  return {
    bookable: true,
    reasonCode: "",
    message: ""
  };
}

function buildClientMovieDetailsHash(movieId = "") {
  const normalizedMovieId = sanitizeId(movieId);
  if (!normalizedMovieId) return "#movies";
  return `#movie-details/${encodeURIComponent(normalizedMovieId)}`;
}

function buildScreeningUnavailablePayload({
  screening = null,
  hall = null,
  evaluation = null
} = {}) {
  const currentEvaluation = evaluation || evaluateScreeningBookability({ screening, hall });
  const movieId = sanitizeId(screening?.movieId);
  const screeningId = sanitizeId(screening?._id);
  const reasonCode = sanitizeText(currentEvaluation?.reasonCode || "SCREENING_UNAVAILABLE");
  const message = sanitizeText(currentEvaluation?.message || "This screening is no longer available.");
  const movieDetailsHash = buildClientMovieDetailsHash(movieId);

  return {
    code: reasonCode,
    message,
    movieId,
    screeningId,
    movieDetailsHash
  };
}

module.exports = {
  BOOKABLE_SCREENING_STATUSES,
  getScreeningMaintenanceImpact,
  evaluateScreeningBookability,
  buildClientMovieDetailsHash,
  buildScreeningUnavailablePayload
};

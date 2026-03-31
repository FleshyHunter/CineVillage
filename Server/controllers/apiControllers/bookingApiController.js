const { ObjectId } = require("mongodb");
const nodemailer = require("nodemailer");
const {
  initDBIfNecessary,
  getMongoClient,
  getCollectionBooking,
  getCollectionScreening,
  getCollectionSeatReservation
} = require("../../config/database");

const BOOKABLE_SCREENING_STATUSES = new Set(["published", "scheduled"]);
const NON_BOOKABLE_SEAT_STATES = new Set(["removed"]);
const HOLD_DURATION_MS = 15 * 60 * 1000;
const HOLD_EXTEND_MS = 5 * 60 * 1000;
const HOLD_DURATION_MAX_SECONDS = Math.floor(HOLD_DURATION_MS / 1000);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let cachedInvoiceMailer = null;

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;

  if (typeof value === "string") {
    if (!ObjectId.isValid(value)) return null;
    return new ObjectId(value);
  }

  if (typeof value === "object" && value._id) {
    return toObjectIdSafe(value._id);
  }

  return null;
}

function normalizeSeatLabel(value) {
  return (value || "").toString().trim().toUpperCase();
}

function dedupeSeatLabels(seats = []) {
  const unique = [];
  const seen = new Set();

  for (const seat of seats) {
    const normalized = normalizeSeatLabel(seat);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;

    seen.add(normalized);
    unique.push(normalized);
  }

  return unique;
}

function parseSeatLabelToPosition(seatLabel) {
  const match = /^([A-Z])(\d+)$/.exec(seatLabel);
  if (!match) return null;

  const rowIndex = match[1].charCodeAt(0) - 65;
  const columnNumber = Number.parseInt(match[2], 10);

  if (!Number.isInteger(rowIndex) || rowIndex < 0) return null;
  if (!Number.isInteger(columnNumber) || columnNumber <= 0) return null;

  return {
    rowIndex,
    columnIndex: columnNumber - 1
  };
}

function getSnapshotAisleSet(hallSnapshot) {
  return new Set(
    (hallSnapshot?.aisleColumns || [])
      .map((column) => Number.parseInt(column, 10))
      .filter((column) => Number.isInteger(column) && column >= 0)
  );
}

function validateSeatLabelsAgainstSnapshot(seatLabels, hallSnapshot) {
  const rows = Number.parseInt(hallSnapshot?.rows, 10) || 0;
  const columns = Number.parseInt(hallSnapshot?.columns, 10) || 0;
  const seatConfig = hallSnapshot?.seatConfig || {};
  const aisleColumns = getSnapshotAisleSet(hallSnapshot);

  if (!rows || !columns) {
    return {
      ok: false,
      invalidSeats: seatLabels,
      message: "Screening hall snapshot is incomplete."
    };
  }

  const invalidSeats = [];

  for (const seatLabel of seatLabels) {
    const position = parseSeatLabelToPosition(seatLabel);
    if (!position) {
      invalidSeats.push(seatLabel);
      continue;
    }

    if (position.rowIndex >= rows || position.columnIndex >= columns) {
      invalidSeats.push(seatLabel);
      continue;
    }

    if (aisleColumns.has(position.columnIndex)) {
      invalidSeats.push(seatLabel);
      continue;
    }

    const seatKey = `${position.rowIndex}-${position.columnIndex}`;
    const seatState = (seatConfig[seatKey] || "normal").toString().toLowerCase();

    if (NON_BOOKABLE_SEAT_STATES.has(seatState)) {
      invalidSeats.push(seatLabel);
    }
  }

  return {
    ok: invalidSeats.length === 0,
    invalidSeats
  };
}

function sanitizeOptionalString(value, { lowerCase = false } = {}) {
  const text = (value || "").toString().trim();
  if (!text) return null;
  return lowerCase ? text.toLowerCase() : text;
}

function isValidEmail(value) {
  const normalized = sanitizeOptionalString(value, { lowerCase: true });
  if (!normalized) return false;
  return EMAIL_PATTERN.test(normalized);
}

async function getInvoiceMailer() {
  if (cachedInvoiceMailer) return cachedInvoiceMailer;

  const requiredEnvKeys = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"];
  const missingKeys = requiredEnvKeys.filter((key) => {
    const value = process.env[key];
    return !value || !value.toString().trim();
  });

  if (missingKeys.length > 0) {
    throw new Error(`SMTP configuration missing: ${missingKeys.join(", ")}`);
  }

  cachedInvoiceMailer = {
    transporter: nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || "false") === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    }),
    fromAddress: process.env.SMTP_FROM || process.env.SMTP_USER
  };

  return cachedInvoiceMailer;
}

function buildBookingCode() {
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `BK-${timePart}-${randomPart}`;
}

function resolveRequestedHoldDurationMs(payload = {}) {
  const requestedSeconds = Number.parseInt(payload?.holdDurationSeconds, 10);
  if (!Number.isFinite(requestedSeconds)) return HOLD_DURATION_MS;

  const clampedSeconds = Math.min(
    Math.max(requestedSeconds, 1),
    HOLD_DURATION_MAX_SECONDS
  );

  return clampedSeconds * 1000;
}

function buildBookingDocument(screening, seatLabels, payload = {}, now = new Date()) {
  const seatCount = seatLabels.length;
  const pricePerSeat = Number(screening?.price);
  const normalizedPricePerSeat = Number.isFinite(pricePerSeat) ? pricePerSeat : 0;
  const totalAmount = normalizedPricePerSeat * seatCount;
  const expiresAt = new Date(now.getTime() + resolveRequestedHoldDurationMs(payload));

  const hallId =
    toObjectIdSafe(screening?.hallSnapshot?.originalHallId) ||
    toObjectIdSafe(screening?.hallId);

  return {
    _id: new ObjectId(),
    bookingCode: buildBookingCode(),
    screeningId: toObjectIdSafe(screening?._id),
    movieId: toObjectIdSafe(screening?.movieId),
    hallId,
    seats: seatLabels,
    seatCount,
    pricePerSeat: normalizedPricePerSeat,
    totalAmount,
    totalPrice: totalAmount,
    status: "pending",
    paymentStatus: "unpaid",
    customerName: sanitizeOptionalString(payload.customerName),
    customerEmail: sanitizeOptionalString(payload.customerEmail, { lowerCase: true }),
    bookedAt: now,
    createdAt: now,
    expiresAt,
    created: now,
    updated: now
  };
}

function buildSeatReservationDocuments(screeningId, seatLabels, bookingId, expiresAt, createdAt = new Date()) {

  return seatLabels.map((seat) => ({
    screeningId,
    bookingId,
    seat,
    expiresAt,
    createdAt,
    updatedAt: createdAt
  }));
}

function isDuplicateKeyError(error) {
  return Boolean(error) && Number(error.code) === 11000;
}

function isTransactionUnsupportedError(error) {
  const message = (error?.message || "").toString();
  return (
    message.includes("Transaction numbers are only allowed") ||
    message.includes("replica set member") ||
    message.includes("Transaction is not supported")
  );
}

function serializeBooking(booking) {
  if (!booking) return null;

  return {
    ...booking,
    _id: booking._id?.toString(),
    screeningId: booking.screeningId?.toString(),
    movieId: booking.movieId?.toString(),
    hallId: booking.hallId?.toString(),
    expiresAt: booking.expiresAt instanceof Date ? booking.expiresAt.toISOString() : booking.expiresAt
  };
}

async function cleanupExpiredBookingHolds(collectionBooking, collectionSeatReservation) {
  const now = new Date();

  const expiredHolds = await collectionBooking
    .find(
      {
        status: "pending",
        expiresAt: { $lte: now }
      },
      { projection: { _id: 1 } }
    )
    .toArray();

  if (!expiredHolds.length) return;

  const expiredBookingIds = expiredHolds.map((booking) => booking._id);

  await Promise.all([
    collectionSeatReservation.deleteMany({
      bookingId: { $in: expiredBookingIds }
    }),
    collectionBooking.updateMany(
      { _id: { $in: expiredBookingIds } },
      {
        $set: {
          status: "expired",
          updated: now
        }
      }
    )
  ]);
}

async function findConflictedSeats(collectionSeatReservation, screeningId, seatLabels) {
  const now = new Date();
  const conflicts = await collectionSeatReservation
    .find(
      {
        screeningId,
        seat: { $in: seatLabels },
        $or: [
          { expiresAt: { $gt: now } },
          { expiresAt: null },
          { expiresAt: { $exists: false } }
        ]
      },
      { projection: { seat: 1 } }
    )
    .toArray();

  return [...new Set(conflicts.map((item) => item.seat))].sort();
}

async function createBookingWithTransaction({
  collectionBooking,
  collectionSeatReservation,
  screening,
  seatLabels,
  payload
}) {
  const client = getMongoClient();
  const session = client.startSession();
  let booking = null;

  try {
    await session.withTransaction(async () => {
      const now = new Date();
      const bookingDocument = buildBookingDocument(screening, seatLabels, payload, now);
      const reservationDocuments = buildSeatReservationDocuments(
        screening._id,
        seatLabels,
        bookingDocument._id,
        bookingDocument.expiresAt,
        now
      );

      await collectionBooking.insertOne(bookingDocument, { session });
      await collectionSeatReservation.insertMany(reservationDocuments, { session, ordered: true });
      booking = bookingDocument;
    });
  } finally {
    await session.endSession();
  }

  return booking;
}

async function createBookingWithoutTransaction({
  collectionBooking,
  collectionSeatReservation,
  screening,
  seatLabels,
  payload
}) {
  const now = new Date();
  const bookingDocument = buildBookingDocument(screening, seatLabels, payload, now);
  const reservationDocuments = buildSeatReservationDocuments(
    screening._id,
    seatLabels,
    bookingDocument._id,
    bookingDocument.expiresAt,
    now
  );
  const insertedReservationSeats = [];

  try {
    await collectionBooking.insertOne(bookingDocument);

    for (const reservation of reservationDocuments) {
      await collectionSeatReservation.insertOne(reservation);
      insertedReservationSeats.push(reservation.seat);
    }

    return bookingDocument;
  } catch (error) {
    await Promise.all([
      insertedReservationSeats.length
        ? collectionSeatReservation.deleteMany({
            screeningId: screening._id,
            bookingId: bookingDocument._id,
            seat: { $in: insertedReservationSeats }
          })
        : Promise.resolve(),
      collectionBooking.deleteOne({ _id: bookingDocument._id })
    ]);
    throw error;
  }
}

async function createBooking(req, res) {
  try {
    await initDBIfNecessary();

    const collectionScreening = getCollectionScreening();
    const collectionBooking = getCollectionBooking();
    const collectionSeatReservation = getCollectionSeatReservation();
    await cleanupExpiredBookingHolds(collectionBooking, collectionSeatReservation);

    const screeningIdRaw = (req.body?.screeningId || "").toString().trim();
    const requestedSeats = Array.isArray(req.body?.seats) ? req.body.seats : [];
    const seatLabels = dedupeSeatLabels(requestedSeats);

    if (!ObjectId.isValid(screeningIdRaw)) {
      return res.status(400).json({ message: "Invalid screeningId." });
    }

    if (!seatLabels.length) {
      return res.status(400).json({ message: "At least one valid seat is required." });
    }

    const screeningId = new ObjectId(screeningIdRaw);

    const screening = await collectionScreening.findOne(
      { _id: screeningId },
      {
        projection: {
          _id: 1,
          movieId: 1,
          hallId: 1,
          status: 1,
          price: 1,
          hallSnapshot: 1
        }
      }
    );

    if (!screening) {
      return res.status(404).json({ message: "Screening not found." });
    }

    if (!BOOKABLE_SCREENING_STATUSES.has((screening.status || "").toString().toLowerCase())) {
      return res.status(400).json({ message: "Only published screenings can be booked." });
    }

    if (!screening.hallSnapshot || typeof screening.hallSnapshot !== "object") {
      return res.status(400).json({ message: "Screening has no hall snapshot for seat validation." });
    }

    const seatValidation = validateSeatLabelsAgainstSnapshot(seatLabels, screening.hallSnapshot);
    if (!seatValidation.ok) {
      return res.status(400).json({
        message: "One or more seats are invalid for this screening.",
        invalidSeats: seatValidation.invalidSeats
      });
    }

    const preConflictedSeats = await findConflictedSeats(collectionSeatReservation, screeningId, seatLabels);
    if (preConflictedSeats.length) {
      return res.status(409).json({
        message: "One or more seats already taken",
        conflictedSeats: preConflictedSeats
      });
    }

    let booking = null;

    try {
      booking = await createBookingWithTransaction({
        collectionBooking,
        collectionSeatReservation,
        screening,
        seatLabels,
        payload: req.body
      });
    } catch (error) {
      if (isTransactionUnsupportedError(error)) {
        booking = await createBookingWithoutTransaction({
          collectionBooking,
          collectionSeatReservation,
          screening,
          seatLabels,
          payload: req.body
        });
      } else {
        throw error;
      }
    }

    return res.status(201).json({
      message: "Booking successful",
      booking: serializeBooking(booking)
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const screeningIdRaw = (req.body?.screeningId || "").toString().trim();
      const requestedSeats = Array.isArray(req.body?.seats) ? req.body.seats : [];
      const seatLabels = dedupeSeatLabels(requestedSeats);

      if (ObjectId.isValid(screeningIdRaw) && seatLabels.length) {
        try {
          await initDBIfNecessary();
          const conflictedSeats = await findConflictedSeats(
            getCollectionSeatReservation(),
            new ObjectId(screeningIdRaw),
            seatLabels
          );

          return res.status(409).json({
            message: "One or more seats already taken",
            conflictedSeats
          });
        } catch (lookupError) {
          console.error("Error resolving conflicted seats:", lookupError);
        }
      }

      return res.status(409).json({
        message: "One or more seats already taken"
      });
    }

    console.error("Error creating booking:", error);
    return res.status(500).json({
      message: "Failed to create booking"
    });
  }
}

async function releaseBookingHold(req, res) {
  try {
    await initDBIfNecessary();
    const collectionBooking = getCollectionBooking();
    const collectionSeatReservation = getCollectionSeatReservation();
    await cleanupExpiredBookingHolds(collectionBooking, collectionSeatReservation);

    const bookingIdRaw = (req.params.id || "").toString().trim();
    if (!ObjectId.isValid(bookingIdRaw)) {
      return res.status(400).json({ message: "Invalid booking ID." });
    }

    const bookingId = new ObjectId(bookingIdRaw);
    const booking = await collectionBooking.findOne({ _id: bookingId });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    if ((booking.status || "").toLowerCase() !== "pending") {
      return res.status(200).json({
        message: "Booking hold already finalized.",
        booking: serializeBooking(booking)
      });
    }

    const now = new Date();

    await Promise.all([
      collectionSeatReservation.deleteMany({ bookingId }),
      collectionBooking.updateOne(
        { _id: bookingId },
        {
          $set: {
            status: "cancelled",
            updated: now
          }
        }
      )
    ]);

    const updatedBooking = await collectionBooking.findOne({ _id: bookingId });

    return res.status(200).json({
      message: "Booking hold released.",
      booking: serializeBooking(updatedBooking)
    });
  } catch (error) {
    console.error("Error releasing booking hold:", error);
    return res.status(500).json({ message: "Failed to release booking hold" });
  }
}

async function extendBookingHold(req, res) {
  try {
    await initDBIfNecessary();
    const collectionBooking = getCollectionBooking();
    const collectionSeatReservation = getCollectionSeatReservation();
    await cleanupExpiredBookingHolds(collectionBooking, collectionSeatReservation);

    const bookingIdRaw = (req.params.id || "").toString().trim();
    if (!ObjectId.isValid(bookingIdRaw)) {
      return res.status(400).json({ message: "Invalid booking ID." });
    }

    const bookingId = new ObjectId(bookingIdRaw);
    const booking = await collectionBooking.findOne({ _id: bookingId });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }

    if ((booking.status || "").toLowerCase() !== "pending") {
      return res.status(409).json({ message: "Only pending booking holds can be extended." });
    }

    const now = new Date();
    const bookingExpiresAt = booking.expiresAt instanceof Date ? booking.expiresAt : new Date(booking.expiresAt);
    const baseTime = Number.isNaN(bookingExpiresAt.getTime()) || bookingExpiresAt < now ? now : bookingExpiresAt;
    const nextExpiresAt = new Date(baseTime.getTime() + HOLD_EXTEND_MS);

    await Promise.all([
      collectionBooking.updateOne(
        { _id: bookingId },
        {
          $set: {
            expiresAt: nextExpiresAt,
            updated: now
          }
        }
      ),
      collectionSeatReservation.updateMany(
        { bookingId },
        {
          $set: {
            expiresAt: nextExpiresAt,
            updatedAt: now
          }
        }
      )
    ]);

    const updatedBooking = await collectionBooking.findOne({ _id: bookingId });
    return res.status(200).json({
      message: "Booking hold extended.",
      booking: serializeBooking(updatedBooking)
    });
  } catch (error) {
    console.error("Error extending booking hold:", error);
    return res.status(500).json({ message: "Failed to extend booking hold" });
  }
}

function escapeHtml(value) {
  return (value || "")
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNonNegativeNumber(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return fallback;
  return numeric;
}

function formatInvoiceCurrency(amount, currency = "SGD") {
  const safeAmount = toNonNegativeNumber(amount, 0);
  const normalizedCurrency = (currency || "SGD").toString().trim().toUpperCase() || "SGD";
  return `${normalizedCurrency} ${safeAmount.toFixed(2)}`;
}

function formatConfirmationDate(dateValue = new Date()) {
  const parsed = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function normalizePaymentMethodLabel(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "visa_mastercard") return "Visa / Mastercard";
  if (normalized === "amex") return "AMEX";
  return "N/A";
}

function normalizeInvoiceAddOns(addOns = []) {
  if (!Array.isArray(addOns)) return [];

  return addOns
    .map((item) => {
      const name = sanitizeOptionalString(item?.name) || "Add-on";
      const qtyRaw = Number.parseInt(item?.qty, 10);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
      const price = toNonNegativeNumber(item?.price, 0);
      const amount = toNonNegativeNumber(item?.amount, price * qty);
      return {
        name,
        qty,
        price,
        amount
      };
    })
    .filter(Boolean);
}

function buildInvoiceEmailText(model) {
  const {
    bookingReference,
    bookingId,
    confirmationDate,
    transactionId,
    customerName,
    movieName,
    advisory,
    screeningDate,
    screeningTime,
    cinemaName,
    hallName,
    screenFormat,
    seatLabel,
    addOns,
    seatSubtotal,
    addOnsSubtotal,
    bookingFee,
    promoDiscount,
    finalizedTotal,
    currency,
    qrPayloadText
  } = model;

  const addOnLines = addOns.length
    ? addOns.map((item) => `${item.name} x${item.qty} (${formatInvoiceCurrency(item.amount, currency)})`).join(", ")
    : "None";

  return [
    `Dear ${customerName || "Customer"},`,
    "",
    "Thank you for purchasing tickets with CineVillage.",
    "",
    "CineVillage E-Ticket / Booking Confirmation",
    `Booking Reference: ${bookingReference}`,
    `Booking ID: ${bookingId}`,
    `Confirmation Date: ${confirmationDate}`,
    `Transaction ID: ${transactionId}`,
    "",
    "Movie / Showtime Details",
    `Movie: ${movieName}`,
    `Advisory: ${advisory || "N/A"}`,
    `Date: ${screeningDate}`,
    `Time: ${screeningTime}`,
    `Cinema: ${cinemaName}`,
    `Hall: ${hallName}`,
    `Format: ${screenFormat}`,
    `Seats: ${seatLabel}`,
    "",
    "Order Summary",
    `Ticket Subtotal: ${formatInvoiceCurrency(seatSubtotal, currency)}`,
    `Add-ons: ${formatInvoiceCurrency(addOnsSubtotal, currency)}`,
    `Platform Fee: ${formatInvoiceCurrency(bookingFee, currency)}`,
    `Promo Discount: -${formatInvoiceCurrency(promoDiscount, currency)}`,
    `Grand Total: ${formatInvoiceCurrency(finalizedTotal, currency)}`,
    "",
    `Add-ons Selected: ${addOnLines}`,
    "",
    "Show this QR code at the cinema to redeem your booking.",
    `QR Payload: ${qrPayloadText}`,
    "",
    "Important Notes",
    "- Please arrive at least 15 minutes before showtime.",
    "- No exchanges or cancellations once payment is completed.",
    "- Entry is subject to applicable age/advisory checks."
  ].join("\n");
}

function buildInvoiceEmailHtml(model) {
  const {
    bookingReference,
    bookingId,
    confirmationDate,
    transactionId,
    paymentMethodLabel,
    customerName,
    movieName,
    advisory,
    screeningDate,
    screeningTime,
    cinemaName,
    hallName,
    screenFormat,
    seatLabel,
    addOns,
    seatSubtotal,
    addOnsSubtotal,
    bookingFee,
    promoDiscount,
    finalizedTotal,
    currency,
    qrCodeUrl
  } = model;

  const addOnRows = addOns.length
    ? addOns.map((item) => `
        <tr>
          <td style="padding:8px 0;color:#dbe5f4;">${escapeHtml(item.name)} x${item.qty}</td>
          <td style="padding:8px 0;color:#dbe5f4;text-align:right;">${escapeHtml(formatInvoiceCurrency(item.amount, currency))}</td>
        </tr>
      `).join("")
    : `
      <tr>
        <td style="padding:8px 0;color:#94a3b8;">No add-ons selected</td>
        <td style="padding:8px 0;color:#94a3b8;text-align:right;">${escapeHtml(formatInvoiceCurrency(0, currency))}</td>
      </tr>
    `;

  return `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#0b1220;color:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:760px;margin:0 auto;padding:24px 16px;">
      <div style="background:#111827;border:1px solid #243244;border-radius:14px;overflow:hidden;">
        <div style="padding:22px 24px;background:linear-gradient(135deg,#1d4ed8,#0f172a);">
          <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:#bfdbfe;">CineVillage</div>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.2;">E-Ticket / Booking Confirmation</h1>
        </div>

        <div style="padding:20px 24px;">
          <p style="margin:0 0 14px;color:#e2e8f0;">Dear ${escapeHtml(customerName || "Customer")},</p>
          <p style="margin:0 0 18px;color:#cbd5e1;">Thank you for your purchase. Please present this e-ticket at the cinema.</p>

          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:18px;">
            <tr>
              <td style="padding:6px 0;color:#93c5fd;font-weight:700;">Booking Reference</td>
              <td style="padding:6px 0;color:#f8fafc;text-align:right;">${escapeHtml(bookingReference)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#93c5fd;font-weight:700;">Booking ID</td>
              <td style="padding:6px 0;color:#f8fafc;text-align:right;">${escapeHtml(bookingId)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#93c5fd;font-weight:700;">Confirmation Date</td>
              <td style="padding:6px 0;color:#f8fafc;text-align:right;">${escapeHtml(confirmationDate)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#93c5fd;font-weight:700;">Transaction ID</td>
              <td style="padding:6px 0;color:#f8fafc;text-align:right;">${escapeHtml(transactionId)}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;color:#93c5fd;font-weight:700;">Payment Method</td>
              <td style="padding:6px 0;color:#f8fafc;text-align:right;">${escapeHtml(paymentMethodLabel)}</td>
            </tr>
          </table>

          <div style="border:1px solid #243244;border-radius:12px;padding:16px;margin-bottom:16px;">
            <h2 style="margin:0 0 12px;font-size:16px;color:#f8fafc;">Movie / Showtime Details</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr><td style="padding:5px 0;color:#94a3b8;">Movie</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(movieName)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Advisory</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(advisory || "N/A")}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Date</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(screeningDate)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Time</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(screeningTime)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Cinema</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(cinemaName)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Hall</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(hallName)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Format</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(screenFormat)}</td></tr>
              <tr><td style="padding:5px 0;color:#94a3b8;">Seats</td><td style="padding:5px 0;color:#f8fafc;text-align:right;">${escapeHtml(seatLabel)}</td></tr>
            </table>
          </div>

          <div style="border:1px solid #243244;border-radius:12px;padding:16px;margin-bottom:16px;">
            <h2 style="margin:0 0 12px;font-size:16px;">Order Summary</h2>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#dbe5f4;">Tickets</td><td style="padding:8px 0;color:#dbe5f4;text-align:right;">${escapeHtml(formatInvoiceCurrency(seatSubtotal, currency))}</td></tr>
              ${addOnRows}
              <tr><td style="padding:8px 0;color:#dbe5f4;">Platform Fee</td><td style="padding:8px 0;color:#dbe5f4;text-align:right;">${escapeHtml(formatInvoiceCurrency(bookingFee, currency))}</td></tr>
              <tr><td style="padding:8px 0;color:#fca5a5;">Promo Discount</td><td style="padding:8px 0;color:#fca5a5;text-align:right;">-${escapeHtml(formatInvoiceCurrency(promoDiscount, currency))}</td></tr>
              <tr><td colspan="2" style="padding-top:8px;border-top:1px solid #243244;"></td></tr>
              <tr><td style="padding:10px 0 0;font-weight:700;color:#f8fafc;">Grand Total</td><td style="padding:10px 0 0;font-weight:700;color:#f8fafc;text-align:right;">${escapeHtml(formatInvoiceCurrency(finalizedTotal, currency))}</td></tr>
            </table>
          </div>

          <div style="border:1px solid #243244;border-radius:12px;padding:16px;text-align:center;margin-bottom:16px;">
            <h2 style="margin:0 0 10px;font-size:16px;">Scan At Cinema</h2>
            <img src="${escapeHtml(qrCodeUrl)}" alt="CineVillage Booking QR Code" width="190" height="190" style="display:block;margin:0 auto 10px;background:#fff;padding:8px;border-radius:8px;" />
            <p style="margin:0;color:#94a3b8;font-size:12px;">Show this QR code in person to redeem your order.</p>
          </div>

          <div style="margin-top:16px;padding:14px 16px;border:1px solid #243244;border-radius:12px;background:#0f172a;">
            <h3 style="margin:0 0 8px;font-size:14px;color:#f8fafc;">Important Notes</h3>
            <ul style="margin:0;padding-left:18px;color:#cbd5e1;line-height:1.5;">
              <li>Please arrive at least 15 minutes before showtime.</li>
              <li>No exchanges or cancellations once payment is completed.</li>
              <li>Entry is subject to age/advisory checks where applicable.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </body>
</html>
  `.trim();
}

async function sendBookingInvoice(req, res) {
  try {
    await initDBIfNecessary();

    const bookingIdRaw = (req.params.id || "").toString().trim();
    if (!ObjectId.isValid(bookingIdRaw)) {
      return res.status(400).json({ message: "Invalid booking ID." });
    }

    const bookingId = new ObjectId(bookingIdRaw);
    const collectionBooking = getCollectionBooking();
    const booking = await collectionBooking.findOne({ _id: bookingId });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found." });
    }
    const currentStatus = (booking.status || "").toString().trim().toLowerCase();
    if (currentStatus !== "pending" && currentStatus !== "completed") {
      return res.status(409).json({ message: "Only pending bookings can be completed." });
    }

    const customerName = sanitizeOptionalString(req.body?.name) || sanitizeOptionalString(booking.customerName) || "";
    const customerEmail =
      sanitizeOptionalString(req.body?.email, { lowerCase: true })
      || sanitizeOptionalString(booking.customerEmail, { lowerCase: true })
      || "";
    const customerPhone = sanitizeOptionalString(req.body?.phone) || "";
    const movieName = sanitizeOptionalString(req.body?.movieName) || "";
    const advisory = sanitizeOptionalString(req.body?.advisory) || "";
    const screeningDate = sanitizeOptionalString(req.body?.screeningDate) || "";
    const screeningTime = sanitizeOptionalString(req.body?.screeningTime) || "";
    const cinemaName = sanitizeOptionalString(req.body?.cinemaName) || "";
    const hallName = sanitizeOptionalString(req.body?.hallName) || "";
    const screenFormat =
      sanitizeOptionalString(req.body?.screenFormat)
      || sanitizeOptionalString(req.body?.seatType)
      || "";
    const paymentMethodLabel = normalizePaymentMethodLabel(req.body?.paymentMethod);
    const transactionId = sanitizeOptionalString(req.body?.transactionId) || `mock-${booking.bookingCode || bookingIdRaw}`;
    const seats = Array.isArray(req.body?.seats)
      ? req.body.seats.map((seat) => sanitizeOptionalString(seat)).filter(Boolean)
      : [];
    const addOns = normalizeInvoiceAddOns(req.body?.addOns);
    const seatCount = Number.parseInt(booking?.seatCount, 10) || seats.length || 0;
    const fallbackSeatSubtotal = toNonNegativeNumber(booking?.pricePerSeat, 0) * seatCount;
    const seatSubtotal = toNonNegativeNumber(req.body?.seatSubtotal, fallbackSeatSubtotal);
    const fallbackAddOnsSubtotal = addOns.reduce((sum, item) => sum + toNonNegativeNumber(item.amount, 0), 0);
    const addOnsSubtotal = toNonNegativeNumber(req.body?.addOnsSubtotal, fallbackAddOnsSubtotal);
    const bookingFee = toNonNegativeNumber(req.body?.bookingFee, 0);
    const promoDiscount = toNonNegativeNumber(req.body?.promoDiscount, 0);
    const totalPrice = Number(req.body?.totalPrice);
    const breakdownTotal = Math.max(seatSubtotal + addOnsSubtotal + bookingFee - promoDiscount, 0);
    const currentBookingTotal = Number(booking?.totalPrice ?? booking?.totalAmount ?? 0);
    const finalizedTotal = Number.isFinite(totalPrice) && totalPrice >= 0
      ? totalPrice
      : (Number.isFinite(breakdownTotal) && breakdownTotal >= 0
        ? breakdownTotal
        : (Number.isFinite(currentBookingTotal) && currentBookingTotal >= 0 ? currentBookingTotal : 0));
    const currency = ((req.body?.currency || "SGD").toString().trim().toUpperCase() || "SGD");
    const fallbackSeats = Array.isArray(booking?.seats) ? booking.seats : [];
    const seatList = seats.length ? seats : fallbackSeats;
    const seatLabel = seatList.length ? seatList.join(", ") : "N/A";
    const confirmationDate = formatConfirmationDate(new Date());
    const bookingIdText = bookingId.toString();
    const bookingReference = sanitizeOptionalString(booking.bookingCode) || bookingIdText;
    const qrPayloadText = JSON.stringify({ bookingId: bookingIdText });
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrPayloadText)}`;

    if (!isValidEmail(customerEmail)) {
      return res.status(400).json({ message: "A valid email is required for invoice delivery." });
    }

    const invoiceModel = {
      bookingReference,
      bookingId: bookingIdText,
      confirmationDate,
      transactionId,
      paymentMethodLabel,
      customerName,
      movieName: movieName || "N/A",
      advisory,
      screeningDate: screeningDate || "N/A",
      screeningTime: screeningTime || "N/A",
      cinemaName: cinemaName || "N/A",
      hallName: hallName || "N/A",
      screenFormat: screenFormat || "N/A",
      seatLabel,
      addOns,
      seatSubtotal,
      addOnsSubtotal,
      bookingFee,
      promoDiscount,
      finalizedTotal,
      currency,
      qrPayloadText,
      qrCodeUrl
    };

    const invoiceSubject = `CineVillage E-Ticket - ${bookingReference}`;
    const { transporter, fromAddress } = await getInvoiceMailer();
    await transporter.sendMail({
      from: fromAddress,
      to: customerEmail,
      subject: invoiceSubject,
      text: buildInvoiceEmailText(invoiceModel),
      html: buildInvoiceEmailHtml(invoiceModel)
    });

    const now = new Date();
    const collectionSeatReservation = getCollectionSeatReservation();
    await Promise.all([
      collectionBooking.updateOne(
        { _id: bookingId },
        {
          $set: {
            customerName: customerName || null,
            customerEmail,
            customerPhone: customerPhone || null,
            status: "completed",
            paymentStatus: "completed",
            totalAmount: finalizedTotal,
            totalPrice: finalizedTotal,
            confirmedAt: now,
            expiresAt: null,
            updated: now
          }
        }
      ),
      collectionSeatReservation.updateMany(
        { bookingId },
        {
          $set: {
            expiresAt: null,
            updatedAt: now
          }
        }
      )
    ]);

    return res.status(200).json({
      message: "Payment completed and invoice email sent.",
      invoice: {
        bookingId: bookingIdText,
        bookingReference,
        transactionId,
        confirmedAt: now.toISOString(),
        qrPayloadText,
        qrCodeUrl,
        invoiceSubject,
        recipientEmail: customerEmail,
        currency,
        finalizedTotal
      }
    });
  } catch (error) {
    console.error("Error sending booking invoice:", error);
    return res.status(500).json({
      message: "Failed to send invoice email."
    });
  }
}

module.exports = {
  createBooking,
  releaseBookingHold,
  extendBookingHold,
  sendBookingInvoice,
  cleanupExpiredBookingHolds
};

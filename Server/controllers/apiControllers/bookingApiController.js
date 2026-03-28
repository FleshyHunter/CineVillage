const { ObjectId } = require("mongodb");
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

module.exports = {
  createBooking,
  releaseBookingHold,
  extendBookingHold,
  cleanupExpiredBookingHolds
};

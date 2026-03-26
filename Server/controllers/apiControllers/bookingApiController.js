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

function buildBookingDocument(screening, seatLabels, payload = {}) {
  const seatCount = seatLabels.length;
  const pricePerSeat = Number(screening?.price);
  const normalizedPricePerSeat = Number.isFinite(pricePerSeat) ? pricePerSeat : 0;
  const totalAmount = normalizedPricePerSeat * seatCount;
  const now = new Date();

  const hallId =
    toObjectIdSafe(screening?.hallSnapshot?.originalHallId) ||
    toObjectIdSafe(screening?.hallId);

  return {
    bookingCode: buildBookingCode(),
    screeningId: toObjectIdSafe(screening?._id),
    movieId: toObjectIdSafe(screening?.movieId),
    hallId,
    seats: seatLabels,
    seatCount,
    pricePerSeat: normalizedPricePerSeat,
    totalAmount,
    totalPrice: totalAmount,
    status: "confirmed",
    paymentStatus: "unpaid",
    customerName: sanitizeOptionalString(payload.customerName),
    customerEmail: sanitizeOptionalString(payload.customerEmail, { lowerCase: true }),
    bookedAt: now,
    createdAt: now,
    created: now,
    updated: now
  };
}

function buildSeatReservationDocuments(screeningId, seatLabels) {
  const createdAt = new Date();

  return seatLabels.map((seat) => ({
    screeningId,
    seat,
    createdAt
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
    hallId: booking.hallId?.toString()
  };
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
      const bookingDocument = buildBookingDocument(screening, seatLabels, payload);
      const reservationDocuments = buildSeatReservationDocuments(screening._id, seatLabels);

      await collectionSeatReservation.insertMany(reservationDocuments, {
        session,
        ordered: true
      });

      const insertResult = await collectionBooking.insertOne(bookingDocument, { session });
      booking = { ...bookingDocument, _id: insertResult.insertedId };
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
  const reservationDocuments = buildSeatReservationDocuments(screening._id, seatLabels);
  await collectionSeatReservation.insertMany(reservationDocuments, { ordered: true });

  try {
    const bookingDocument = buildBookingDocument(screening, seatLabels, payload);
    const insertResult = await collectionBooking.insertOne(bookingDocument);
    return { ...bookingDocument, _id: insertResult.insertedId };
  } catch (error) {
    await collectionSeatReservation.deleteMany({
      screeningId: screening._id,
      seat: { $in: seatLabels }
    });
    throw error;
  }
}

async function createBooking(req, res) {
  try {
    await initDBIfNecessary();

    const collectionScreening = getCollectionScreening();
    const collectionBooking = getCollectionBooking();
    const collectionSeatReservation = getCollectionSeatReservation();

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

module.exports = {
  createBooking
};

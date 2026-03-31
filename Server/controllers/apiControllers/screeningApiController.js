const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionScreening,
  getCollectionHall,
  getCollectionMovie,
  getCollectionBooking,
  getCollectionSeatReservation
} = require("../../config/database");
const { updateScreeningStatuses } = require("../screeningController");
const { cleanupExpiredBookingHolds } = require("./bookingApiController");

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  if (typeof value === "object" && value._id) return toObjectIdSafe(value._id);
  return null;
}

function serializeSeatConfig(seatConfig) {
  if (!seatConfig || typeof seatConfig !== "object") return {};
  return seatConfig;
}

function buildSnapshotHallPayload(screening, liveHall) {
  if (screening?.hallSnapshot) {
    return {
      _id: screening.hallSnapshot.originalHallId
        ? screening.hallSnapshot.originalHallId.toString()
        : (screening.hallId ? screening.hallId.toString() : ""),
      name: screening.hallSnapshot.hallName || "Unknown Hall",
      pictureUrl: screening.hallSnapshot.pictureUrl || liveHall?.pictureUrl || "",
      type: screening.hallSnapshot.hallType || "Standard",
      rows: Number.parseInt(screening.hallSnapshot.rows, 10) || 0,
      columns: Number.parseInt(screening.hallSnapshot.columns, 10) || 0,
      wingColumns: Number.parseInt(screening.hallSnapshot.wingColumns, 10) || 0,
      aisleColumns: Array.isArray(screening.hallSnapshot.aisleColumns) ? screening.hallSnapshot.aisleColumns : [],
      seatConfig: serializeSeatConfig(screening.hallSnapshot.seatConfig),
      capacity: Number.parseInt(screening.hallSnapshot.capacity, 10) || 0
    };
  }

  if (!liveHall) return null;

  return {
    _id: liveHall._id.toString(),
    name: liveHall.name || "Unknown Hall",
    pictureUrl: liveHall.pictureUrl || "",
    type: liveHall.type || "Standard",
    rows: Number.parseInt(liveHall.rows, 10) || 0,
    columns: Number.parseInt(liveHall.columns, 10) || 0,
    wingColumns: Number.parseInt(liveHall.wingColumns, 10) || 0,
    aisleColumns: Array.isArray(liveHall.aisleColumns) ? liveHall.aisleColumns : [],
    seatConfig: serializeSeatConfig(liveHall.seatConfig),
    capacity: Number.parseInt(liveHall.capacity, 10) || 0
  };
}

function buildSeatReservationFilter(screeningId) {
  const now = new Date();

  return {
    screeningId,
    $or: [
      { expiresAt: { $gt: now } },
      { expiresAt: null },
      { expiresAt: { $exists: false } }
    ]
  };
}

function applyReservedSeatsToHallSnapshot(hallPayload, reservedSeats = []) {
  if (!hallPayload || !hallPayload.seatConfig || typeof hallPayload.seatConfig !== "object") {
    return hallPayload;
  }

  const nextSeatConfig = { ...hallPayload.seatConfig };

  reservedSeats.forEach((seatLabel) => {
    const match = /^([A-Z])(\d+)$/.exec((seatLabel || "").toString().trim().toUpperCase());
    if (!match) return;

    const rowIndex = match[1].charCodeAt(0) - 65;
    const colIndex = Number.parseInt(match[2], 10) - 1;
    if (!Number.isInteger(rowIndex) || !Number.isInteger(colIndex) || rowIndex < 0 || colIndex < 0) return;

    const key = `${rowIndex}-${colIndex}`;
    const currentState = (nextSeatConfig[key] || "normal").toString().toLowerCase();
    if (currentState === "removed") return;
    nextSeatConfig[key] = "onhold";
  });

  return {
    ...hallPayload,
    seatConfig: nextSeatConfig
  };
}

async function getScreeningSeatPreview(req, res) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid screening ID" });
    }

    await initDBIfNecessary();
    await updateScreeningStatuses();

    const collectionScreening = getCollectionScreening();
    const collectionHall = getCollectionHall();
    const collectionMovie = getCollectionMovie();
    const collectionBooking = getCollectionBooking();
    const collectionSeatReservation = getCollectionSeatReservation();
    await cleanupExpiredBookingHolds(collectionBooking, collectionSeatReservation);

    const screening = await collectionScreening.findOne({ _id: new ObjectId(id) });

    if (!screening) {
      return res.status(404).json({ error: "Screening not found" });
    }

    const hallLookupId =
      toObjectIdSafe(screening?.hallSnapshot?.originalHallId)
      || toObjectIdSafe(screening?.hallId);

    const [hall, movie] = await Promise.all([
      hallLookupId ? collectionHall.findOne({ _id: hallLookupId }) : Promise.resolve(null),
      collectionMovie.findOne({ _id: screening.movieId })
    ]);

    if (!screening.hallSnapshot && !hall) {
      return res.status(404).json({ error: "Hall not found for screening" });
    }

    const activeReservations = await collectionSeatReservation
      .find(
        buildSeatReservationFilter(screening._id),
        { projection: { seat: 1 } }
      )
      .toArray();

    const reservedSeatLabels = activeReservations.map((reservation) => reservation.seat);
    const hallPayload = applyReservedSeatsToHallSnapshot(
      buildSnapshotHallPayload(screening, hall),
      reservedSeatLabels
    );

    const startDateTime = screening.startDateTime ? new Date(screening.startDateTime) : null;

    return res.json({
      item: {
        screeningId: screening._id.toString(),
        status: screening.status || "scheduled",
        price: screening.price ?? null,
        startDateTime: startDateTime ? startDateTime.toISOString() : "",
        time: startDateTime
          ? startDateTime.toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false
            })
          : "N/A",
        dateLabel: startDateTime
          ? startDateTime.toLocaleDateString("en-GB", {
              weekday: "short",
              day: "2-digit",
              month: "short",
              year: "numeric"
            })
          : "N/A",
        movie: {
          _id: movie?._id ? movie._id.toString() : "",
          name: movie?.name || "Untitled Movie",
          ageRestriction: movie?.ageRestriction || "NR"
        },
        hall: hallPayload
      }
    });
  } catch (error) {
    console.error("Error fetching screening seat preview:", error);
    return res.status(500).json({ error: "Failed to fetch screening seat preview" });
  }
}

module.exports = {
  getScreeningSeatPreview
};

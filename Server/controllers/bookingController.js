const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionBooking,
  getCollectionMovie,
  getCollectionHall
} = require("../config/database");

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) {
    return "/bookings";
  }
  if (returnTo.startsWith("//")) {
    return "/bookings";
  }
  return returnTo;
}

async function getAllBookingsPage(req, res) {
  await initDBIfNecessary();

  const collectionBooking = getCollectionBooking();
  const collectionMovie = getCollectionMovie();

  const bookings = await collectionBooking
    .find({
      status: "completed",
      paymentStatus: "completed"
    })
    .sort({ bookedAt: -1, createdAt: -1, created: -1 })
    .toArray();

  const movieIds = [...new Set(
    bookings
      .map((booking) => toObjectIdSafe(booking.movieId))
      .filter(Boolean)
      .map((id) => id.toString())
  )];

  const movies = movieIds.length
    ? await collectionMovie
      .find({ _id: { $in: movieIds.map((id) => new ObjectId(id)) } })
      .project({ name: 1, status: 1 })
      .toArray()
    : [];

  const movieNameById = new Map(movies.map((movie) => [movie._id.toString(), movie.name || "N/A"]));
  const movieStatusById = new Map(movies.map((movie) => [movie._id.toString(), movie.status || ""]));

  const rows = bookings.map((booking) => {
    const seatQty = Number.parseInt(booking.seatCount, 10)
      || (Array.isArray(booking.seats) ? booking.seats.length : 0)
      || 0;

    const pricePerSeat = toFiniteNumber(booking.pricePerSeat);
    const totalAmount = toFiniteNumber(booking.totalAmount);
    const totalPrice = toFiniteNumber(booking.totalPrice);

    return {
      ...booking,
      movieName: movieNameById.get((booking.movieId || "").toString()) || "N/A",
      movieStatus: movieStatusById.get((booking.movieId || "").toString()) || "",
      bookingDateTime: booking.bookedAt || booking.createdAt || booking.created || null,
      qty: seatQty,
      revenue: totalAmount || totalPrice || (pricePerSeat * seatQty)
    };
  });

  res.render("bookings/bookingList", {
    title: "Bookings",
    pageTitle: "Bookings",
    bookings: rows
  });
}

async function getRevenueListPage(req, res) {
  await initDBIfNecessary();

  const collectionBooking = getCollectionBooking();
  const collectionMovie = getCollectionMovie();

  const bookings = await collectionBooking
    .find({
      status: "completed",
      paymentStatus: "completed"
    })
    .sort({ bookedAt: -1, createdAt: -1, created: -1 })
    .toArray();

  const movieIds = [...new Set(
    bookings
      .map((booking) => toObjectIdSafe(booking.movieId))
      .filter(Boolean)
      .map((id) => id.toString())
  )];

  const movies = movieIds.length
    ? await collectionMovie
      .find({ _id: { $in: movieIds.map((id) => new ObjectId(id)) } })
      .project({ name: 1 })
      .toArray()
    : [];

  const movieNameById = new Map(movies.map((movie) => [movie._id.toString(), movie.name || "N/A"]));

  const revenues = bookings.map((booking) => {
    const seatQty = Number.parseInt(booking.seatCount, 10)
      || (Array.isArray(booking.seats) ? booking.seats.length : 0)
      || 0;

    const pricePerSeat = toFiniteNumber(booking.pricePerSeat);
    const totalAmount = toFiniteNumber(booking.totalAmount);
    const totalPrice = toFiniteNumber(booking.totalPrice);

    return {
      ...booking,
      movieName: movieNameById.get((booking.movieId || "").toString()) || "N/A",
      bookingDateTime: booking.confirmedAt || booking.bookedAt || booking.createdAt || booking.created || null,
      qty: seatQty,
      revenue: totalAmount || totalPrice || (pricePerSeat * seatQty)
    };
  });

  res.render("bookings/revenueList", {
    title: "Revenue",
    pageTitle: "Revenue",
    revenues
  });
}

async function getBookingByIdPage(req, res) {
  await initDBIfNecessary();

  if (!ObjectId.isValid(req.params.id)) {
    return res.status(400).send("Invalid booking ID");
  }

  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const collectionBooking = getCollectionBooking();
  const collectionMovie = getCollectionMovie();
  const collectionHall = getCollectionHall();

  const booking = await collectionBooking.findOne({ _id: new ObjectId(req.params.id) });
  if (!booking) {
    return res.status(404).send("Booking not found");
  }

  const [movie, hall] = await Promise.all([
    toObjectIdSafe(booking.movieId)
      ? collectionMovie.findOne({ _id: toObjectIdSafe(booking.movieId) })
      : null,
    toObjectIdSafe(booking.hallId)
      ? collectionHall.findOne({ _id: toObjectIdSafe(booking.hallId) })
      : null
  ]);

  const qty = Number.parseInt(booking.seatCount, 10)
    || (Array.isArray(booking.seats) ? booking.seats.length : 0)
    || 0;

  const pricePerSeat = toFiniteNumber(booking.pricePerSeat);
  const totalAmount = toFiniteNumber(booking.totalAmount);
  const totalPrice = toFiniteNumber(booking.totalPrice);
  const revenue = totalAmount || totalPrice || (pricePerSeat * qty);

  const detailBooking = {
    ...booking,
    movie,
    hall,
    qty,
    revenue,
    bookingDateTime: booking.bookedAt || booking.createdAt || booking.created || null,
    customerLabel: booking.customerName || booking.bookingCode || booking._id.toString(),
    contactLabel: "8207 7872"
  };

  return res.render("bookings/bookingDetail", {
    title: "Bookings",
    pageTitle: "Bookings",
    booking: detailBooking,
    returnTo
  });
}

module.exports = {
  getAllBookingsPage,
  getRevenueListPage,
  getBookingByIdPage
};

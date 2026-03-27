const express = require("express");
const {
  createBooking,
  releaseBookingHold,
  extendBookingHold
} = require("../../controllers/apiControllers/bookingApiController");

const router = express.Router();

router.post("/", createBooking);
router.post("/:id/release", releaseBookingHold);
router.post("/:id/extend", extendBookingHold);

module.exports = router;

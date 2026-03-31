const express = require("express");
const {
  createBooking,
  releaseBookingHold,
  extendBookingHold,
  sendBookingInvoice
} = require("../../controllers/apiControllers/bookingApiController");

const router = express.Router();

router.post("/", createBooking);
router.post("/:id/release", releaseBookingHold);
router.post("/:id/extend", extendBookingHold);
router.post("/:id/send-invoice", sendBookingInvoice);

module.exports = router;

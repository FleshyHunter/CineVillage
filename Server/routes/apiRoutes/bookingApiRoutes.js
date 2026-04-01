const express = require("express");
const { requireCustomerAuth } = require("../../config/customerJwt");
const {
  createBooking,
  releaseBookingHold,
  extendBookingHold,
  sendBookingInvoice,
  listTicketBookings,
  getTicketBookingDetails,
  cancelTicketBooking
} = require("../../controllers/apiControllers/bookingApiController");

const router = express.Router();

router.post("/", createBooking);
router.get("/tickets", requireCustomerAuth, listTicketBookings);
router.get("/tickets/:id", requireCustomerAuth, getTicketBookingDetails);
router.post("/:id/cancel", requireCustomerAuth, cancelTicketBooking);
router.post("/:id/release", releaseBookingHold);
router.post("/:id/extend", extendBookingHold);
router.post("/:id/send-invoice", sendBookingInvoice);

module.exports = router;

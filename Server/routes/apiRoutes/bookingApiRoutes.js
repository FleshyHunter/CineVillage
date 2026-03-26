const express = require("express");
const { createBooking } = require("../../controllers/apiControllers/bookingApiController");

const router = express.Router();

router.post("/", createBooking);

module.exports = router;

const express = require("express");
const { requireRoles } = require("../config/session");
const { getAllBookingsPage, getBookingByIdPage } = require("../controllers/bookingController");

const router = express.Router();

router.get("/", requireRoles(["Admin", "Manager", "Staff"]), getAllBookingsPage);
router.get("/view/:id", requireRoles(["Admin", "Manager", "Staff"]), getBookingByIdPage);

module.exports = router;

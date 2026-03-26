const express = require("express");
const {
  listAddOns,
  getAddOnById
} = require("../../controllers/apiControllers/addOnApiController");

const router = express.Router();

router.get("/", listAddOns);
router.get("/:id", getAddOnById);

module.exports = router;

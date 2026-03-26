const express = require("express");
const {
  getScreeningSeatPreview
} = require("../../controllers/apiControllers/screeningApiController");

const router = express.Router();

router.get("/:id/seat-preview", getScreeningSeatPreview);

module.exports = router;

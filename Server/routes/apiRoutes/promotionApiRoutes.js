const express = require("express");
const {
  listPromotions,
  getPromotionById
} = require("../../controllers/apiControllers/promotionApiController");

const router = express.Router();

router.get("/", listPromotions);
router.get("/:id", getPromotionById);

module.exports = router;

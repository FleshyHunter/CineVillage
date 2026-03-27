const express = require("express");
const {
  listPromotions,
  listActivePromotions,
  getPromotionById
} = require("../../controllers/apiControllers/promotionApiController");

const router = express.Router();

router.get("/", listPromotions);
router.get("/active", listActivePromotions);
router.get("/:id", getPromotionById);

module.exports = router;

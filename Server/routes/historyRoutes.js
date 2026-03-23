const express = require("express");
const router = express.Router();
const { getHistoryPage, clearHistoryLogs } = require("../controllers/historyController");
const { requireRoles } = require("../config/session");

router.get("/", getHistoryPage);
router.post("/clear", requireRoles(["Admin"]), clearHistoryLogs);

module.exports = router;

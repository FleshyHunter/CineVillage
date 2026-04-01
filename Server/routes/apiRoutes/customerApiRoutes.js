const express = require("express");
const multer = require("multer");
const path = require("path");
const {
  registerCustomer,
  loginCustomer,
  getCurrentCustomer,
  updateCurrentCustomer,
  logoutCustomer,
  uploadCurrentCustomerPhoto
} = require("../../controllers/apiControllers/customerApiController");
const { requireCustomerAuth } = require("../../config/customerJwt");

const router = express.Router();
const storage = multer.diskStorage({
  destination: function destination(_req, _file, callback) {
    callback(null, "uploads/");
  },
  filename: function filename(_req, file, callback) {
    callback(null, `${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

router.post("/register", registerCustomer);
router.post("/login", loginCustomer);
router.get("/me", requireCustomerAuth, getCurrentCustomer);
router.patch("/me", requireCustomerAuth, updateCurrentCustomer);
router.post("/me/photo", requireCustomerAuth, upload.single("picture"), uploadCurrentCustomerPhoto);
router.post("/logout", logoutCustomer);

module.exports = router;

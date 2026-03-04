const express = require("express");
const router = express.Router();
const { getProfilePage, getEditProfilePage, updateProfile } = require("../controllers/profileController");
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

router.get("/", getProfilePage);
router.get("/edit", getEditProfilePage);
router.post("/edit", upload.single("picture"), updateProfile);

module.exports = router;

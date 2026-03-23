const express = require("express");
const router = express.Router();
const {
  getAllPersonnel,
  getCreatePersonnelForm,
  createPersonnel,
  getEditPersonnelForm,
  updatePersonnel,
  deletePersonnel
} = require("../controllers/personnelController");

router.get("/", getAllPersonnel);
router.get("/create", getCreatePersonnelForm);
router.post("/create", createPersonnel);
router.get("/edit/:role/:id", getEditPersonnelForm);
router.post("/edit/:role/:id", updatePersonnel);
router.post("/delete/:role/:id", deletePersonnel);

module.exports = router;

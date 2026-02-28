const express = require("express");
const router = express.Router();
const { createHall, getAllHalls, getHallbyId, updateHall, deleteHall } = require("../controllers/hallController");
const { initDBIfNecessary, getCollectionHall } = require("../config/database");
const { ObjectId } = require("mongodb");

const multer = require("multer");
const path = require("path");

//store hall photo uploads:
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

// GET hall creation form
router.get("/create", (req, res) => {
  res.render("halls/hallForm", {
    hall: null,
    isEdit: false,
    title: "Halls"
  });
});

// POST form submission
router.post("/create", upload.single("picture"), async (req, res) => {
  try {
    const hallData = req.body;

    if (req.file) {
      hallData.pictureUrl = "/uploads/" + req.file.filename;
    }

    await createHall(hallData);
    res.redirect("/halls");
  } catch (err) {
    console.error(err);
    res.send("Error creating hall");
  }
});

// GET edit form
router.get("/edit/:id", async (req, res) => {
  await initDBIfNecessary();

  const collectionHall = getCollectionHall();
  const hall = await collectionHall.findOne({
    _id: new ObjectId(req.params.id)
  });

  if (!hall) return res.send("Hall not found");

  res.render("halls/hallForm", {
    hall,
    isEdit: true,
    title: "Halls"
  });
});

// POST update
router.post("/edit/:id", upload.single("picture"), async (req, res) => {
  const hallData = req.body;

  if (req.file) {
    hallData.pictureUrl = "/uploads/" + req.file.filename;
  }

  await updateHall(req.params.id, hallData);
  res.redirect(`/halls/${req.params.id}`);
});

// delete
router.post("/delete/:id", async (req, res) => {
  try {
    await deleteHall(req.params.id);
    res.redirect("/halls");
  } catch (err) {
    console.error(err);
    res.send("Error deleting hall");
  }
});

// GET all halls (list/grid)
router.get("/", getAllHalls);

// GET single hall details
router.get("/:id", async (req, res) => {
  const hall = await getHallbyId(req.params.id);
  res.render('halls/hallDetails', { title: "Halls", isEdit: false, hall });
});

module.exports = router;

const express = require("express");
const router = express.Router();
const { createHall, getAllHalls, getHallbyId, updateHall, deleteHall } = require("../controllers/hallController");
const { updateScreeningStatuses } = require("../controllers/screeningController");
const { initDBIfNecessary, getCollectionHall, getCollectionScreening } = require("../config/database");
const { ObjectId } = require("mongodb");
const { requireRoles } = require("../config/session");
const { logAction } = require("../config/audit");

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
router.get("/create", requireRoles(["Admin", "Manager"]), (req, res) => {
  res.render("halls/hallForm", {
    hall: null,
    isEdit: false,
    title: "Halls",
    error: null
  });
});

// POST form submission
router.post("/create", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionHall = getCollectionHall();
    
    // Check if hall name already exists (case-insensitive)
    const escapedName = req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingHall = await collectionHall.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });
    
    if (existingHall) {
      return res.render("halls/hallForm", {
        hall: req.body,
        isEdit: false,
        title: "Halls",
        error: "Hall name already exists"
      });
    }
    
    const hallData = req.body;

    if (req.file) {
      hallData.pictureUrl = "/uploads/" + req.file.filename;
    }

    await createHall(hallData);
    await logAction(req, {
      module: "hall",
      operation: "create",
      item: hallData.name || ""
    });
    res.redirect("/halls");
  } catch (err) {
    console.error(err);
    res.send("Error creating hall");
  }
});

// GET edit form
router.get("/edit/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  await initDBIfNecessary();

  const collectionHall = getCollectionHall();
  const hall = await collectionHall.findOne({
    _id: new ObjectId(req.params.id)
  });

  if (!hall) return res.send("Hall not found");

  res.render("halls/hallForm", {
    hall,
    isEdit: true,
    title: "Halls",
    error: null
  });
});

// POST update

router.post("/edit/:id", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionHall = getCollectionHall();
    
    // Check if another hall with same name exists (case-insensitive, excluding current hall)
    const escapedName = req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingHall = await collectionHall.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      _id: { $ne: new ObjectId(req.params.id) }
    });
    
    if (existingHall) {
      const currentHall = await collectionHall.findOne({
        _id: new ObjectId(req.params.id)
      });
      return res.render("halls/hallForm", {
        hall: { ...currentHall, ...req.body, _id: req.params.id },
        isEdit: true,
        title: "Halls",
        error: "A hall with this name already exists. Please choose a different name."
      });
    }
    
    const hallData = req.body;

    if (req.file) {
      hallData.pictureUrl = "/uploads/" + req.file.filename;
    }

    await updateHall(req.params.id, hallData);
    await logAction(req, {
      module: "hall",
      operation: "update",
      targetId: req.params.id,
      item: hallData.name || ""
    });
    await updateScreeningStatuses();
    res.redirect(`/halls/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.send("Error updating hall");
  }
});

// delete
router.post("/delete/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionHall = getCollectionHall();
    const existingHall = ObjectId.isValid(req.params.id)
      ? await collectionHall.findOne({ _id: new ObjectId(req.params.id) })
      : null;
    await deleteHall(req.params.id);
    await logAction(req, {
      module: "hall",
      operation: "delete",
      targetId: req.params.id,
      item: existingHall?.name || ""
    });
    res.redirect("/halls");
  } catch (err) {
    console.error(err);
    if (err.message && err.message.includes("Cannot delete hall")) {
      return res.redirect(`/halls/${req.params.id}?deleteError=${encodeURIComponent(err.message)}`);
    }
    res.send("Error deleting hall");
  }
});

// GET all halls (list/grid)
router.get("/", requireRoles(["Admin", "Manager", "Staff"]), getAllHalls);

// GET single hall details
router.get("/:id", requireRoles(["Admin", "Manager", "Staff"]), async (req, res) => {
  await initDBIfNecessary();
  const hall = await getHallbyId(req.params.id);
  const collectionScreening = getCollectionScreening();
  const totalLinkedScreeningCount = ObjectId.isValid(req.params.id)
    ? await collectionScreening.countDocuments({ hallId: new ObjectId(req.params.id) })
    : 0;
  const activeLinkedScreeningCount = ObjectId.isValid(req.params.id)
    ? await collectionScreening.countDocuments({
        hallId: new ObjectId(req.params.id),
        status: { $in: ["scheduled", "ongoing", "paused"] }
      })
    : 0;
  res.render('halls/hallDetails', {
    title: "Halls",
    isEdit: false,
    hall,
    totalLinkedScreeningCount,
    activeLinkedScreeningCount,
    deleteError: req.query.deleteError || null
  });
});

module.exports = router;

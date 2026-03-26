const express = require("express");
const multer = require("multer");
const path = require("path");
const { requireRoles } = require("../config/session");
const { logAction } = require("../config/audit");
const {
  normalizeAddOnData,
  createAddOn,
  getAllAddOns,
  getAddOnById,
  updateAddOn,
  deleteAddOn
} = require("../controllers/addOnController");

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) return "/addons";
  if (returnTo.startsWith("//")) return "/addons";
  return returnTo;
}

router.get("/", requireRoles(["Admin", "Manager", "Staff"]), getAllAddOns);

router.get("/create", requireRoles(["Admin", "Manager"]), (req, res) => {
  res.render("addons/addOnForm", {
    title: "Add-Ons",
    addOn: null,
    isEdit: false,
    error: null,
    returnTo: "/addons"
  });
});

router.post("/create", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    const addOnData = normalizeAddOnData(req.body);
    if (!addOnData.name) {
      return res.render("addons/addOnForm", {
        title: "Add-Ons",
        addOn: addOnData,
        isEdit: false,
        error: "Add-on name is required.",
        returnTo: "/addons"
      });
    }

    if (req.file) {
      addOnData.pictureUrl = `/uploads/${req.file.filename}`;
    }

    await createAddOn(addOnData);
    await logAction(req, {
      module: "addon",
      operation: "create",
      item: addOnData.name || ""
    });
    return res.redirect("/addons");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error creating add-on");
  }
});

router.get("/edit/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  const addOn = await getAddOnById(req.params.id);
  if (!addOn) return res.status(404).send("Add-on not found");

  return res.render("addons/addOnForm", {
    title: "Add-Ons",
    addOn,
    isEdit: true,
    error: null,
    returnTo: sanitizeReturnTo(req.query.returnTo || "/addons")
  });
});

router.post("/edit/:id", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    const existing = await getAddOnById(req.params.id);
    if (!existing) return res.status(404).send("Add-on not found");

    const addOnData = normalizeAddOnData(req.body);
    if (!addOnData.name) {
      return res.render("addons/addOnForm", {
        title: "Add-Ons",
        addOn: { ...existing, ...addOnData, _id: req.params.id },
        isEdit: true,
        error: "Add-on name is required.",
        returnTo: sanitizeReturnTo(req.body.returnTo || "/addons")
      });
    }

    if (req.file) {
      addOnData.pictureUrl = `/uploads/${req.file.filename}`;
    } else if (!addOnData.pictureUrl) {
      addOnData.pictureUrl = existing.pictureUrl || "";
    }

    await updateAddOn(req.params.id, addOnData);
    await logAction(req, {
      module: "addon",
      operation: "update",
      targetId: req.params.id,
      item: addOnData.name || ""
    });

    return res.redirect(`/addons/${req.params.id}?returnTo=${encodeURIComponent(sanitizeReturnTo(req.body.returnTo || "/addons"))}`);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error updating add-on");
  }
});

router.post("/delete/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  try {
    const existing = await getAddOnById(req.params.id);
    await deleteAddOn(req.params.id);
    await logAction(req, {
      module: "addon",
      operation: "delete",
      targetId: req.params.id,
      item: existing?.name || ""
    });
    return res.redirect("/addons");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error deleting add-on");
  }
});

router.get("/:id", requireRoles(["Admin", "Manager", "Staff"]), async (req, res) => {
  const addOn = await getAddOnById(req.params.id);
  if (!addOn) return res.status(404).send("Add-on not found");

  return res.render("addons/addOnDetails", {
    title: "Add-Ons",
    addOn,
    returnTo: sanitizeReturnTo(req.query.returnTo || "/addons")
  });
});

module.exports = router;

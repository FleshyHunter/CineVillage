const express = require("express");
const multer = require("multer");
const path = require("path");
const { requireRoles } = require("../config/session");
const { logAction } = require("../config/audit");
const {
  initDBIfNecessary,
  getCollectionAddOn
} = require("../config/database");
const {
  normalizePromotionData,
  validatePromotionDateRange,
  validatePromotionStructure,
  createPromotion,
  getAllPromotions,
  getPromotionById,
  updatePromotion,
  deletePromotion
} = require("../controllers/promotionController");

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
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) return "/promotions";
  if (returnTo.startsWith("//")) return "/promotions";
  return returnTo;
}

async function getBundleItemCatalog() {
  await initDBIfNecessary();
  const collectionAddOn = getCollectionAddOn();
  const addOns = await collectionAddOn
    .find({})
    .sort({ name: 1, _id: 1 })
    .toArray();

  const ticketItems = [
    { value: "ticket:standard", label: "Ticket · Standard" },
    { value: "ticket:imax", label: "Ticket · IMAX" },
    { value: "ticket:vip", label: "Ticket · VIP" }
  ];

  const addOnItems = addOns.map((item) => ({
    value: `addon:${String(item._id)}`,
    label: `Add-on · ${(item.name || "Unnamed Add-on").toString().trim()}`
  }));

  return [...ticketItems, ...addOnItems];
}

async function renderPromotionForm(res, {
  promotion,
  isEdit,
  error,
  returnTo
}) {
  const bundleItemCatalog = await getBundleItemCatalog();

  return res.render("promotions/promotionForm", {
    title: "Promotions",
    promotion,
    isEdit,
    error,
    returnTo,
    bundleItemCatalog
  });
}

router.get("/", requireRoles(["Admin", "Manager", "Staff"]), getAllPromotions);

router.get("/create", requireRoles(["Admin", "Manager"]), async (req, res) => {
  try {
    return await renderPromotionForm(res, {
      promotion: null,
      isEdit: false,
      error: null,
      returnTo: "/promotions"
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error loading promotion form");
  }
});

router.post("/create", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    const promotionData = normalizePromotionData(req.body);
    if (!promotionData.name) {
      return await renderPromotionForm(res, {
        promotion: promotionData,
        isEdit: false,
        error: "Promotion name is required.",
        returnTo: "/promotions"
      });
    }

    const dateRangeError = validatePromotionDateRange(promotionData);
    if (dateRangeError) {
      return await renderPromotionForm(res, {
        promotion: promotionData,
        isEdit: false,
        error: dateRangeError,
        returnTo: "/promotions"
      });
    }

    const structureError = validatePromotionStructure(promotionData);
    if (structureError) {
      return await renderPromotionForm(res, {
        promotion: promotionData,
        isEdit: false,
        error: structureError,
        returnTo: "/promotions"
      });
    }

    if (req.file) {
      promotionData.pictureUrl = `/uploads/${req.file.filename}`;
    }

    await createPromotion(promotionData);
    await logAction(req, {
      module: "promotion",
      operation: "create",
      item: promotionData.name || ""
    });
    return res.redirect("/promotions");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error creating promotion");
  }
});

router.get("/edit/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  const promotion = await getPromotionById(req.params.id);
  if (!promotion) return res.status(404).send("Promotion not found");

  return await renderPromotionForm(res, {
    promotion,
    isEdit: true,
    error: null,
    returnTo: sanitizeReturnTo(req.query.returnTo || "/promotions")
  });
});

router.post("/edit/:id", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    const existing = await getPromotionById(req.params.id);
    if (!existing) return res.status(404).send("Promotion not found");

    const promotionData = normalizePromotionData(req.body);
    if (!promotionData.name) {
      return await renderPromotionForm(res, {
        promotion: { ...existing, ...promotionData, _id: req.params.id },
        isEdit: true,
        error: "Promotion name is required.",
        returnTo: sanitizeReturnTo(req.body.returnTo || "/promotions")
      });
    }

    const dateRangeError = validatePromotionDateRange(promotionData);
    if (dateRangeError) {
      return await renderPromotionForm(res, {
        promotion: { ...existing, ...promotionData, _id: req.params.id },
        isEdit: true,
        error: dateRangeError,
        returnTo: sanitizeReturnTo(req.body.returnTo || "/promotions")
      });
    }

    const structureError = validatePromotionStructure(promotionData);
    if (structureError) {
      return await renderPromotionForm(res, {
        promotion: { ...existing, ...promotionData, _id: req.params.id },
        isEdit: true,
        error: structureError,
        returnTo: sanitizeReturnTo(req.body.returnTo || "/promotions")
      });
    }

    if (req.file) {
      promotionData.pictureUrl = `/uploads/${req.file.filename}`;
    } else if (!promotionData.pictureUrl) {
      promotionData.pictureUrl = existing.pictureUrl || "";
    }

    await updatePromotion(req.params.id, promotionData);
    await logAction(req, {
      module: "promotion",
      operation: "update",
      targetId: req.params.id,
      item: promotionData.name || ""
    });

    return res.redirect(`/promotions/${req.params.id}?returnTo=${encodeURIComponent(sanitizeReturnTo(req.body.returnTo || "/promotions"))}`);
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error updating promotion");
  }
});

router.post("/delete/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  try {
    const existing = await getPromotionById(req.params.id);
    await deletePromotion(req.params.id);
    await logAction(req, {
      module: "promotion",
      operation: "delete",
      targetId: req.params.id,
      item: existing?.name || ""
    });
    return res.redirect("/promotions");
  } catch (error) {
    console.error(error);
    return res.status(500).send("Error deleting promotion");
  }
});

router.get("/:id", requireRoles(["Admin", "Manager", "Staff"]), async (req, res) => {
  const promotion = await getPromotionById(req.params.id);
  if (!promotion) return res.status(404).send("Promotion not found");

  return res.render("promotions/promotionDetails", {
    title: "Promotions",
    promotion,
    returnTo: sanitizeReturnTo(req.query.returnTo || "/promotions")
  });
});

module.exports = router;

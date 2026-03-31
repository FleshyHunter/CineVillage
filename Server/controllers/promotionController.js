const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../config/database");

function normalizeText(value) {
  return (value || "").toString().trim();
}

const PROMOTION_TYPES = new Set(["all", "vip", "imax", "standard"]);

function normalizeDateString(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
}

function normalizePromotionType(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!PROMOTION_TYPES.has(normalized)) return "all";
  return normalized;
}

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function normalizePromotionData(raw = {}) {
  return {
    name: normalizeText(raw.name),
    type: normalizePromotionType(raw.type),
    description: normalizeText(raw.description),
    promotionStartDate: normalizeDateString(raw.promotionStartDate),
    promotionEndDate: normalizeDateString(raw.promotionEndDate),
    code: normalizeText(raw.code),
    pictureUrl: normalizeText(raw.pictureUrl)
  };
}

function validatePromotionDateRange(promotionData = {}) {
  const hasStartDate = Boolean(promotionData.promotionStartDate);
  const hasEndDate = Boolean(promotionData.promotionEndDate);

  if (hasStartDate !== hasEndDate) {
    return "Please provide both start date and end date.";
  }

  if (hasStartDate && hasEndDate && promotionData.promotionEndDate < promotionData.promotionStartDate) {
    return "End date must be on or after start date.";
  }

  return null;
}

async function createPromotion(promotionData) {
  await initDBIfNecessary();
  const collectionPromotion = getCollectionPromotion();
  await collectionPromotion.insertOne({
    ...promotionData,
    created: new Date()
  });
}

async function getAllPromotions(req, res) {
  await initDBIfNecessary();
  const collectionPromotion = getCollectionPromotion();
  const promotions = await collectionPromotion.find({}).sort({ created: -1, _id: -1 }).toArray();

  res.render("promotions/promotionList", {
    title: "Promotions",
    promotions
  });
}

async function getPromotionById(id) {
  await initDBIfNecessary();
  const objectId = toObjectIdSafe(id);
  if (!objectId) return null;

  const collectionPromotion = getCollectionPromotion();
  return collectionPromotion.findOne({ _id: objectId });
}

async function updatePromotion(id, promotionData) {
  await initDBIfNecessary();
  const objectId = toObjectIdSafe(id);
  if (!objectId) throw new Error("Invalid promotion ID");

  const collectionPromotion = getCollectionPromotion();
  await collectionPromotion.updateOne(
    { _id: objectId },
    { $set: promotionData }
  );
}

async function deletePromotion(id) {
  await initDBIfNecessary();
  const objectId = toObjectIdSafe(id);
  if (!objectId) throw new Error("Invalid promotion ID");

  const collectionPromotion = getCollectionPromotion();
  await collectionPromotion.deleteOne({ _id: objectId });
}

module.exports = {
  PROMOTION_TYPES,
  normalizePromotionData,
  validatePromotionDateRange,
  createPromotion,
  getAllPromotions,
  getPromotionById,
  updatePromotion,
  deletePromotion
};

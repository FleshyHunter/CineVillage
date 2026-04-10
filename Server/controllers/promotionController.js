const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../config/database");
const {
  PROMOTION_TYPES,
  CONDITION_TYPES,
  BENEFIT_TYPES,
  normalizePromotionData,
  validatePromotionDateRange,
  validatePromotionStructure
} = require("./promotionRules");

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
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
  CONDITION_TYPES,
  BENEFIT_TYPES,
  normalizePromotionData,
  validatePromotionDateRange,
  validatePromotionStructure,
  createPromotion,
  getAllPromotions,
  getPromotionById,
  updatePromotion,
  deletePromotion
};

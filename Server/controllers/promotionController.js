const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../config/database");

function normalizeText(value) {
  return (value || "").toString().trim();
}

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function normalizePromotionData(raw = {}) {
  const durationValue = normalizeText(raw.duration);
  const parsedDuration = Number.parseInt(durationValue, 10);

  return {
    name: normalizeText(raw.name),
    description: normalizeText(raw.description),
    duration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : "",
    code: normalizeText(raw.code),
    pictureUrl: normalizeText(raw.pictureUrl)
  };
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
  normalizePromotionData,
  createPromotion,
  getAllPromotions,
  getPromotionById,
  updatePromotion,
  deletePromotion
};

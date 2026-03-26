const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionAddOn
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

function normalizeAddOnData(raw = {}) {
  const priceValue = normalizeText(raw.price);
  const parsedPrice = Number.parseFloat(priceValue);

  return {
    name: normalizeText(raw.name),
    price: Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : 0,
    description: normalizeText(raw.description),
    pictureUrl: normalizeText(raw.pictureUrl)
  };
}

async function createAddOn(addOnData) {
  await initDBIfNecessary();
  const collectionAddOn = getCollectionAddOn();
  await collectionAddOn.insertOne({
    ...addOnData,
    created: new Date()
  });
}

async function getAllAddOns(req, res) {
  await initDBIfNecessary();
  const collectionAddOn = getCollectionAddOn();
  const addOns = await collectionAddOn.find({}).sort({ created: -1, _id: -1 }).toArray();

  res.render("addons/addOnList", {
    title: "Add-Ons",
    addOns
  });
}

async function getAddOnById(id) {
  await initDBIfNecessary();
  const objectId = toObjectIdSafe(id);
  if (!objectId) return null;

  const collectionAddOn = getCollectionAddOn();
  return collectionAddOn.findOne({ _id: objectId });
}

async function updateAddOn(id, addOnData) {
  await initDBIfNecessary();
  const objectId = toObjectIdSafe(id);
  if (!objectId) throw new Error("Invalid add-on ID");

  const collectionAddOn = getCollectionAddOn();
  await collectionAddOn.updateOne(
    { _id: objectId },
    { $set: addOnData }
  );
}

async function deleteAddOn(id) {
  await initDBIfNecessary();
  const objectId = toObjectIdSafe(id);
  if (!objectId) throw new Error("Invalid add-on ID");

  const collectionAddOn = getCollectionAddOn();
  await collectionAddOn.deleteOne({ _id: objectId });
}

module.exports = {
  normalizeAddOnData,
  createAddOn,
  getAllAddOns,
  getAddOnById,
  updateAddOn,
  deleteAddOn
};

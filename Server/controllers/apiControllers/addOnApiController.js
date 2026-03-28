const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionAddOn
} = require("../../config/database");

const ADD_ON_TYPES = new Set(["ala_carte", "combo"]);

function normalizeAddOnType(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!ADD_ON_TYPES.has(normalized)) return "ala_carte";
  return normalized;
}

function serializeAddOn(addOn) {
  if (!addOn) return null;

  return {
    ...addOn,
    _id: String(addOn._id),
    type: normalizeAddOnType(addOn.type)
  };
}

function buildAddOnFilters(query = {}) {
  const filters = {};

  if (query.status) {
    filters.status = query.status.toString().trim();
  }

  return filters;
}

function parseLimit(limitValue) {
  if (!limitValue) return 0;

  const parsed = Number.parseInt(limitValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return parsed;
}

async function listAddOns(req, res) {
  try {
    await initDBIfNecessary();

    const filters = buildAddOnFilters(req.query);
    const limit = parseLimit(req.query.limit);
    const collectionAddOn = getCollectionAddOn();

    let cursor = collectionAddOn.find(filters).sort({
      created: -1,
      _id: -1
    });

    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const items = (await cursor.toArray()).map(serializeAddOn);

    return res.json({
      items,
      total: items.length
    });
  } catch (error) {
    console.error("Error listing add-ons:", error);
    return res.status(500).json({
      error: "Failed to fetch add-ons"
    });
  }
}

async function getAddOnById(req, res) {
  try {
    await initDBIfNecessary();

    const id = (req.params.id || "").toString().trim();
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid add-on ID"
      });
    }

    const collectionAddOn = getCollectionAddOn();
    const addOn = await collectionAddOn.findOne({
      _id: new ObjectId(id)
    });

    if (!addOn) {
      return res.status(404).json({
        error: "Add-on not found"
      });
    }

    return res.json({
      item: serializeAddOn(addOn)
    });
  } catch (error) {
    console.error("Error fetching add-on:", error);
    return res.status(500).json({
      error: "Failed to fetch add-on"
    });
  }
}

module.exports = {
  listAddOns,
  getAddOnById
};

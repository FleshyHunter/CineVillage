const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../../config/database");

function serializePromotion(promotion) {
  if (!promotion) return null;

  return {
    ...promotion,
    _id: String(promotion._id)
  };
}

function buildPromotionFilters(query = {}) {
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

async function listPromotions(req, res) {
  try {
    await initDBIfNecessary();

    const filters = buildPromotionFilters(req.query);
    const limit = parseLimit(req.query.limit);
    const collectionPromotion = getCollectionPromotion();

    let cursor = collectionPromotion.find(filters).sort({
      created: -1,
      _id: -1
    });

    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const items = (await cursor.toArray()).map(serializePromotion);

    return res.json({
      items,
      total: items.length
    });
  } catch (error) {
    console.error("Error listing promotions:", error);
    return res.status(500).json({
      error: "Failed to fetch promotions"
    });
  }
}

async function getPromotionById(req, res) {
  try {
    await initDBIfNecessary();

    const id = (req.params.id || "").toString().trim();
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        error: "Invalid promotion ID"
      });
    }

    const collectionPromotion = getCollectionPromotion();
    const promotion = await collectionPromotion.findOne({
      _id: new ObjectId(id)
    });

    if (!promotion) {
      return res.status(404).json({
        error: "Promotion not found"
      });
    }

    return res.json({
      item: serializePromotion(promotion)
    });
  } catch (error) {
    console.error("Error fetching promotion:", error);
    return res.status(500).json({
      error: "Failed to fetch promotion"
    });
  }
}

module.exports = {
  listPromotions,
  getPromotionById
};

const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../../config/database");
const {
  normalizeDateString,
  normalizePromotionType,
  getTodayIsoDate,
  serializePromotion
} = require("../promotionRules");

function buildPromotionFilters(query = {}) {
  const filters = {};

  if (query.status) {
    filters.status = query.status.toString().trim();
  }

  if (query.type) {
    filters.type = normalizePromotionType(query.type);
  }

  if (query.code) {
    filters.code = query.code.toString().trim();
  }

  if (query.q) {
    const keyword = query.q.toString().trim();
    if (keyword) {
      const regex = { $regex: keyword, $options: "i" };
      filters.$or = [
        { name: regex },
        { description: regex },
        { code: regex }
      ];
    }
  }

  const activeOn = normalizeDateString(query.activeOn);
  if (activeOn) {
    filters.promotionStartDate = { ...(filters.promotionStartDate || {}), $lte: activeOn };
    filters.promotionEndDate = { ...(filters.promotionEndDate || {}), $gte: activeOn };
  }

  const fromDate = normalizeDateString(query.fromDate);
  if (fromDate) {
    filters.promotionEndDate = { ...(filters.promotionEndDate || {}), $gte: fromDate };
  }

  const toDate = normalizeDateString(query.toDate);
  if (toDate) {
    filters.promotionStartDate = { ...(filters.promotionStartDate || {}), $lte: toDate };
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
    const asOfDate = normalizeDateString(req.query.activeOn) || getTodayIsoDate();
    const limit = parseLimit(req.query.limit);
    const collectionPromotion = getCollectionPromotion();

    let cursor = collectionPromotion.find(filters).sort({
      created: -1,
      _id: -1
    });

    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const items = (await cursor.toArray()).map((promotion) => serializePromotion(promotion, asOfDate));

    return res.json({
      items,
      total: items.length,
      asOfDate
    });
  } catch (error) {
    console.error("Error listing promotions:", error);
    return res.status(500).json({
      error: "Failed to fetch promotions"
    });
  }
}

async function listActivePromotions(req, res) {
  try {
    await initDBIfNecessary();

    const asOfDate = normalizeDateString(req.query.activeOn) || getTodayIsoDate();
    const filters = buildPromotionFilters({
      ...req.query,
      activeOn: asOfDate
    });
    const limit = parseLimit(req.query.limit);
    const collectionPromotion = getCollectionPromotion();

    let cursor = collectionPromotion.find(filters).sort({
      created: -1,
      _id: -1
    });

    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const items = (await cursor.toArray()).map((promotion) => serializePromotion(promotion, asOfDate));

    return res.json({
      items,
      total: items.length,
      asOfDate
    });
  } catch (error) {
    console.error("Error listing active promotions:", error);
    return res.status(500).json({
      error: "Failed to fetch active promotions"
    });
  }
}

async function getPromotionById(req, res) {
  try {
    await initDBIfNecessary();

    const asOfDate = normalizeDateString(req.query.activeOn) || getTodayIsoDate();
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
      item: serializePromotion(promotion, asOfDate),
      asOfDate
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
  listActivePromotions,
  getPromotionById
};

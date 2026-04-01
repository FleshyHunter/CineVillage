const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../../config/database");

const PROMOTION_TYPES = new Set(["all", "vip", "imax", "standard"]);
const CONDITION_TYPES = new Set([
  "USER_ROLE",
  "HALL_TYPE",
  "MINIMUM_SPEND",
  "DAY_OF_WEEK",
  "PAYMENT_METHOD"
]);
const BENEFIT_TYPES = new Set([
  "DISCOUNT",
  "CREDIT",
  "FIXED_PRICE",
  "BUNDLE_PRICE",
  "CART_CAP",
  "SET_FINAL_PRICE"
]);

function normalizeDateString(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = value.toString().trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizePromotionType(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (!PROMOTION_TYPES.has(normalized)) return "all";
  return normalized;
}

function normalizeNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeConditionType(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!CONDITION_TYPES.has(normalized)) return "";
  return normalized;
}

function normalizeConditionsForResponse(conditions) {
  if (!Array.isArray(conditions)) return [];

  return conditions
    .map((condition) => {
      if (!condition || typeof condition !== "object") return null;
      const type = normalizeConditionType(condition.type);
      if (!type) return null;
      let value = condition.value;
      if (type === "MINIMUM_SPEND") {
        value = normalizeNonNegativeNumber(value, 0);
      } else if (type === "HALL_TYPE") {
        value = normalizePromotionType(value);
      } else {
        value = (value || "").toString().trim().toLowerCase();
      }

      return { type, value };
    })
    .filter(Boolean);
}

function normalizeBenefitType(value) {
  const normalized = (value || "").toString().trim().toUpperCase();
  if (!BENEFIT_TYPES.has(normalized)) return "";
  return normalized;
}

function normalizeBenefitForResponse(benefit, promotion = {}) {
  if (benefit && typeof benefit === "object") {
    const type = normalizeBenefitType(benefit.type);
    if (type) {
      return {
        type,
        target: (benefit.target || "").toString().trim().toLowerCase() || "cart",
        value: normalizeNonNegativeNumber(benefit.value, 0)
      };
    }
  }

  const fallbackDiscountValue = normalizeNonNegativeNumber(
    promotion.discountAmount ?? promotion.discountValue,
    0
  );
  if (fallbackDiscountValue > 0) {
    return {
      type: "DISCOUNT",
      target: "cart",
      value: fallbackDiscountValue
    };
  }

  return null;
}

function deriveTypeFromConditions(conditions = []) {
  const hallTypeCondition = conditions.find((condition) => condition?.type === "HALL_TYPE");
  if (!hallTypeCondition) return "";
  return normalizePromotionType(hallTypeCondition.value);
}

function normalizeUsageLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function deriveDiscountFields(benefit, promotion = {}) {
  if (benefit?.type === "DISCOUNT") {
    const value = normalizeNonNegativeNumber(benefit.value, 0);
    return {
      discountType: "amount",
      discountValue: value,
      discountAmount: value
    };
  }

  return {
    discountType: (promotion.discountType || "").toString().trim().toLowerCase(),
    discountValue: normalizeNonNegativeNumber(promotion.discountValue, 0),
    discountAmount: normalizeNonNegativeNumber(promotion.discountAmount, 0)
  };
}

function getTodayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isPromotionActive(promotion, asOfDate) {
  const startDate = normalizeDateString(promotion?.validity?.startDate || promotion?.promotionStartDate);
  const endDate = normalizeDateString(promotion?.validity?.endDate || promotion?.promotionEndDate);
  if (!startDate || !endDate) return false;

  return startDate <= asOfDate && asOfDate <= endDate;
}

function serializePromotion(promotion, asOfDate = getTodayIsoDate()) {
  if (!promotion) return null;

  const conditions = normalizeConditionsForResponse(promotion.conditions);
  const benefit = normalizeBenefitForResponse(promotion.benefit, promotion);
  const startDate = normalizeDateString(promotion?.validity?.startDate || promotion.promotionStartDate);
  const endDate = normalizeDateString(promotion?.validity?.endDate || promotion.promotionEndDate);
  const usageLimit = normalizeUsageLimit(promotion?.validity?.usageLimit ?? promotion.usageLimit);
  const normalizedType = deriveTypeFromConditions(conditions) || normalizePromotionType(promotion.type);
  const discountFields = deriveDiscountFields(benefit, promotion);

  return {
    ...promotion,
    _id: String(promotion._id),
    type: normalizedType,
    created: promotion.created instanceof Date
      ? promotion.created.toISOString()
      : (promotion.created || ""),
    conditions,
    benefit,
    validity: {
      startDate,
      endDate,
      usageLimit
    },
    promotionStartDate: startDate,
    promotionEndDate: endDate,
    usageLimit,
    priority: Number.parseInt(promotion.priority, 10) || 0,
    stackable: Boolean(promotion.stackable),
    discountType: discountFields.discountType,
    discountValue: discountFields.discountValue,
    discountAmount: discountFields.discountAmount,
    dateRange: {
      startDate,
      endDate,
      hasRange: Boolean(startDate && endDate)
    },
    isActive: isPromotionActive(promotion, asOfDate)
  };
}

function buildPromotionFilters(query = {}) {
  const filters = {};

  if (query.status) {
    filters.status = query.status.toString().trim();
  }

  const promotionType = normalizePromotionType(query.type);
  if (query.type) {
    filters.type = promotionType;
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

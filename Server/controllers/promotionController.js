const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionPromotion
} = require("../config/database");

function normalizeText(value) {
  return (value || "").toString().trim();
}

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

function normalizeNonNegativeNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeOptionalUsageLimit(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizePriority(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return 0;
  return parsed;
}

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "true"
    || normalized === "1"
    || normalized === "yes"
    || normalized === "on";
}

function parseJsonSafe(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "object") return value;

  const raw = normalizeText(value);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function normalizeConditionType(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (!CONDITION_TYPES.has(normalized)) return "";
  return normalized;
}

function normalizeConditionValue(type, value) {
  if (!type) return "";

  if (type === "MINIMUM_SPEND") {
    return normalizeNonNegativeNumber(value, 0);
  }

  if (type === "HALL_TYPE") {
    return normalizePromotionType(value);
  }

  return normalizeText(value).toLowerCase();
}

function hasConditionValue(type, value) {
  if (type === "MINIMUM_SPEND") {
    return Number.isFinite(value) && value >= 0;
  }
  return Boolean(normalizeText(value));
}

function normalizeConditions(rawConditions) {
  const parsed = parseJsonSafe(rawConditions, []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const type = normalizeConditionType(item.type);
      if (!type) return null;

      const value = normalizeConditionValue(type, item.value);
      if (!hasConditionValue(type, value)) return null;

      return { type, value };
    })
    .filter(Boolean);
}

function normalizeBenefitType(value) {
  const normalized = normalizeText(value).toUpperCase();
  if (!BENEFIT_TYPES.has(normalized)) return "";
  return normalized;
}

function getDefaultBenefitTarget(benefitType) {
  if (benefitType === "FIXED_PRICE") return "tickets";
  if (benefitType === "CREDIT") return "addons";
  return "cart";
}

function normalizeBenefit(rawBenefit, fallback = {}) {
  const parsed = parseJsonSafe(rawBenefit, {});
  const source = (parsed && typeof parsed === "object") ? parsed : {};

  let type = normalizeBenefitType(source.type || fallback.benefitType);
  let target = normalizeText(source.target || fallback.benefitTarget).toLowerCase();
  let value = normalizeNonNegativeNumber(source.value ?? fallback.benefitValue, NaN);

  if (!type) {
    const legacyDiscountAmount = normalizeNonNegativeNumber(
      fallback.discountAmount ?? fallback.discountValue,
      0
    );
    if (legacyDiscountAmount > 0) {
      type = "DISCOUNT";
      target = "cart";
      value = legacyDiscountAmount;
    }
  }

  if (!type) return null;
  if (!target) target = getDefaultBenefitTarget(type);
  if (!Number.isFinite(value) || value < 0) value = 0;

  return {
    type,
    target,
    value
  };
}

function derivePromotionTypeFromConditions(conditions = []) {
  const hallTypeCondition = conditions.find((condition) => condition?.type === "HALL_TYPE");
  if (!hallTypeCondition) return "";
  return normalizePromotionType(hallTypeCondition.value);
}

function deriveLegacyDiscountFields(benefit) {
  if (!benefit || typeof benefit !== "object") {
    return {
      discountType: "",
      discountValue: 0,
      discountAmount: 0
    };
  }

  if (benefit.type === "DISCOUNT") {
    const amount = normalizeNonNegativeNumber(benefit.value, 0);
    return {
      discountType: "amount",
      discountValue: amount,
      discountAmount: amount
    };
  }

  return {
    discountType: "",
    discountValue: 0,
    discountAmount: 0
  };
}

function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === "string" && ObjectId.isValid(value)) return new ObjectId(value);
  return null;
}

function normalizePromotionData(raw = {}) {
  const conditions = normalizeConditions(raw.conditionsJson ?? raw.conditions);
  const benefit = normalizeBenefit(raw.benefitJson ?? raw.benefit, raw);
  const promotionTypeFromConditions = derivePromotionTypeFromConditions(conditions);
  const promotionType = promotionTypeFromConditions || normalizePromotionType(raw.type);
  const validity = {
    startDate: normalizeDateString(raw.validity?.startDate || raw.promotionStartDate),
    endDate: normalizeDateString(raw.validity?.endDate || raw.promotionEndDate),
    usageLimit: normalizeOptionalUsageLimit(raw.validity?.usageLimit ?? raw.usageLimit)
  };
  const legacyDiscount = deriveLegacyDiscountFields(benefit);

  return {
    name: normalizeText(raw.name),
    type: promotionType,
    description: normalizeText(raw.description),
    promotionStartDate: validity.startDate,
    promotionEndDate: validity.endDate,
    code: normalizeText(raw.code),
    pictureUrl: normalizeText(raw.pictureUrl),
    conditions,
    benefit,
    validity,
    usageLimit: validity.usageLimit,
    priority: normalizePriority(raw.priority),
    stackable: normalizeBoolean(raw.stackable),
    discountType: legacyDiscount.discountType,
    discountValue: legacyDiscount.discountValue,
    discountAmount: legacyDiscount.discountAmount
  };
}

function validatePromotionDateRange(promotionData = {}) {
  const startDate = normalizeDateString(
    promotionData?.validity?.startDate || promotionData.promotionStartDate
  );
  const endDate = normalizeDateString(
    promotionData?.validity?.endDate || promotionData.promotionEndDate
  );
  const hasStartDate = Boolean(startDate);
  const hasEndDate = Boolean(endDate);

  if (hasStartDate !== hasEndDate) {
    return "Please provide both start date and end date.";
  }

  if (hasStartDate && hasEndDate && endDate < startDate) {
    return "End date must be on or after start date.";
  }

  return null;
}

function validatePromotionStructure(promotionData = {}) {
  const benefit = promotionData?.benefit;
  if (!benefit || typeof benefit !== "object" || !normalizeBenefitType(benefit.type)) {
    return "Please define a valid promotion benefit.";
  }

  const benefitValue = Number(benefit.value);
  if (!Number.isFinite(benefitValue) || benefitValue < 0) {
    return "Promotion benefit value must be a non-negative number.";
  }

  if (!Array.isArray(promotionData.conditions)) {
    return "Promotion conditions format is invalid.";
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

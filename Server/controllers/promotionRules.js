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
const BENEFIT_TARGETS = new Set(["cart", "tickets", "addons"]);
const BUNDLE_GROUP_TYPES = new Set(["fixed", "selectable"]);
const DAY_OF_WEEK_VALUES = new Set([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday"
]);

function normalizeText(value) {
  return (value || "").toString().trim();
}

function normalizeDateString(value) {
  if (!value) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const raw = normalizeText(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
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
    return normalizeNonNegativeNumber(value, NaN);
  }

  if (type === "HALL_TYPE") {
    return normalizePromotionType(value);
  }

  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return "";

  if (type === "DAY_OF_WEEK" && !DAY_OF_WEEK_VALUES.has(normalized)) {
    return "";
  }

  return normalized;
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
      if (type === "MINIMUM_SPEND") {
        if (!Number.isFinite(value) || value < 0) return null;
      } else if (!value) {
        return null;
      }

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

  // Backward compatibility for legacy records/forms; new writes should use benefit object.
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
  if (!target || !BENEFIT_TARGETS.has(target)) target = getDefaultBenefitTarget(type);
  if (!Number.isFinite(value) || value < 0) value = 0;

  return {
    type,
    target,
    value
  };
}

function normalizeBundleGroup(group = {}) {
  const source = (group && typeof group === "object") ? group : {};
  const normalizedType = normalizeText(source.type).toLowerCase();
  const quantity = Number.parseInt(source.quantity, 10);

  return {
    name: normalizeText(source.name),
    type: BUNDLE_GROUP_TYPES.has(normalizedType) ? normalizedType : "",
    items: Array.isArray(source.items)
      ? source.items.map((item) => normalizeText(item)).filter(Boolean)
      : [],
    quantity: Number.isInteger(quantity) && quantity >= 1 ? quantity : 0
  };
}

function normalizeBundleConfig(rawBundleConfig) {
  const parsed = parseJsonSafe(rawBundleConfig, {});
  const source = (parsed && typeof parsed === "object") ? parsed : {};
  const rawGroups = Array.isArray(source.groups) ? source.groups : [];

  return {
    groups: rawGroups.map((group) => normalizeBundleGroup(group)).filter((group) => group.name || group.items.length)
  };
}

function derivePromotionTypeFromConditions(conditions = []) {
  const hallTypeCondition = conditions.find((condition) => condition?.type === "HALL_TYPE");
  if (!hallTypeCondition) return "";
  return normalizePromotionType(hallTypeCondition.value);
}

function normalizeValidity(raw = {}) {
  const startDate = normalizeDateString(raw.validity?.startDate || raw.promotionStartDate);
  const endDate = normalizeDateString(raw.validity?.endDate || raw.promotionEndDate);
  const usageLimit = normalizeOptionalUsageLimit(raw.validity?.usageLimit ?? raw.usageLimit);

  return {
    startDate,
    endDate,
    usageLimit
  };
}

function normalizePromotionData(raw = {}) {
  const conditions = normalizeConditions(raw.conditionsJson ?? raw.conditions);
  const benefit = normalizeBenefit(raw.benefitJson ?? raw.benefit, raw);
  const bundleConfig = normalizeBundleConfig(raw.bundleConfigJson ?? raw.bundleConfig ?? raw.benefit?.bundleConfig);
  const validity = normalizeValidity(raw);
  const promotionTypeFromConditions = derivePromotionTypeFromConditions(conditions);
  const promotionType = promotionTypeFromConditions || normalizePromotionType(raw.type);
  const isBundlePromotion = benefit?.type === "BUNDLE_PRICE";

  return {
    name: normalizeText(raw.name),
    description: normalizeText(raw.description),
    code: normalizeText(raw.code),
    pictureUrl: normalizeText(raw.pictureUrl),
    type: promotionType,
    conditions,
    benefit,
    bundleConfig: isBundlePromotion ? bundleConfig : null,
    validity,
    promotionStartDate: validity.startDate,
    promotionEndDate: validity.endDate,
    usageLimit: validity.usageLimit
  };
}

function validatePromotionDateRange(promotionData = {}, options = {}) {
  const requireBoth = options.requireBoth !== false;
  const startDate = normalizeDateString(
    promotionData?.validity?.startDate || promotionData?.promotionStartDate
  );
  const endDate = normalizeDateString(
    promotionData?.validity?.endDate || promotionData?.promotionEndDate
  );
  const hasStartDate = Boolean(startDate);
  const hasEndDate = Boolean(endDate);

  if (requireBoth && (!hasStartDate || !hasEndDate)) {
    return "Please provide both start date and end date.";
  }

  if (hasStartDate !== hasEndDate) {
    return "Please provide both start date and end date.";
  }

  if (hasStartDate && hasEndDate && endDate < startDate) {
    return "End date must be on or after start date.";
  }

  return null;
}

function validateConditions(conditions = []) {
  if (!Array.isArray(conditions)) {
    return "Promotion conditions format is invalid.";
  }

  if (conditions.length === 0) {
    return "At least one promotion condition is required.";
  }

  for (let index = 0; index < conditions.length; index += 1) {
    const condition = conditions[index];
    if (!condition || typeof condition !== "object") {
      return `Condition ${index + 1} is invalid.`;
    }

    const type = normalizeConditionType(condition.type);
    if (!type) {
      return `Condition ${index + 1} has an unsupported type.`;
    }

    const value = normalizeConditionValue(type, condition.value);
    if (type === "MINIMUM_SPEND") {
      if (!Number.isFinite(value) || value < 0) {
        return `Condition ${index + 1} minimum spend must be a non-negative number.`;
      }
    } else if (!value) {
      return `Condition ${index + 1} value is required.`;
    }
  }

  return null;
}

function validateBenefit(benefit = null) {
  if (!benefit || typeof benefit !== "object") {
    return "Please define a valid promotion benefit.";
  }

  const type = normalizeBenefitType(benefit.type);
  if (!type) {
    return "Please define a valid promotion benefit type.";
  }

  const target = normalizeText(benefit.target).toLowerCase();
  if (!target || !BENEFIT_TARGETS.has(target)) {
    return "Promotion benefit target must be cart, tickets, or addons.";
  }

  const value = Number(benefit.value);
  if (!Number.isFinite(value) || value < 0) {
    return "Promotion benefit value must be a non-negative number.";
  }

  return null;
}

function validateBundleConfig(bundleConfig = {}) {
  if (!bundleConfig || typeof bundleConfig !== "object") {
    throw new Error("Bundle configuration is required for BUNDLE_PRICE promotions.");
  }

  if (!Array.isArray(bundleConfig.groups) || bundleConfig.groups.length === 0) {
    throw new Error("Bundle configuration must include at least one group.");
  }

  bundleConfig.groups.forEach((group, index) => {
    const label = `Bundle group ${index + 1}`;
    const name = normalizeText(group?.name);
    const type = normalizeText(group?.type).toLowerCase();
    const items = Array.isArray(group?.items)
      ? group.items.map((item) => normalizeText(item)).filter(Boolean)
      : [];
    const quantity = Number.parseInt(group?.quantity, 10);

    if (!name) {
      throw new Error(`${label} must have a name.`);
    }
    if (!BUNDLE_GROUP_TYPES.has(type)) {
      throw new Error(`${label} type must be either "fixed" or "selectable".`);
    }
    if (items.length === 0) {
      throw new Error(`${label} must include at least one item.`);
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`${label} quantity must be a number greater than or equal to 1.`);
    }
  });
}

function validatePromotionStructure(promotionData = {}) {
  try {
    const conditionError = validateConditions(promotionData.conditions);
    if (conditionError) return conditionError;

    const benefitError = validateBenefit(promotionData.benefit);
    if (benefitError) return benefitError;

    if (promotionData.benefit?.type === "BUNDLE_PRICE") {
      validateBundleConfig(promotionData.bundleConfig);
    }

    return null;
  } catch (error) {
    return error?.message || "Invalid promotion structure.";
  }
}

function normalizeUsageLimit(value) {
  return normalizeOptionalUsageLimit(value);
}

function deriveLegacyDiscountFields(benefit, promotion = {}) {
  if (benefit?.type === "DISCOUNT") {
    const amount = normalizeNonNegativeNumber(benefit.value, 0);
    return {
      discountType: "amount",
      discountValue: amount,
      discountAmount: amount
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

  const conditions = normalizeConditions(promotion.conditions);
  const benefit = normalizeBenefit(promotion.benefit, promotion);
  const bundleConfig = normalizeBundleConfig(promotion.bundleConfig ?? promotion?.benefit?.bundleConfig);
  const validity = normalizeValidity(promotion);
  const normalizedType = derivePromotionTypeFromConditions(conditions) || normalizePromotionType(promotion.type);
  const discountFields = deriveLegacyDiscountFields(benefit, promotion);

  return {
    ...promotion,
    _id: String(promotion._id),
    type: normalizedType,
    created: promotion.created instanceof Date
      ? promotion.created.toISOString()
      : (promotion.created || ""),
    conditions,
    benefit,
    bundleConfig: benefit?.type === "BUNDLE_PRICE" ? bundleConfig : null,
    validity,
    promotionStartDate: validity.startDate,
    promotionEndDate: validity.endDate,
    usageLimit: validity.usageLimit,
    discountType: discountFields.discountType,
    discountValue: discountFields.discountValue,
    discountAmount: discountFields.discountAmount,
    dateRange: {
      startDate: validity.startDate,
      endDate: validity.endDate,
      hasRange: Boolean(validity.startDate && validity.endDate)
    },
    isActive: isPromotionActive(promotion, asOfDate)
  };
}

module.exports = {
  PROMOTION_TYPES,
  CONDITION_TYPES,
  BENEFIT_TYPES,
  BENEFIT_TARGETS,
  BUNDLE_GROUP_TYPES,
  DAY_OF_WEEK_VALUES,
  normalizeText,
  normalizeDateString,
  normalizePromotionType,
  normalizeNonNegativeNumber,
  normalizeOptionalUsageLimit,
  parseJsonSafe,
  normalizeConditionType,
  normalizeConditionValue,
  normalizeConditions,
  normalizeBenefitType,
  normalizeBenefit,
  normalizeBundleGroup,
  normalizeBundleConfig,
  derivePromotionTypeFromConditions,
  normalizeValidity,
  normalizePromotionData,
  validatePromotionDateRange,
  validateConditions,
  validateBenefit,
  validateBundleConfig,
  validatePromotionStructure,
  normalizeUsageLimit,
  deriveLegacyDiscountFields,
  getTodayIsoDate,
  isPromotionActive,
  serializePromotion
};

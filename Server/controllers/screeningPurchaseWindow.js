const PURCHASE_GRACE_MINUTES = 30;
const PURCHASE_GRACE_MS = PURCHASE_GRACE_MINUTES * 60 * 1000;

function parseScreeningStartDateTime(screening = {}) {
  const raw = screening?.startDateTime;
  if (!raw) return null;

  const parsed = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getScreeningPurchaseCutoffTime(screening = {}) {
  const startDateTime = parseScreeningStartDateTime(screening);
  if (!startDateTime) return null;
  return new Date(startDateTime.getTime() + PURCHASE_GRACE_MS);
}

function isScreeningPurchasableByTime(screening = {}, now = new Date()) {
  const cutoff = getScreeningPurchaseCutoffTime(screening);
  if (!cutoff) return true;

  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) return true;

  return nowDate.getTime() < cutoff.getTime();
}

function getScreeningPurchaseWindowClosedMessage() {
  return "This screening is no longer available for purchase 30 minutes after its start time.";
}

module.exports = {
  PURCHASE_GRACE_MINUTES,
  getScreeningPurchaseCutoffTime,
  isScreeningPurchasableByTime,
  getScreeningPurchaseWindowClosedMessage
};

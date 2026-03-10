const mongodb = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionAdmin,
  getCollectionManager,
  getCollectionStaff
} = require("./database");

const ACCOUNT_ID_COOKIE = "cv_account_id";
const ACCOUNT_ROLE_COOKIE = "cv_account_role";

function parseCookies(cookieHeader = "") {
  const cookies = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(";").forEach((part) => {
    const [rawKey, ...rawValueParts] = part.split("=");
    const key = (rawKey || "").trim();
    if (!key) return;

    const value = (rawValueParts.join("=") || "").trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch (error) {
      cookies[key] = value;
    }
  });

  return cookies;
}

function getCollectionByRole(role) {
  if (role === "Admin") return getCollectionAdmin();
  if (role === "Manager") return getCollectionManager();
  if (role === "Staff") return getCollectionStaff();
  return null;
}

function getFallbackAccount(role = "") {
  return {
    name: "Account",
    pictureUrl: "/images/cameraplaceholder.jpg",
    role
  };
}

function setLoginTrackingCookies(res, account, role) {
  const oneDayMs = 24 * 60 * 60 * 1000;
  res.cookie(ACCOUNT_ID_COOKIE, String(account?._id || ""), {
    maxAge: oneDayMs,
    httpOnly: true,
    sameSite: "lax"
  });
  res.cookie(ACCOUNT_ROLE_COOKIE, role || "", {
    maxAge: oneDayMs,
    httpOnly: true,
    sameSite: "lax"
  });
}

function clearLoginTrackingCookies(res) {
  res.clearCookie(ACCOUNT_ID_COOKIE, { path: "/" });
  res.clearCookie(ACCOUNT_ROLE_COOKIE, { path: "/" });
  // Cleanup old cookie keys if they exist from previous implementation.
  res.clearCookie("cv_account_name", { path: "/" });
  res.clearCookie("cv_account_photo", { path: "/" });
}

async function attachCurrentAccount(req, res, next) {
  const cookies = parseCookies(req.headers.cookie || "");
  const role = cookies[ACCOUNT_ROLE_COOKIE] || "";
  const accountId = cookies[ACCOUNT_ID_COOKIE] || "";
  const fallbackAccount = getFallbackAccount(role);

  if (!role || !accountId || !mongodb.ObjectId.isValid(accountId)) {
    res.locals.currentAccount = fallbackAccount;
    return next();
  }

  try {
    await initDBIfNecessary();
    const collection = getCollectionByRole(role);
    if (!collection) {
      res.locals.currentAccount = fallbackAccount;
      return next();
    }

    const account = await collection.findOne({ _id: new mongodb.ObjectId(accountId) });
    res.locals.currentAccount = {
      name: account?.name || account?.username || "Account",
      pictureUrl: account?.pictureUrl || "/images/cameraplaceholder.jpg",
      role
    };
  } catch (error) {
    console.error("Error resolving current account for header:", error);
    res.locals.currentAccount = fallbackAccount;
  }

  next();
}

module.exports = {
  attachCurrentAccount,
  setLoginTrackingCookies,
  clearLoginTrackingCookies
};

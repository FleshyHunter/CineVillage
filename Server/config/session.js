const mongodb = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionUser
} = require("./database");

const ACCOUNT_ID_COOKIE = "cv_account_id";
const ACCOUNT_ROLE_COOKIE = "cv_account_role";
const VALID_ROLES = new Set(["Admin", "Manager", "Staff"]);

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

function getAuthFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || "");
  return {
    role: cookies[ACCOUNT_ROLE_COOKIE] || "",
    accountId: cookies[ACCOUNT_ID_COOKIE] || ""
  };
}

function hasValidAuthCookies(req) {
  const { role, accountId } = getAuthFromRequest(req);
  return VALID_ROLES.has(role) && mongodb.ObjectId.isValid(accountId);
}

function getCollectionByRole(role) {
  if (VALID_ROLES.has(role)) return getCollectionUser();
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
  const { role, accountId } = getAuthFromRequest(req);
  const fallbackAccount = getFallbackAccount(role);
  req.currentActor = {
    accountId: "",
    role: "",
    name: "Account"
  };

  if (!role || !accountId || !mongodb.ObjectId.isValid(accountId)) {
    res.locals.currentAccount = fallbackAccount;
    res.locals.currentRole = "";
    res.locals.isAuthenticated = false;
    return next();
  }

  try {
    await initDBIfNecessary();
    const collection = getCollectionByRole(role);
    if (!collection) {
      res.locals.currentAccount = fallbackAccount;
      res.locals.currentRole = "";
      res.locals.isAuthenticated = false;
      return next();
    }

    const account = await collection.findOne({
      _id: new mongodb.ObjectId(accountId),
      role
    });
    res.locals.currentAccount = {
      name: account?.name || account?.username || "Account",
      pictureUrl: account?.pictureUrl || "/images/cameraplaceholder.jpg",
      role
    };
    req.currentActor = {
      accountId,
      role,
      name: account?.name || account?.username || "Account"
    };
    res.locals.currentRole = role;
    res.locals.isAuthenticated = true;
  } catch (error) {
    console.error("Error resolving current account for header:", error);
    res.locals.currentAccount = fallbackAccount;
    res.locals.currentRole = "";
    res.locals.isAuthenticated = false;
  }

  next();
}

function denyNoAccess(res, req) {
  return res.redirect(buildDeniedRedirect(req));
}

function buildDeniedRedirect(req) {
  const fallback = "/dashboard?accessDenied=1";
  const returnTo = (req.query?.returnTo || "").toString().trim();
  const referer = (req.get("referer") || "").toString().trim();

  const appendDeniedParam = (pathValue) => {
    if (!pathValue || !pathValue.startsWith("/") || pathValue.startsWith("//")) {
      return fallback;
    }
    const hasQuery = pathValue.includes("?");
    return `${pathValue}${hasQuery ? "&" : "?"}accessDenied=1`;
  };

  if (returnTo) return appendDeniedParam(returnTo);

  if (referer) {
    try {
      const url = new URL(referer);
      const requestHost = req.get("host");
      if (requestHost && url.host === requestHost) {
        const localPath = `${url.pathname || "/"}${url.search || ""}`;
        return appendDeniedParam(localPath);
      }
    } catch (error) {
      return fallback;
    }
  }

  return fallback;
}

function requireAuth(req, res, next) {
  if (!hasValidAuthCookies(req)) {
    return res.redirect("/auth/login?error=Please%20log%20in%20first");
  }
  return next();
}

function requireRoles(allowedRoles = []) {
  const allowed = new Set(allowedRoles);
  return (req, res, next) => {
    const { role, accountId } = getAuthFromRequest(req);
    if (!VALID_ROLES.has(role) || !mongodb.ObjectId.isValid(accountId)) {
      return res.redirect("/auth/login?error=Please%20log%20in%20first");
    }
    if (!allowed.has(role)) {
      return denyNoAccess(res, req);
    }
    return next();
  };
}

module.exports = {
  attachCurrentAccount,
  setLoginTrackingCookies,
  clearLoginTrackingCookies,
  requireAuth,
  requireRoles
};

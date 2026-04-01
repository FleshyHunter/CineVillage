const crypto = require("crypto");
const { ObjectId } = require("mongodb");

const CUSTOMER_AUTH_COOKIE = "cv_customer_token";
const TOKEN_TTL_SECONDS = Number.parseInt(process.env.CUSTOMER_JWT_TTL_SECONDS || "86400", 10) || 86400;
const TOKEN_TTL_MS = TOKEN_TTL_SECONDS * 1000;
const JWT_SECRET = (process.env.CUSTOMER_JWT_SECRET || "cinevillage-dev-secret-change-me").toString().trim();

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
    } catch (_error) {
      cookies[key] = value;
    }
  });

  return cookies;
}

function base64UrlEncode(input) {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
  return raw
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input) {
  const value = (input || "").toString().replace(/-/g, "+").replace(/_/g, "/");
  const padLength = value.length % 4 === 0 ? 0 : 4 - (value.length % 4);
  const padded = value + "=".repeat(padLength);
  return Buffer.from(padded, "base64");
}

function hmacSignature(data) {
  return base64UrlEncode(
    crypto.createHmac("sha256", JWT_SECRET).update(data).digest()
  );
}

function timingSafeEquals(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signCustomerToken({ customerId = "", email = "", name = "" } = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT"
  };
  const payload = {
    sub: String(customerId || ""),
    email: String(email || "").toLowerCase(),
    name: String(name || ""),
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_TTL_SECONDS
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = hmacSignature(unsignedToken);
  return `${unsignedToken}.${signature}`;
}

function verifyCustomerToken(token = "") {
  const [encodedHeader = "", encodedPayload = "", signature = ""] = token.toString().split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Invalid token format.");
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = hmacSignature(unsignedToken);
  if (!timingSafeEquals(signature, expectedSignature)) {
    throw new Error("Invalid token signature.");
  }

  const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8"));
  if (header?.alg !== "HS256") {
    throw new Error("Unsupported token algorithm.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload).toString("utf8"));
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(payload?.exp) || payload.exp <= nowSeconds) {
    throw new Error("Token expired.");
  }

  return payload;
}

function setCustomerAuthCookie(res, token) {
  res.cookie(CUSTOMER_AUTH_COOKIE, token, {
    maxAge: TOKEN_TTL_MS,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
}

function clearCustomerAuthCookie(res) {
  res.clearCookie(CUSTOMER_AUTH_COOKIE, { path: "/" });
}

function getTokenFromRequest(req) {
  const authHeader = (req.get("authorization") || "").toString().trim();
  if (/^bearer\s+/i.test(authHeader)) {
    return authHeader.replace(/^bearer\s+/i, "").trim();
  }

  const cookies = parseCookies(req.headers.cookie || "");
  return (cookies[CUSTOMER_AUTH_COOKIE] || "").toString().trim();
}

function attachCustomerAuth(req, res, next) {
  req.currentCustomer = {
    authenticated: false,
    customerId: "",
    email: "",
    name: ""
  };

  const token = getTokenFromRequest(req);
  if (!token) {
    res.locals.currentCustomer = req.currentCustomer;
    return next();
  }

  try {
    const payload = verifyCustomerToken(token);
    const customerId = (payload?.sub || "").toString().trim();
    const email = (payload?.email || "").toString().trim().toLowerCase();
    const name = (payload?.name || "").toString().trim();

    if (!ObjectId.isValid(customerId)) {
      throw new Error("Invalid customer token subject.");
    }

    req.currentCustomer = {
      authenticated: true,
      customerId,
      email,
      name
    };
  } catch (_error) {
    clearCustomerAuthCookie(res);
  }

  res.locals.currentCustomer = req.currentCustomer;
  return next();
}

function requireCustomerAuth(req, res, next) {
  if (!req.currentCustomer?.authenticated) {
    return res.status(401).json({
      message: "Authentication required."
    });
  }
  return next();
}

module.exports = {
  signCustomerToken,
  setCustomerAuthCookie,
  clearCustomerAuthCookie,
  attachCustomerAuth,
  requireCustomerAuth
};

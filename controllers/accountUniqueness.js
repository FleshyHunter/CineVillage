const {
  initDBIfNecessary,
  getCollectionUser
} = require("../config/database");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeEmail(email) {
  return (email || "").toString().trim().toLowerCase();
}

function isExcludedAccount(foundAccount, exclude) {
  if (!exclude || !exclude.id) return false;
  return String(exclude.id) === String(foundAccount._id);
}

async function findEmailConflict(email, options = {}) {
  await initDBIfNecessary();
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const collectionUser = getCollectionUser();
  const escapedEmail = escapeRegex(normalizedEmail);
  const account = await collectionUser.findOne({
    $or: [
      { emailNormalized: normalizedEmail },
      { email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } }
    ]
  });

  if (!account) return null;
  const foundRole = (account.role || "").toString().trim().toLowerCase();
  if (isExcludedAccount(account, options.exclude)) {
    return null;
  }

  return { role: foundRole, account };
}

module.exports = {
  findEmailConflict
};

const {
  initDBIfNecessary,
  getCollectionAdmin,
  getCollectionManager,
  getCollectionStaff
} = require("../config/database");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeRoleKey(role) {
  return (role || "").toString().trim().toLowerCase();
}

function isExcludedAccount(foundRole, foundAccount, exclude) {
  if (!exclude || !exclude.id || !exclude.role) return false;
  return (
    normalizeRoleKey(exclude.role) === foundRole &&
    String(exclude.id) === String(foundAccount._id)
  );
}

async function findEmailConflict(email, options = {}) {
  await initDBIfNecessary();
  const normalizedEmail = (email || "").toString().trim();
  if (!normalizedEmail) return null;

  const escapedEmail = escapeRegex(normalizedEmail);
  const emailQuery = { email: { $regex: new RegExp(`^${escapedEmail}$`, "i") } };
  const collections = [
    { role: "admin", collection: getCollectionAdmin() },
    { role: "manager", collection: getCollectionManager() },
    { role: "staff", collection: getCollectionStaff() }
  ];

  for (const entry of collections) {
    const account = await entry.collection.findOne(emailQuery);
    if (!account) continue;
    if (isExcludedAccount(entry.role, account, options.exclude)) continue;
    return { role: entry.role, account };
  }

  return null;
}

module.exports = {
  findEmailConflict
};

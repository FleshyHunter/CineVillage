const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionAdmin,
  getCollectionManager,
  getCollectionStaff
} = require("../config/database");
const bcrypt = require("bcrypt");
const { findEmailConflict } = require("./accountUniqueness");
const ADMIN_BCRYPT_ROUNDS = 10;

function getCollectionByRole(role) {
  if (role === "Admin") return getCollectionAdmin();
  if (role === "Manager") return getCollectionManager();
  if (role === "Staff") return getCollectionStaff();
  return null;
}

async function getCurrentAccountContext(req) {
  await initDBIfNecessary();
  const role = (req.currentActor?.role || "").toString().trim();
  const accountId = (req.currentActor?.accountId || "").toString().trim();
  const collection = getCollectionByRole(role);

  if (!collection || !ObjectId.isValid(accountId)) {
    return null;
  }

  const account = await collection.findOne({ _id: new ObjectId(accountId) });
  if (!account) return null;

  return { role, collection, account };
}

async function getProfilePage(req, res) {
  const context = await getCurrentAccountContext(req);
  res.render("profile/profile", {
    title: "Profile",
    pageTitle: "Profile",
    admin: context?.account || null
  });
}

async function getEditProfilePage(req, res) {
  const context = await getCurrentAccountContext(req);
  res.render("profile/profileForm", {
    title: "Edit Profile",
    pageTitle: "Edit Profile",
    admin: context?.account || null,
    error: context ? null : "Profile data is unavailable"
  });
}

async function updateProfile(req, res) {
  const context = await getCurrentAccountContext(req);

  if (!context) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: null,
      error: "Profile data is unavailable"
    });
  }

  const { role, collection, account } = context;
  const payload = {
    name: (req.body.name || "").toString().trim(),
    username: (req.body.username || "").toString().trim(),
    email: (req.body.email || "").toString().trim(),
    contact: (req.body.contact || "").toString().trim(),
    role: (account.role || role)
  };
  const changePassword = (req.body.changePassword || "").toString();
  const confirmPassword = (req.body.confirmPassword || "").toString();

  if (req.file) {
    payload.pictureUrl = "/uploads/" + req.file.filename;
  }

  if (!payload.name || !payload.username || !payload.email || !payload.contact) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: { ...account, ...payload },
      error: "Name, username, email and contact are required"
    });
  }

  if ((changePassword || confirmPassword) && changePassword !== confirmPassword) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: { ...account, ...payload },
      error: "Change password and confirm password must match"
    });
  }

  const duplicateUsername = await collection.findOne({
    _id: { $ne: account._id },
    username: payload.username
  });

  if (duplicateUsername) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: { ...account, ...payload },
      error: "Username is already in use"
    });
  }

  const emailConflict = await findEmailConflict(payload.email, {
    exclude: { role: role.toLowerCase(), id: account._id }
  });

  if (emailConflict) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: { ...account, ...payload },
      error: "Email is already in use"
    });
  }

  if (changePassword) {
    payload.password = await bcrypt.hash(changePassword, ADMIN_BCRYPT_ROUNDS);
  }

  await collection.updateOne(
    { _id: account._id },
    { $set: payload }
  );

  res.redirect("/profile");
}

module.exports = {
  getProfilePage,
  getEditProfilePage,
  updateProfile
};

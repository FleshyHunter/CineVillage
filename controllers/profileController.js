const { initDBIfNecessary, getCollectionAdmin } = require("../config/database");
const bcrypt = require("bcrypt");
const ADMIN_BCRYPT_ROUNDS = 10;

async function getPrimaryAdmin() {
  await initDBIfNecessary();
  const collectionAdmin = getCollectionAdmin();
  return collectionAdmin.findOne({}, { sort: { created: 1 } });
}

async function getProfilePage(req, res) {
  const admin = await getPrimaryAdmin();
  res.render("profile/profile", {
    title: "Profile",
    pageTitle: "Profile",
    admin: admin || null
  });
}

async function getEditProfilePage(req, res) {
  const admin = await getPrimaryAdmin();
  res.render("profile/profileForm", {
    title: "Edit Profile",
    pageTitle: "Edit Profile",
    admin: admin || null,
    error: null
  });
}

async function updateProfile(req, res) {
  await initDBIfNecessary();
  const collectionAdmin = getCollectionAdmin();
  const admin = await getPrimaryAdmin();

  if (!admin) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: null,
      error: "Admin profile not found"
    });
  }

  const payload = {
    name: (req.body.name || "").toString().trim(),
    username: (req.body.username || "").toString().trim(),
    email: (req.body.email || "").toString().trim(),
    contact: (req.body.contact || "").toString().trim(),
    role: (admin.role || "Admin")
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
      admin: { ...admin, ...payload },
      error: "Name, username, email and contact are required"
    });
  }

  if ((changePassword || confirmPassword) && changePassword !== confirmPassword) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: { ...admin, ...payload },
      error: "Change password and confirm password must match"
    });
  }

  const duplicate = await collectionAdmin.findOne({
    _id: { $ne: admin._id },
    $or: [{ email: payload.email }, { username: payload.username }]
  });

  if (duplicate) {
    return res.render("profile/profileForm", {
      title: "Edit Profile",
      pageTitle: "Edit Profile",
      admin: { ...admin, ...payload },
      error: "Email or username is already in use"
    });
  }

  if (changePassword) {
    payload.password = await bcrypt.hash(changePassword, ADMIN_BCRYPT_ROUNDS);
  }

  await collectionAdmin.updateOne(
    { _id: admin._id },
    { $set: payload }
  );

  res.redirect("/profile");
}

module.exports = {
  getProfilePage,
  getEditProfilePage,
  updateProfile
};

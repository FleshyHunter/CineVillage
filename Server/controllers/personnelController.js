const { ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const {
  initDBIfNecessary,
  getCollectionUser
} = require("../config/database");
const { findEmailConflict } = require("./accountUniqueness");
const PERSONNEL_BCRYPT_ROUNDS = 10;

function sanitizeRole(role) {
  if (Array.isArray(role)) {
    role = role[role.length - 1];
  }
  const normalized = (role || "").toString().toLowerCase();
  if (normalized === "manager" || normalized === "staff") return normalized;
  return "manager";
}

function roleKeyToLabel(roleKey) {
  return roleKey === "manager" ? "Manager" : "Staff";
}

function normalizeEmail(email) {
  return (email || "").toString().trim().toLowerCase();
}

function sanitizeView(view) {
  if (Array.isArray(view)) {
    view = view[view.length - 1];
  }
  const normalized = (view || "").toString().toLowerCase();
  if (normalized === "all" || normalized === "manager" || normalized === "staff") return normalized;
  return "all";
}

async function getAllPersonnel(req, res) {
  await initDBIfNecessary();
  const collectionUser = getCollectionUser();
  const managers = await collectionUser.find({ role: "Manager" }).sort({ created: -1 }).toArray();
  const staff = await collectionUser.find({ role: "Staff" }).sort({ created: -1 }).toArray();
  const allPersonnel = [
    ...managers.map(person => ({ ...person, collectionRole: "manager" })),
    ...staff.map(person => ({ ...person, collectionRole: "staff" }))
  ];
  const activeView = sanitizeView(req.query.view || "all");

  res.render("staff/personnelList", {
    title: "Personnel",
    pageTitle: "Personnel",
    activeView,
    allPersonnel,
    managers,
    staff
  });
}

async function getCreatePersonnelForm(req, res) {
  await initDBIfNecessary();
  const role = sanitizeRole(req.query.role || "staff");

  res.render("staff/personnelForm", {
    title: "Personnel",
    pageTitle: "Create Personnel",
    personnel: null,
    role,
    isEdit: false,
    error: null
  });
}

async function createPersonnel(req, res) {
  try {
    await initDBIfNecessary();
    const role = sanitizeRole(req.body.role || req.query.role);
    const collectionUser = getCollectionUser();
    const defaultPersonnelPasswordHash = await bcrypt.hash("personnel", PERSONNEL_BCRYPT_ROUNDS);

    const personnelData = {
      name: (req.body.name || "").toString().trim(),
      username: (req.body.username || "").toString().trim(),
      email: (req.body.email || "").toString().trim(),
      emailNormalized: normalizeEmail(req.body.email),
      contact: (req.body.contact || "").toString().trim(),
      role: roleKeyToLabel(role),
      status: (req.body.status || "Active").toString().trim(),
      password: defaultPersonnelPasswordHash,
      created: new Date()
    };

    if (!personnelData.name || !personnelData.username || !personnelData.email || !personnelData.contact) {
      throw new Error("Name, username, email and contact are required");
    }

    const duplicateUsername = await collectionUser.findOne({ username: personnelData.username });
    if (duplicateUsername) {
      throw new Error("Username is already in use");
    }

    const emailConflict = await findEmailConflict(personnelData.email);
    if (emailConflict) {
      throw new Error("Email is already in use");
    }

    await collectionUser.insertOne(personnelData);
    res.redirect(`/personnel?view=${role}`);
  } catch (err) {
    console.error(err);
    res.render("staff/personnelForm", {
      title: "Personnel",
      pageTitle: "Create Personnel",
      personnel: req.body,
      role: sanitizeRole(req.body.role || req.query.role || "staff"),
      isEdit: false,
      error: err.message || "Error creating personnel"
    });
  }
}

async function getEditPersonnelForm(req, res) {
  await initDBIfNecessary();
  const role = sanitizeRole(req.params.role);
  const collectionUser = getCollectionUser();
  const expectedRole = roleKeyToLabel(role);

  if (!ObjectId.isValid(req.params.id)) return res.send("Personnel not found");
  const personnel = await collectionUser.findOne({
    _id: new ObjectId(req.params.id),
    role: expectedRole
  });
  if (!personnel) return res.send("Personnel not found");

  res.render("staff/personnelForm", {
    title: "Personnel",
    pageTitle: "Edit Personnel",
    personnel,
    role,
    isEdit: true,
    error: null
  });
}

async function updatePersonnel(req, res) {
  try {
    await initDBIfNecessary();
    const sourceRole = sanitizeRole(req.params.role);
    const targetRole = sanitizeRole(req.body.role || req.params.role);
    const sourceRoleLabel = roleKeyToLabel(sourceRole);
    const targetRoleLabel = roleKeyToLabel(targetRole);
    const collectionUser = getCollectionUser();

    if (!ObjectId.isValid(req.params.id)) return res.send("Personnel not found");
    const personnelId = new ObjectId(req.params.id);
    const existingPersonnel = await collectionUser.findOne({
      _id: personnelId,
      role: sourceRoleLabel
    });
    if (!existingPersonnel) return res.send("Personnel not found");

    const personnelData = {
      name: (req.body.name || "").toString().trim(),
      username: (req.body.username || "").toString().trim(),
      email: (req.body.email || "").toString().trim(),
      emailNormalized: normalizeEmail(req.body.email),
      contact: (req.body.contact || "").toString().trim(),
      role: targetRoleLabel,
      status: (req.body.status || "Active").toString().trim()
    };

    if (!personnelData.name || !personnelData.username || !personnelData.email || !personnelData.contact) {
      throw new Error("Name, username, email and contact are required");
    }

    const duplicateUsername = await collectionUser.findOne({
      _id: { $ne: personnelId },
      username: personnelData.username
    });
    if (duplicateUsername) {
      throw new Error("Username is already in use");
    }

    const emailConflict = await findEmailConflict(personnelData.email, {
      exclude: { id: personnelId }
    });
    if (emailConflict) {
      throw new Error("Email is already in use");
    }

    await collectionUser.updateOne(
      { _id: personnelId },
      { $set: personnelData }
    );

    res.redirect(`/personnel?view=${targetRole}`);
  } catch (err) {
    console.error(err);
    res.render("staff/personnelForm", {
      title: "Personnel",
      pageTitle: "Edit Personnel",
      personnel: { ...req.body, _id: req.params.id },
      role: sanitizeRole(req.body.role || req.params.role),
      isEdit: true,
      error: err.message || "Error updating personnel"
    });
  }
}

async function deletePersonnel(req, res) {
  try {
    await initDBIfNecessary();
    const role = sanitizeRole(req.params.role);
    const roleLabel = roleKeyToLabel(role);
    const collectionUser = getCollectionUser();
    if (!ObjectId.isValid(req.params.id)) return res.send("Personnel not found");

    await collectionUser.deleteOne({
      _id: new ObjectId(req.params.id),
      role: roleLabel
    });
    res.redirect(`/personnel?view=${role}`);
  } catch (err) {
    console.error(err);
    res.send("Error deleting personnel");
  }
}

module.exports = {
  getAllPersonnel,
  getCreatePersonnelForm,
  createPersonnel,
  getEditPersonnelForm,
  updatePersonnel,
  deletePersonnel
};

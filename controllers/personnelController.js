const { ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const {
  initDBIfNecessary,
  getCollectionManager,
  getCollectionStaff
} = require("../config/database");
const PERSONNEL_BCRYPT_ROUNDS = 10;

function sanitizeRole(role) {
  if (Array.isArray(role)) {
    role = role[role.length - 1];
  }
  const normalized = (role || "").toString().toLowerCase();
  if (normalized === "manager" || normalized === "staff") return normalized;
  return "manager";
}

function sanitizeView(view) {
  if (Array.isArray(view)) {
    view = view[view.length - 1];
  }
  const normalized = (view || "").toString().toLowerCase();
  if (normalized === "all" || normalized === "manager" || normalized === "staff") return normalized;
  return "all";
}

function getCollectionByRole(role) {
  return role === "manager" ? getCollectionManager() : getCollectionStaff();
}

async function getAllPersonnel(req, res) {
  await initDBIfNecessary();

  const managerCollection = getCollectionManager();
  const staffCollection = getCollectionStaff();

  const managers = await managerCollection.find({}).sort({ created: -1 }).toArray();
  const staff = await staffCollection.find({}).sort({ created: -1 }).toArray();
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
    const collection = getCollectionByRole(role);
    const defaultPersonnelPasswordHash = await bcrypt.hash("personnel", PERSONNEL_BCRYPT_ROUNDS);

    const personnelData = {
      name: (req.body.name || "").toString().trim(),
      username: (req.body.username || "").toString().trim(),
      email: (req.body.email || "").toString().trim(),
      contact: (req.body.contact || "").toString().trim(),
      role: role === "manager" ? "Manager" : "Staff",
      status: (req.body.status || "Active").toString().trim(),
      password: defaultPersonnelPasswordHash,
      created: new Date()
    };

    await collection.insertOne(personnelData);
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
  const collection = getCollectionByRole(role);

  if (!ObjectId.isValid(req.params.id)) return res.send("Personnel not found");
  const personnel = await collection.findOne({ _id: new ObjectId(req.params.id) });
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
    const sourceCollection = getCollectionByRole(sourceRole);
    const targetCollection = getCollectionByRole(targetRole);

    if (!ObjectId.isValid(req.params.id)) return res.send("Personnel not found");
    const personnelId = new ObjectId(req.params.id);
    const existingPersonnel = await sourceCollection.findOne({ _id: personnelId });
    if (!existingPersonnel) return res.send("Personnel not found");

    const personnelData = {
      name: (req.body.name || "").toString().trim(),
      username: (req.body.username || "").toString().trim(),
      email: (req.body.email || "").toString().trim(),
      contact: (req.body.contact || "").toString().trim(),
      role: targetRole === "manager" ? "Manager" : "Staff",
      status: (req.body.status || "Active").toString().trim()
    };

    if (sourceRole === targetRole) {
      await sourceCollection.updateOne(
        { _id: personnelId },
        { $set: personnelData }
      );
    } else {
      await sourceCollection.deleteOne({ _id: personnelId });
      await targetCollection.insertOne({
        _id: personnelId,
        ...personnelData,
        created: existingPersonnel.created || new Date()
      });
    }

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
    const collection = getCollectionByRole(role);
    if (!ObjectId.isValid(req.params.id)) return res.send("Personnel not found");

    await collection.deleteOne({ _id: new ObjectId(req.params.id) });
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

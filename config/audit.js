const mongodb = require("mongodb");
const { initDBIfNecessary, getCollectionAuditLog } = require("./database");

async function logAction(req, payload = {}) {
  try {
    await initDBIfNecessary();
    const collection = getCollectionAuditLog();

    const actor = req.currentActor || {};
    const actorId = actor.accountId && mongodb.ObjectId.isValid(actor.accountId)
      ? new mongodb.ObjectId(actor.accountId)
      : null;

    const entry = {
      module: (payload.module || "").toString().toLowerCase(),
      operation: (payload.operation || "").toString().toLowerCase(),
      item: (payload.item || "").toString(),
      actorId,
      actorName: (actor.name || "Unknown").toString(),
      actorRole: (actor.role || "Unknown").toString(),
      targetId: payload.targetId ? payload.targetId.toString() : "",
      createdAt: new Date()
    };

    await collection.insertOne(entry);
  } catch (error) {
    console.error("Audit log write failed:", error.message);
  }
}

module.exports = { logAction };

const { initDBIfNecessary, getCollectionAuditLog } = require("../config/database");

async function getHistoryPage(req, res) {
  await initDBIfNecessary();
  const collectionAuditLog = getCollectionAuditLog();

  const logs = await collectionAuditLog
    .find({})
    .sort({ createdAt: -1 })
    .limit(500)
    .toArray();

  res.render("history/history", {
    title: "History",
    pageTitle: "History",
    logs
  });
}

async function clearHistoryLogs(req, res) {
  await initDBIfNecessary();
  const collectionAuditLog = getCollectionAuditLog();
  await collectionAuditLog.deleteMany({});
  res.redirect("/history");
}

module.exports = { getHistoryPage, clearHistoryLogs };

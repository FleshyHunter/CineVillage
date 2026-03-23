const { getCollectionHall, getCollectionScreening, initDBIfNecessary } = require("../config/database");
const { ObjectId } = require("mongodb");
const { getEffectiveHallStatus } = require("../public/js/hallStatus");
const { pauseScreeningsForHallMaintenance, updateScreeningStatuses } = require("./screeningController");

// Normalize date input; supports YYYY-MM-DD (native) and DD/MM/YYYY (text)
function normalizeDateString(dateStr) {
  if (!dateStr) return '';
  const trimmed = dateStr.toString().trim();
  // Already ISO-like
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  // Convert DD/MM/YYYY to YYYY-MM-DD
  const ddmmyyyyMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddmmyyyyMatch) {
    const [, dd, mm, yyyy] = ddmmyyyyMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  return '';
}

// Helper function to parse and convert hall data
function parseHallData(hallData) {
  // Parse seatConfig if it's a string
  if (hallData.seatConfig && typeof hallData.seatConfig === 'string') {
    try {
      hallData.seatConfig = JSON.parse(hallData.seatConfig);
    } catch (e) {
      hallData.seatConfig = {};
    }
  }

  // Convert numeric strings to numbers
  if (hallData.rows) hallData.rows = parseInt(hallData.rows);
  if (hallData.columns) hallData.columns = parseInt(hallData.columns);
  if (hallData.wingColumns) hallData.wingColumns = parseInt(hallData.wingColumns);
  if (hallData.capacity) hallData.capacity = parseInt(hallData.capacity);

  // Normalize maintenance duration based on hall status
  if (hallData.status === 'Under Maintenance') {
    const startDate = normalizeDateString(hallData.maintenanceStartDate);
    const endDate = normalizeDateString(hallData.maintenanceEndDate);
    hallData.maintenanceStartDate = startDate;
    hallData.maintenanceEndDate = endDate;
    hallData.maintenanceDuration = (startDate && endDate) ? `${startDate} to ${endDate}` : '';
  } else {
    hallData.maintenanceStartDate = '';
    hallData.maintenanceEndDate = '';
    hallData.maintenanceDuration = '-';
  }

  return hallData;
}

async function createHall(hallData) {
  await initDBIfNecessary();
  hallData.created = new Date();
  
  parseHallData(hallData);

  const collectionHall = getCollectionHall();
  await collectionHall.insertOne(hallData);
}

// Get all halls (for hallList.ejs)
async function getAllHalls(req, res) {
  await initDBIfNecessary();

  const collectionHall = getCollectionHall();
  const hallsRaw = await collectionHall.find({}).toArray();
  const halls = hallsRaw.map(hall => ({
    ...hall,
    configuredStatus: hall.status || 'Available',
    effectiveStatus: getEffectiveHallStatus(hall)
  }));

  res.render("halls/hallList", { halls, title: 'Hall List' });
}

// Get single hall by ID (for hallDetail.ejs)
async function getHallbyId(hallId) {
  await initDBIfNecessary();
  if (!hallId) {
    return null;
  }

  const collectionHall = getCollectionHall();
  const hall = await collectionHall.findOne({
    _id: ObjectId.createFromHexString(hallId)
  });
  if (!hall) return null;

  return {
    ...hall,
    configuredStatus: hall.status || 'Available',
    effectiveStatus: getEffectiveHallStatus(hall)
  };
}

async function updateHall(id, hallData) {
  await initDBIfNecessary();

  parseHallData(hallData);

  const collectionHall = getCollectionHall();

  await collectionHall.updateOne(
    { _id: new ObjectId(id) },
    { $set: hallData }
  );

  // If hall is set to maintenance, pause impacted screenings; otherwise refresh statuses.
  if (hallData.status === 'Under Maintenance') {
    await pauseScreeningsForHallMaintenance({ _id: new ObjectId(id), ...hallData });
  }

  // Recompute statuses globally to keep consistency (unpauses when maintenance lifted).
  await updateScreeningStatuses();
}

async function deleteHall(id) {
  await initDBIfNecessary();
  if (!ObjectId.isValid(id)) throw new Error("Invalid hall ID");

  const hallObjectId = new ObjectId(id);
  const collectionScreening = getCollectionScreening();
  const linkedScreeningsCount = await collectionScreening.countDocuments({
    hallId: hallObjectId
  });

  if (linkedScreeningsCount > 0) {
    throw new Error(`Cannot delete hall: ${linkedScreeningsCount} screening(s) are tied to this hall`);
  }

  const collectionHall = getCollectionHall();
  const result = await collectionHall.deleteOne({ _id: hallObjectId });

  if (result.deletedCount === 0) {
    throw new Error("Hall not found");
  }
}

module.exports = {
  createHall,
  getAllHalls,
  getHallbyId,
  updateHall,
  deleteHall,
};

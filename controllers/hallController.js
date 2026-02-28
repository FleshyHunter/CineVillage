const { getCollectionHall, initDBIfNecessary } = require("../config/database");
const { ObjectId } = require("mongodb");

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
  const halls = await collectionHall.find({}).toArray();

  res.render("halls/hallList", { halls, title: 'Hall List' });
}

// Get single hall by ID (for hallDetail.ejs)
async function getHallbyId(hallId) {
  await initDBIfNecessary();
  if (!hallId) {
    return null;
  }

  const collectionHall = getCollectionHall();

  return collectionHall.findOne({
    _id: ObjectId.createFromHexString(hallId)
  });
}

async function updateHall(id, hallData) {
  await initDBIfNecessary();

  parseHallData(hallData);

  const collectionHall = getCollectionHall();

  await collectionHall.updateOne(
    { _id: new ObjectId(id) },
    { $set: hallData }
  );
}

async function deleteHall(id) {
  await initDBIfNecessary();
  if (!ObjectId.isValid(id)) throw new Error("Invalid hall ID");

  const collectionHall = getCollectionHall();
  const result = await collectionHall.deleteOne({ _id: new ObjectId(id) });

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

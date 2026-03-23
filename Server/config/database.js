const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");

const ADMIN_BCRYPT_ROUNDS = 10;
const DEFAULT_ADMIN_EMAIL = "admin@gmail.com";

let client = null;
let collectionMovie = null;
let collectionHall = null;
let collectionScreening = null;
let collectionUser = null;
let collectionAuditLog = null;

function normalizeEmail(email) {
    return (email || "").toString().trim().toLowerCase();
}

async function ensureUserIndexes() {
    await collectionUser.createIndex(
        { emailNormalized: 1 },
        {
            unique: true,
            name: "uniq_user_email_normalized",
            sparse: true
        }
    );
    await collectionUser.createIndex({ role: 1 }, { name: "idx_user_role" });
}

async function backfillUserNormalizedEmails() {
    const users = await collectionUser.find({
        email: { $exists: true, $ne: "" },
        $or: [
            { emailNormalized: { $exists: false } },
            { emailNormalized: "" }
        ]
    }).toArray();

    for (const user of users) {
        const normalized = normalizeEmail(user.email);
        if (!normalized) continue;
        await collectionUser.updateOne(
            { _id: user._id },
            { $set: { emailNormalized: normalized } }
        );
    }
}

async function createDefaultAdminIfMissing() {
    const defaultAdminProfile = {
        name: "admin",
        username: "admin",
        email: DEFAULT_ADMIN_EMAIL,
        emailNormalized: normalizeEmail(DEFAULT_ADMIN_EMAIL),
        contact: "82077872",
        role: "Admin"
    };

    const existingAdmin = await collectionUser.findOne({ role: "Admin" });

    if (existingAdmin) return;

    await collectionUser.insertOne({
        ...defaultAdminProfile,
        password: await bcrypt.hash("admin", ADMIN_BCRYPT_ROUNDS),
        created: new Date()
    });
    console.log("Default admin account created in user collection");
}

async function initDBIfNecessary() {
    if (!client) {
        client = await MongoClient.connect("mongodb://localhost:27017");
        console.log("connected to mongodb");

        const db = client.db("assignment1");
        collectionMovie = db.collection("movie");
        collectionHall = db.collection("hall");
        collectionScreening = db.collection("screening");
        collectionUser = db.collection("user");
        collectionAuditLog = db.collection("audit_logs");

        await backfillUserNormalizedEmails();
        await ensureUserIndexes();
        await createDefaultAdminIfMissing();
    }
}

async function disconnect() {
    if (client) {
        await client.close();
        client = null;
    }
}

function getCollectionMovie() {
    if (!collectionMovie) throw new Error("DB not initialized");
    return collectionMovie;
}

function getCollectionHall() {
    if (!collectionHall) throw new Error("DB not initialized");
    return collectionHall;
}

function getCollectionScreening() {
    if (!collectionScreening) throw new Error("DB not initialized");
    return collectionScreening;
}

function getCollectionUser() {
    if (!collectionUser) throw new Error("DB not initialized");
    return collectionUser;
}

function getCollectionAuditLog() {
    if (!collectionAuditLog) throw new Error("DB not initialized");
    return collectionAuditLog;
}

module.exports = {
    initDBIfNecessary,
    disconnect,
    getCollectionMovie,
    getCollectionHall,
    getCollectionScreening,
    getCollectionUser,
    getCollectionAuditLog,
};

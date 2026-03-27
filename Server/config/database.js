const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");

const ADMIN_BCRYPT_ROUNDS = 10;
const DEFAULT_ADMIN_EMAIL = "admin@gmail.com";

let client = null;
let collectionMovie = null;
let collectionPromotion = null;
let collectionAddOn = null;
let collectionHall = null;
let collectionScreening = null;
let collectionBooking = null;
let collectionSeatReservation = null;
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

function getBookingValidator() {
    return {
        $jsonSchema: {
            bsonType: "object",
            required: [
                "bookingCode",
                "screeningId",
                "movieId",
                "hallId",
                "seats",
                "seatCount",
                "pricePerSeat",
                "totalAmount",
                "totalPrice",
                "status",
                "paymentStatus",
                "bookedAt",
                "createdAt"
            ],
            properties: {
                bookingCode: {
                    bsonType: "string",
                    minLength: 1
                },
                userId: {
                    bsonType: ["objectId", "null"]
                },
                screeningId: {
                    bsonType: "objectId"
                },
                movieId: {
                    bsonType: "objectId"
                },
                hallId: {
                    bsonType: "objectId"
                },
                seats: {
                    bsonType: "array",
                    minItems: 1,
                    uniqueItems: true,
                    items: {
                        bsonType: "string",
                        minLength: 2
                    }
                },
                seatCount: {
                    bsonType: ["int", "long"],
                    minimum: 1
                },
                pricePerSeat: {
                    bsonType: ["double", "int", "long", "decimal"],
                    minimum: 0
                },
                totalPrice: {
                    bsonType: ["double", "int", "long", "decimal"],
                    minimum: 0
                },
                totalAmount: {
                    bsonType: ["double", "int", "long", "decimal"],
                    minimum: 0
                },
                status: {
                    enum: ["pending", "confirmed", "cancelled", "expired"]
                },
                paymentStatus: {
                    enum: ["unpaid", "paid", "refunded"]
                },
                bookedAt: {
                    bsonType: "date"
                },
                createdAt: {
                    bsonType: "date"
                },
                expiresAt: {
                    bsonType: ["date", "null"]
                },
                confirmedAt: {
                    bsonType: ["date", "null"]
                },
                customerName: {
                    bsonType: ["string", "null"]
                },
                customerEmail: {
                    bsonType: ["string", "null"]
                },
                notes: {
                    bsonType: ["string", "null"]
                },
                created: {
                    bsonType: ["date", "null"]
                },
                updated: {
                    bsonType: ["date", "null"]
                }
            }
        }
    };
}

async function ensureBookingCollection(db) {
    const bookingCollectionName = "booking";
    const bookingValidator = getBookingValidator();
    const bookingCollectionExists = await db.listCollections({ name: bookingCollectionName }).hasNext();

    if (!bookingCollectionExists) {
        await db.createCollection(bookingCollectionName, {
            validator: bookingValidator,
            validationLevel: "strict",
            validationAction: "error"
        });
    } else {
        try {
            // Keep the validator in sync for existing local DBs.
            await db.command({
                collMod: bookingCollectionName,
                validator: bookingValidator,
                validationLevel: "strict",
                validationAction: "error"
            });
        } catch (error) {
            console.warn("Unable to apply booking collection validator update via collMod:", error.message);
        }
    }
}

async function ensureBookingIndexes() {
    await collectionBooking.createIndex(
        { bookingCode: 1 },
        { unique: true, name: "uniq_booking_code" }
    );

    await collectionBooking.createIndex(
        { screeningId: 1, status: 1, bookedAt: -1 },
        { name: "idx_booking_screening_status_bookedAt" }
    );

    await collectionBooking.createIndex(
        { userId: 1, bookedAt: -1 },
        { name: "idx_booking_user_bookedAt" }
    );

    await collectionBooking.createIndex(
        { bookedAt: -1 },
        { name: "idx_booking_bookedAt_desc" }
    );

    // Prevent double-booking the same seat in the same screening while a booking is active.
    await collectionBooking.createIndex(
        { screeningId: 1, seats: 1 },
        {
            unique: true,
            name: "uniq_booking_screening_active_seat",
            partialFilterExpression: {
                status: { $in: ["pending", "confirmed"] }
            }
        }
    );
}

function getSeatReservationValidator() {
    return {
        $jsonSchema: {
            bsonType: "object",
            required: ["screeningId", "seat", "createdAt"],
            properties: {
                screeningId: {
                    bsonType: "objectId"
                },
                bookingId: {
                    bsonType: ["objectId", "null"]
                },
                seat: {
                    bsonType: "string",
                    minLength: 2
                },
                expiresAt: {
                    bsonType: ["date", "null"]
                },
                createdAt: {
                    bsonType: "date"
                },
                updatedAt: {
                    bsonType: ["date", "null"]
                }
            }
        }
    };
}

async function ensureSeatReservationCollection(db) {
    const collectionName = "seat_reservation";
    const validator = getSeatReservationValidator();
    const exists = await db.listCollections({ name: collectionName }).hasNext();

    if (!exists) {
        await db.createCollection(collectionName, {
            validator,
            validationLevel: "strict",
            validationAction: "error"
        });
    } else {
        try {
            await db.command({
                collMod: collectionName,
                validator,
                validationLevel: "strict",
                validationAction: "error"
            });
        } catch (error) {
            console.warn("Unable to apply seat_reservation validator update via collMod:", error.message);
        }
    }
}

async function ensureSeatReservationIndexes() {
    await collectionSeatReservation.createIndex(
        { screeningId: 1, seat: 1 },
        { unique: true, name: "uniq_screening_seat_reservation" }
    );

    await collectionSeatReservation.createIndex(
        { screeningId: 1, createdAt: -1 },
        { name: "idx_seat_reservation_screening_createdAt" }
    );

    await collectionSeatReservation.createIndex(
        { bookingId: 1 },
        { name: "idx_seat_reservation_booking" }
    );

    await collectionSeatReservation.createIndex(
        { expiresAt: 1 },
        { name: "idx_seat_reservation_expiresAt" }
    );
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
        await ensureBookingCollection(db);
        await ensureSeatReservationCollection(db);
        collectionMovie = db.collection("movie");
        collectionPromotion = db.collection("promotion");
        collectionAddOn = db.collection("addon");
        collectionHall = db.collection("hall");
        collectionScreening = db.collection("screening");
        collectionBooking = db.collection("booking");
        collectionSeatReservation = db.collection("seat_reservation");
        collectionUser = db.collection("user");
        collectionAuditLog = db.collection("audit_logs");

        await backfillUserNormalizedEmails();
        await ensureUserIndexes();
        await ensureBookingIndexes();
        await ensureSeatReservationIndexes();
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

function getCollectionPromotion() {
    if (!collectionPromotion) throw new Error("DB not initialized");
    return collectionPromotion;
}

function getCollectionAddOn() {
    if (!collectionAddOn) throw new Error("DB not initialized");
    return collectionAddOn;
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

function getCollectionBooking() {
    if (!collectionBooking) throw new Error("DB not initialized");
    return collectionBooking;
}

function getCollectionSeatReservation() {
    if (!collectionSeatReservation) throw new Error("DB not initialized");
    return collectionSeatReservation;
}

function getMongoClient() {
    if (!client) throw new Error("DB not initialized");
    return client;
}

function getCollectionAuditLog() {
    if (!collectionAuditLog) throw new Error("DB not initialized");
    return collectionAuditLog;
}

module.exports = {
    initDBIfNecessary,
    disconnect,
    getCollectionMovie,
    getCollectionPromotion,
    getCollectionAddOn,
    getCollectionHall,
    getCollectionScreening,
    getCollectionBooking,
    getCollectionSeatReservation,
    getCollectionUser,
    getCollectionAuditLog,
    getMongoClient,
};

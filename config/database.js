const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
const ADMIN_BCRYPT_ROUNDS = 10;
const PERSONNEL_BCRYPT_ROUNDS = 10;
let client = null;
//this is the collection object for querying the
//customers collection in the database
let collectionMovie = null;
let collectionHall = null;
let collectionScreening = null;
let collectionAdmin = null;
let collectionManager = null;
let collectionStaff = null;
let collectionAuditLog = null;

//function to connect to db and get the collection object
async function initDBIfNecessary() {
    if (!client) {
        //only connect to the database if we are not already connected
        client = await MongoClient.connect("mongodb://localhost:27017"); 
        // client = await MongoClient.connect("mongodb+srv://aaronlyd03_db_user:<db_password>@cinevillage.khoyoc8.mongodb.net/?appName=CineVillage");
        console.log("connected to mongodb");

        //db name 
        const db = client.db("assignment1");

        //table defining in db
        collectionMovie = db.collection("movie");
        collectionHall = db.collection("hall");
        collectionScreening = db.collection("screening");
        collectionAdmin = db.collection("admin");
        collectionManager = db.collection("manager");
        collectionStaff = db.collection("staff");
        collectionAuditLog = db.collection("audit_logs");

    }
} // end initDBIfNecessary

//function to disconnect from the database
async function disconnect() {
    if (client) {
        await client.close();
        client = null;
    }
} //end disconnect

async function insertAdmin(admin) {
    await initDBIfNecessary();
    admin.created = new Date();
    await collectionAdmin.insertOne(admin);
}

async function createAdmin() {
    try {
        let adminAccount = await getAdminbyEmail("admin@gmail.com");
        const defaultAdminProfile = {
            name: "admin",
            username: "admin",
            email: "admin@gmail.com",
            contact: "82077872",
            role: "Admin"
        };

        if (adminAccount == null) {
            await insertAdmin({
                ...defaultAdminProfile,
                password: await bcrypt.hash("admin", ADMIN_BCRYPT_ROUNDS),
            });
            console.log("Admin account created");
        } else {
            // Update only missing profile fields on existing admin record.
            // This avoids creating duplicate admin documents.
            const missingFields = {};
            for (const [key, value] of Object.entries(defaultAdminProfile)) {
                if (!adminAccount[key]) {
                    missingFields[key] = value;
                }
            }

            if (Object.keys(missingFields).length > 0) {
                await collectionAdmin.updateOne(
                    { _id: adminAccount._id },
                    { $set: missingFields }
                );
                console.log("Admin account profile fields backfilled");
            }
        }
    } catch (error) {
        console.error("Error", error.message);
    }
}

async function initializePersonnelPasswords() {
    try {
        await initDBIfNecessary();

        const defaultPersonnelPasswordHash = await bcrypt.hash("personnel", PERSONNEL_BCRYPT_ROUNDS);

        await collectionManager.updateMany(
            {},
            { $set: { password: defaultPersonnelPasswordHash } }
        );

        await collectionStaff.updateMany(
            {},
            { $set: { password: defaultPersonnelPasswordHash } }
        );
    } catch (error) {
        console.error("Error initializing personnel passwords:", error.message);
    }
}

(async () => {
    try {
        await createAdmin();
        await initializePersonnelPasswords();
    
    } catch (err) {
        console.error("Top-level error:", err);
    }
})();

async function getAdminbyEmail(adminEmail) {
    await initDBIfNecessary();
    return collectionAdmin.findOne({
        email: adminEmail
    });
}

//needs to put db into a function to make sure a null is not returned aka error handling
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

function getCollectionAdmin() {
    if (!collectionAdmin) throw new Error("DB not initialized");
    return collectionAdmin;
}

function getCollectionManager() {

    if (!collectionManager) throw new Error("DB not initialized");
    return collectionManager;
}

function getCollectionStaff() {
    if (!collectionStaff) throw new Error("DB not initialized");
    return collectionStaff;
}

function getCollectionAuditLog() {
    if (!collectionAuditLog) throw new Error("DB not initialized");
    return collectionAuditLog;
}
//export the functions so they can be used in other files
module.exports = {
    initDBIfNecessary,
    disconnect,
    getAdminbyEmail,
    getCollectionAdmin,
    getCollectionMovie,
    getCollectionHall,
    getCollectionScreening,
    getCollectionManager,
    getCollectionStaff,
    getCollectionAuditLog,
};

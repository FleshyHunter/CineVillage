const { MongoClient } = require("mongodb");
const bcrypt = require("bcrypt");
let client = null;
//this is the collection object for querying the
//customers collection in the database
let collectionMovie = null;
let collectionHall = null;
let collectionScreening = null;
let collectionAdmin = null;
let collectionStaff = null;

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
        collectionStaff = db.collection("staff");

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
        console.log(adminAccount);
        if (adminAccount == null) {
            await insertAdmin({
                name: "Admin",
                email: "admin@gmail.com",
                password: await bcrypt.hash("admin", 31),
            });
            console.log("Admin account created");
        }
    } catch (error) {
        console.error("Error", error.message);
    }
}

(async () => {
    try {
        await createAdmin();
    
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

function getCollectionStaff() {
    if (!collectionScreening) throw new Error("DB not initialized");
    return collectionScreening;
}
//export the functions so they can be used in other files
module.exports = {
    initDBIfNecessary,
    disconnect,
    getAdminbyEmail,
    getCollectionMovie,
    getCollectionHall,
    getCollectionScreening,
    getCollectionStaff,
};
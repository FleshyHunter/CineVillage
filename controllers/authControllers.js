// controllers/authController.js
const bcrypt = require("bcrypt");
const {
    initDBIfNecessary,
    getCollectionAdmin,
    getCollectionManager,
    getCollectionStaff
} = require("../config/database");

async function loginAccount(email, password) {
    await initDBIfNecessary();

    const normalizedEmail = (email || "").toString().trim();
    if (!normalizedEmail || !password) {
        console.log("[AUTH] Login failed: missing email or password", { email: normalizedEmail || "(empty)" });
        return { error: "Invalid email or password" };
    }

    const collectionAdmin = getCollectionAdmin();
    const collectionManager = getCollectionManager();
    const collectionStaff = getCollectionStaff();

    // Priority: Admin > Manager > Staff (if duplicate emails exist).
    const admin = await collectionAdmin.findOne({ email: normalizedEmail });
    const manager = admin ? null : await collectionManager.findOne({ email: normalizedEmail });
    const staff = (!admin && !manager) ? await collectionStaff.findOne({ email: normalizedEmail }) : null;

    const account = admin || manager || staff;
    if (!account) {
        console.log("[AUTH] Login failed: email not found", { email: normalizedEmail });
        return { error: "Invalid email or password" };
    }
    if (!account.password) {
        console.log("[AUTH] Login failed: account missing password hash", {
            email: normalizedEmail,
            accountId: account._id?.toString()
        });
        return { error: "Invalid email or password" };
    }

    const match = await bcrypt.compare(password, account.password);
    if (!match) {
        console.log("[AUTH] Login failed: password mismatch", {
            email: normalizedEmail,
            accountId: account._id?.toString()
        });
        return { error: "Invalid email or password" };
    }

    const role = admin ? "Admin" : manager ? "Manager" : "Staff";
    if ((role === "Manager" || role === "Staff") && account.status === "Inactive") {
        console.log("[AUTH] Login blocked: inactive account", {
            email: normalizedEmail,
            role,
            accountId: account._id?.toString()
        });
        return { error: "Account is inactive. Please contact administrator." };
    }

    console.log("[AUTH] Login success", {
        email: normalizedEmail,
        role,
        accountId: account._id?.toString()
    });
    return { account, role };
}

module.exports = { loginAccount };

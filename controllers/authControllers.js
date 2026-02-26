// controllers/authController.js
const bcrypt = require("bcrypt");
const { getAdminbyEmail } = require("../config/database");

async function loginAdmin(email, password) {
    const admin = await getAdminbyEmail(email);
    if (!admin) return { 
        error: "Invalid email" };

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return { error: "Invalid password" };

    return { admin };
}

module.exports = { loginAdmin };

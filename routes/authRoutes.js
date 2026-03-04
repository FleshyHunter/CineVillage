const express = require("express");
const router = express.Router();
const { loginAccount } = require("../controllers/authControllers");

// Login page
router.get("/login", (req, res) => {
    const error = req.query.error; // get error from redirect query
    res.render("auth/login", { error, layout: false });
});


// Login POST
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    console.log("[AUTH] Login attempt", { email: (email || "").toString().trim() });
    const result = await loginAccount(email, password);

    if (result.error) {
        console.log("[AUTH] Login response error", { email: (email || "").toString().trim(), error: result.error });
        // Redirect back to login with a query param (or flash message)
        return res.redirect(`/auth/login?error=${encodeURIComponent(result.error)}`);
    }

    console.log("[AUTH] Login response success", {
        email: (email || "").toString().trim(),
        role: result.role
    });
    //redirect expects a url not a path, render expects a path
    res.redirect("/dashboard");
});

module.exports = router;

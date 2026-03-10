const express = require("express");
const router = express.Router();
const { loginAccount } = require("../controllers/authControllers");
const { setLoginTrackingCookies, clearLoginTrackingCookies } = require("../config/session");

// Login page
router.get("/login", (req, res) => {
    const error = req.query.error; // get error from redirect query
    res.render("auth/login", { error, layout: false });
});

// Reset password page (UI/routing only for now)
router.get("/reset", (req, res) => {
    const sent = req.query.sent === "1";
    res.render("auth/reset", { sent, layout: false });
});

// Logout
router.get("/logout", (req, res) => {
    clearLoginTrackingCookies(res);
    res.redirect("/auth/login");
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
    setLoginTrackingCookies(res, result.account, result.role);
    //redirect expects a url not a path, render expects a path
    res.redirect("/dashboard");
});

// Reset password submission placeholder (no real logic yet)
router.post("/reset", async (req, res) => {
    res.redirect("/auth/reset?sent=1");
});

module.exports = router;

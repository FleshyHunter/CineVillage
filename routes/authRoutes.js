const express = require("express");
const router = express.Router();
const {
    loginAccount,
    requestPasswordReset,
    validateResetToken,
    resetPasswordWithToken
} = require("../controllers/authControllers");
const { setLoginTrackingCookies, clearLoginTrackingCookies } = require("../config/session");

// Login page
router.get("/login", (req, res) => {
    const error = req.query.error; // get error from redirect query
    const info = req.query.info;
    res.render("auth/login", { error, info, layout: false });
});

// Request reset link page
router.get("/reset", (req, res) => {
    const sent = req.query.sent === "1";
    const error = req.query.error ? decodeURIComponent(req.query.error) : "";
    res.render("auth/reset", { sent, error, layout: false });
});

// Reset password form page
router.get("/reset/:token", async (req, res) => {
    const token = (req.params.token || "").toString();
    const tokenState = await validateResetToken(token);
    res.render("auth/resetPassword", {
        token,
        invalidToken: !tokenState.valid,
        error: null,
        layout: false
    });
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

// Request reset link submission
router.post("/reset", async (req, res) => {
    const email = (req.body.email || "").toString().trim();
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const result = await requestPasswordReset(email, baseUrl);

    if (result.error) {
        return res.redirect(`/auth/reset?error=${encodeURIComponent(result.error)}`);
    }

    res.redirect("/auth/reset?sent=1");
});

// Submit new password using token
router.post("/reset/:token", async (req, res) => {
    const token = (req.params.token || "").toString();
    const newPassword = (req.body.newPassword || "").toString();
    const confirmPassword = (req.body.confirmPassword || "").toString();

    const tokenState = await validateResetToken(token);
    if (!tokenState.valid) {
        return res.render("auth/resetPassword", {
            token,
            invalidToken: true,
            error: "This reset link is invalid or has expired.",
            layout: false
        });
    }

    if (!newPassword || !confirmPassword) {
        return res.render("auth/resetPassword", {
            token,
            invalidToken: false,
            error: "Please fill in both password fields.",
            layout: false
        });
    }

    if (newPassword !== confirmPassword) {
        return res.render("auth/resetPassword", {
            token,
            invalidToken: false,
            error: "New password and confirm password do not match.",
            layout: false
        });
    }

    const result = await resetPasswordWithToken(token, newPassword);
    if (result.error) {
        return res.render("auth/resetPassword", {
            token,
            invalidToken: false,
            error: result.error,
            layout: false
        });
    }

    res.redirect("/auth/login?info=Password%20updated%20successfully.%20Please%20log%20in.");
});

module.exports = router;

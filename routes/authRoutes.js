const express = require("express");
const router = express.Router();
const { loginAdmin } = require("../controllers/authControllers");

// Login page
router.get("/login", (req, res) => {
    const error = req.query.error; // get error from redirect query
    res.render("auth/login", { error, layout: false });
});


// Login POST
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const result = await loginAdmin(email, password);

    if (result.error) {
        // Redirect back to login with a query param (or flash message)
        return res.redirect(`/auth/login?error=${encodeURIComponent(result.error)}`);
    }

    //redirect expects a url not a path, render expects a path
    res.redirect("/dashboard");
});

module.exports = router;

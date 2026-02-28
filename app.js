//express init
const express = require("express");
const mongodb = require("mongodb");
const {disconnect, initDBIfNecessary} = require("./config/database");

const expressLayouts = require('express-ejs-layouts');

const app = express();
const port = 3000;

const authRoutes = require("./routes/authRoutes");
const movieRoutes = require("./routes/movieRoutes")
const hallRoutes = require("./routes/hallRoutes");
const screeningRoutes = require("./routes/screeningRoutes");

// const hallRoutes = requrire("./routes/")

const path = require("path");

//load css and static files FIRST
app.use(express.static("public"));

//load photo
app.use("/uploads", express.static("uploads"));

//middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(expressLayouts);

//ejs template setting
app.set("view engine" , "ejs");
app.set('layout', 'layouts/layout2');

//route mounting
app.use("/auth", authRoutes);
app.use("/movies", movieRoutes);
app.use("/halls", hallRoutes);
app.use("/screenings", screeningRoutes);

//routing
app.get("/", (req,res) => {

    //layout false to stop it for login
    res.render("auth/login", {layout: false}); 
    // res.render("auth/login");
});

//no views as view engine already declares to look at views for all ejs
app.get("/dashboard", (req,res) => {
    res.render("dashboard/dashboard", { pageTitle: "Dashboard" });
})

// Start server
async function startServer() {
    try {
        // Try to connect to DB, but don't block if it fails
        try {
            await initDBIfNecessary();
            console.log('Database connected successfully');
        } catch (dbError) {
            console.warn('Warning: Database connection failed');
            console.warn('Server will start anyway, but DB operations will fail');
            console.warn(dbError.message);
        }
        
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
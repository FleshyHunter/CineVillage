//express init
const express = require("express");
const mongodb = require("mongodb");
const {disconnect} = require("./config/database");

const expressLayouts = require('express-ejs-layouts');

const app = express();
const port = 3000;

const authRoutes = require("./routes/authRoutes");
const movieRoutes = require("./routes/movieRoutes")

// const hallRoutes = requrire("./routes/")

const path = require("path");

//middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(expressLayouts);

//route mounting
app.use("/auth", authRoutes);
app.use("/movies", movieRoutes);

//ejs template setting
app.set("view engine" , "ejs");
app.set('layout', 'layouts/layout');

//load css
app.use(express.static("public"));

//load photo
app.use("/uploads", express.static("uploads"));

//routing
app.get("/", (req,res) => {

    //layout false to stop it for login
    res.render("auth/login", {layout: false}); 
    // res.render("auth/login");
});

//no views as view engine already declares to look at views for all ejs
app.get("/dashboard", (req,res) => {

    res.render("dashboard/dashboard", );
})

app.listen(port, () => {})
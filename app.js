//express init
const express = require("express");
const {disconnect, initDBIfNecessary} = require("./config/database");
const {
    getCollectionMovie,
    getCollectionHall,
    getCollectionScreening
} = require("./config/database");
const { attachCurrentAccount, requireAuth, requireRoles } = require("./config/session");

const expressLayouts = require('express-ejs-layouts');

const app = express();
const port = 3000;

const authRoutes = require("./routes/authRoutes");
const movieRoutes = require("./routes/movieRoutes")
const hallRoutes = require("./routes/hallRoutes");
const screeningRoutes = require("./routes/screeningRoutes");
const profileRoutes = require("./routes/profileRoutes");
const personnelRoutes = require("./routes/personnelRoutes");
const historyRoutes = require("./routes/historyRoutes");

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
app.use(attachCurrentAccount);

//ejs template setting
app.set("view engine" , "ejs");
app.set('layout', 'layouts/layout2');

//route mounting
app.use("/auth", authRoutes);
app.use("/movies", requireAuth, movieRoutes);
app.use("/halls", requireAuth, hallRoutes);
app.use("/screenings", requireAuth, screeningRoutes);
app.use("/profile", requireAuth, profileRoutes);
app.use("/personnel", requireRoles(["Admin"]), personnelRoutes);
app.use("/history", requireRoles(["Admin", "Manager"]), historyRoutes);

//routing
app.get("/", (req,res) => {

    //layout false to stop it for login
    res.render("auth/login", {layout: false}); 
    // res.render("auth/login");
});

//no views as view engine already declares to look at views for all ejs
function getMaintenanceWindow(hall) {
    if (!hall || hall.status !== "Under Maintenance" || !hall.maintenanceStartDate || !hall.maintenanceEndDate) {
        return null;
    }
    const start = new Date(`${hall.maintenanceStartDate}T00:00:00`);
    const end = new Date(`${hall.maintenanceEndDate}T23:59:59.999`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return null;
    }
    return { start, end };
}

function isHallUnderMaintenanceNow(hall, now) {
    if (!hall) return false;
    const window = getMaintenanceWindow(hall);
    if (!window) return hall.status === "Under Maintenance";
    return now >= window.start && now <= window.end;
}

app.get("/dashboard", requireAuth, async (req, res) => {
    try {
        await initDBIfNecessary();
        const collectionMovie = getCollectionMovie();
        const collectionHall = getCollectionHall();
        const collectionScreening = getCollectionScreening();

        const [movies, halls, screenings] = await Promise.all([
            collectionMovie.find({}).toArray(),
            collectionHall.find({}).toArray(),
            collectionScreening.find({}).toArray()
        ]);

        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(now);
        endOfToday.setHours(23, 59, 59, 999);

        const movieStats = {
            nowShowing: movies.filter(m => m.status === "Now Showing").length,
            comingSoon: movies.filter(m => m.status === "Coming Soon").length,
            discontinued: movies.filter(m => m.status === "Discontinued").length
        };

        const hallStats = {
            active: halls.filter(h => !isHallUnderMaintenanceNow(h, now)).length,
            maintenance: halls.filter(h => isHallUnderMaintenanceNow(h, now)).length
        };

        const screeningStats = {
            today: screenings.filter(s => {
                if (!s.startDateTime) return false;
                const dt = new Date(s.startDateTime);
                return dt >= startOfToday && dt <= endOfToday;
            }).length,
            impacted: screenings.filter(s => s.status === "paused").length,
            completedToday: screenings.filter(s => {
                if (s.status !== "completed" || !s.endDateTime) return false;
                const end = new Date(s.endDateTime);
                return end >= startOfToday && end <= endOfToday;
            }).length
        };

        const newMovies = movies
            .filter(m => m.releaseDate)
            .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate))
            .slice(0, 5);

        const movieMap = new Map(movies.map(m => [String(m._id), m]));
        const hallMap = new Map(halls.map(h => [String(h._id), h]));

        const activeScreenings = screenings
            .filter(s => ["scheduled", "ongoing", "paused"].includes(s.status))
            .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime))
            .map(s => ({
                ...s,
                movie: movieMap.get(String(s.movieId)) || null,
                hall: hallMap.get(String(s.hallId)) || null
            }));

        res.render("dashboard/dashboard", {
            pageTitle: "Dashboard",
            movieStats,
            hallStats,
            screeningStats,
            newMovies,
            upcomingScreenings: activeScreenings
        });
    } catch (error) {
        console.error("Error loading dashboard:", error);
        res.status(500).send("Error loading dashboard");
    }
});

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

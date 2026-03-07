const express = require("express");
const router = express.Router();
const { 
  createScreening, 
  getAllScreenings, 
  getScreeningById, 
  updateScreening, 
  deleteScreening, 
  getHallSchedule,
  getHallSchedulePage,
  getMovieScreenings,
  updateScreeningStatuses
} = require("../controllers/screeningController");
const { initDBIfNecessary, getCollectionScreening, getCollectionMovie, getCollectionHall } = require("../config/database");
const { ObjectId } = require("mongodb");

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) {
    return "/screenings";
  }
  if (returnTo.startsWith("//")) {
    return "/screenings";
  }
  return returnTo;
}

// View by Hall schedule (individual hall)
router.get("/hall/:hallId", getHallSchedulePage);

// View by Movie routes
router.get("/movie/:movieId", getMovieScreenings);

// API endpoint for date screenings (AJAX)
router.get("/api/date-screenings", async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    
    await initDBIfNecessary();
    const collectionScreening = getCollectionScreening();
    const collectionMovie = getCollectionMovie();
    const collectionHall = getCollectionHall();
    
    // Parse selected date
    const [year, month, day] = selectedDate.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59);
    
    // Get all screenings for this date
    const screenings = await collectionScreening.find({
      startDateTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['scheduled', 'ongoing', 'paused'] }
    }).toArray();
    
    // Get unique movie IDs
    const movieIds = [...new Set(screenings.map(s => s.movieId.toString()))];
    const movies = await collectionMovie.find({
      _id: { $in: movieIds.map(id => new ObjectId(id)) }
    }).toArray();
    
    // Get all halls
    const halls = await collectionHall.find({}).toArray();
    const hallMap = {};
    halls.forEach(h => {
      hallMap[h._id.toString()] = { name: h.name, type: h.type };
    });
    
    // Group screenings by movie and hall type
    const moviesWithScreenings = movies.map(movie => {
      const movieScreenings = screenings.filter(s => s.movieId.toString() === movie._id.toString());
      
      const byHallType = {};
      movieScreenings.forEach(screening => {
        const hallInfo = hallMap[screening.hallId.toString()];
        if (hallInfo) {
          if (!byHallType[hallInfo.type]) {
            byHallType[hallInfo.type] = [];
          }
          byHallType[hallInfo.type].push({
            time: screening.startDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
            hallName: hallInfo.name,
            screeningId: screening._id.toString()
          });
        }
      });
      
      Object.keys(byHallType).forEach(type => {
        byHallType[type].sort((a, b) => a.time.localeCompare(b.time));
      });
      
      return {
        name: movie.name,
        duration: movie.duration,
        pictureUrl: movie.pictureUrl,
        ageRestriction: movie.ageRestriction,
        screeningsByHallType: byHallType
      };
    });
    
    res.json(moviesWithScreenings);
  } catch (error) {
    console.error('Error fetching date screenings:', error);
    res.status(500).json({ error: 'Failed to fetch screenings' });
  }
});

// GET screening creation form
router.get("/create", async (req, res) => {
  await initDBIfNecessary();
  
  // Fetch movies and halls for dropdowns
  const collectionMovie = getCollectionMovie();
  const collectionHall = getCollectionHall();
  
  const movies = await collectionMovie.find({ 
    status: { $in: ["New", "Now Showing", "Coming Soon"] } 
  }).toArray();
  
  const halls = await collectionHall.find({}).toArray();
  
  res.render("screenings/screeningForm", {
    screening: null,
    movies,
    halls,
    isEdit: false,
    title: "Screenings",
    returnTo: "/screenings"
  });
});

// POST form submission
router.post("/create", async (req, res) => {
  try {
    const screeningData = req.body;
    await createScreening(screeningData);
    res.redirect("/screenings");
  } catch (err) {
    console.error(err);
    // Return to form with error message
    const collectionMovie = getCollectionMovie();
    const collectionHall = getCollectionHall();
    const movies = await collectionMovie.find({ status: { $in: ["New", "Now Showing", "Coming Soon"] } }).toArray();
    const halls = await collectionHall.find({}).toArray();
    
    res.render("screenings/screeningForm", {
      screening: req.body,
      movies,
      halls,
      isEdit: false,
      title: "Screenings",
      error: err.message || "Error creating screening",
      returnTo: "/screenings"
    });
  }
});

// GET edit form
router.get("/edit/:id", async (req, res) => {
  await initDBIfNecessary();
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  
  // Auto-update statuses before fetching
  await updateScreeningStatuses();

  const collectionScreening = getCollectionScreening();
  const screening = await collectionScreening.findOne({
    _id: new ObjectId(req.params.id)
  });

  if (!screening) return res.send("Screening not found");

  // Fetch movies and halls for dropdowns
  const collectionMovie = getCollectionMovie();
  const collectionHall = getCollectionHall();
  
  const movies = await collectionMovie.find({ 
    status: { $in: ["New", "Now Showing", "Coming Soon"] } 
  }).toArray();
  const halls = await collectionHall.find({}).toArray();

  // Populate movie and hall details
  if (screening.movieId) {
    screening.movieId = await collectionMovie.findOne({ _id: new ObjectId(screening.movieId) });
  }
  if (screening.hallId) {
    screening.hallId = await collectionHall.findOne({ _id: new ObjectId(screening.hallId) });
  }

  // Extract date and time from startDateTime using local timezone
  if (screening.startDateTime) {
    const date = new Date(screening.startDateTime);
    // Use local timezone methods to avoid UTC conversion issues
    screening.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    screening.startTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  res.render("screenings/screeningForm", {
    screening,
    movies,
    halls,
    isEdit: true,
    title: "Screenings",
    returnTo
  });
});

// GET view-only detail page
router.get("/view/:id", async (req, res) => {
  await initDBIfNecessary();
  const returnTo = sanitizeReturnTo(req.query.returnTo);

  // Auto-update statuses before fetching
  await updateScreeningStatuses();

  const collectionScreening = getCollectionScreening();
  const screening = await collectionScreening.findOne({
    _id: new ObjectId(req.params.id)
  });

  if (!screening) return res.send("Screening not found");

  // Populate movie and hall details
  const collectionMovie = getCollectionMovie();
  const collectionHall = getCollectionHall();

  if (screening.movieId) {
    screening.movieId = await collectionMovie.findOne({ _id: new ObjectId(screening.movieId) });
  }
  if (screening.hallId) {
    screening.hallId = await collectionHall.findOne({ _id: new ObjectId(screening.hallId) });
  }

  // Extract date and time from startDateTime using local timezone
  if (screening.startDateTime) {
    const date = new Date(screening.startDateTime);
    screening.date = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    screening.startTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  res.render("screenings/screeningDetail", {
    screening,
    title: "View Screening",
    returnTo
  });
});

// POST update
router.post("/edit/:id", async (req, res) => {
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  try {
    const screeningData = req.body;
    await updateScreening(req.params.id, screeningData);
    res.redirect(returnTo);
  } catch (err) {
    console.error(err);
    // Return to form with error message
    const collectionMovie = getCollectionMovie();
    const collectionHall = getCollectionHall();
    const movies = await collectionMovie.find({ 
      status: { $in: ["New", "Now Showing", "Coming Soon"] } 
    }).toArray();
    const halls = await collectionHall.find({}).toArray();
    
    res.render("screenings/screeningForm", {
      screening: { _id: req.params.id, ...req.body },
      movies,
      halls,
      isEdit: true,
      title: "Screenings",
      error: err.message || "Error updating screening",
      returnTo
    });
  }
});

// POST delete
router.post("/delete/:id", async (req, res) => {
  try {
    await deleteScreening(req.params.id);
    res.redirect("/screenings");
  } catch (err) {
    console.error(err);
    res.send("Error deleting screening");
  }
});

// GET all screenings (list/grid)
router.get("/", getAllScreenings);

// API endpoint: Get hall schedule for timeline visualization
router.get("/api/schedule/:hallId/:date", async (req, res) => {
  try {
    const { hallId, date } = req.params;
    const schedule = await getHallSchedule(hallId, date);
    res.json(schedule);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error fetching hall schedule" });
  }
});

// GET single screening details
router.get("/:id", async (req, res) => {
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  res.redirect(`/screenings/view/${req.params.id}?returnTo=${encodeURIComponent(returnTo)}`);
});

module.exports = router;

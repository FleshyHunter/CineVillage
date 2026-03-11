const express = require("express");
const router = express.Router();
const { createMovie, getAllMovies, getMoviebyId, updateMovie, deleteMovie } = require("../controllers/movieController"); // you'll make this
const { initDBIfNecessary, getCollectionMovie } = require("../config/database");
const { ObjectId } = require("mongodb");
const { requireRoles } = require("../config/session");
const { logAction } = require("../config/audit");

const multer = require("multer");
const path = require("path");

//store user photo uploads:
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({ storage: storage });

// GET movie creation form
router.get("/create", requireRoles(["Admin", "Manager"]), (req, res) => {
  res.render("movies/movieForm", {
    movie: null,
    isEdit: false,
    title: "Movies",
    error: null
  }); // points to views/movies/createMovies.ejs
});

// POST form submission
router.post("/create", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();
    
    // Check if movie name already exists (case-insensitive)
    const escapedName = req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingMovie = await collectionMovie.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') }
    });
    
    if (existingMovie) {
      return res.render("movies/movieForm", {
        movie: req.body,
        isEdit: false,
        title: "Movies",
        error: "A movie with this name already exists. Please choose a different name."
      });
    }
    
    const movieData = req.body;

    if (req.file) {
      movieData.pictureUrl = "/uploads/" + req.file.filename;
    }

    await createMovie(movieData);
    await logAction(req, {
      module: "movie",
      operation: "create",
      item: movieData.name || ""
    });
    res.redirect("/movies");
  } catch (err) {
    console.error(err);
    res.send("Error creating movie");
  }
});

// GET edit form
router.get("/edit/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  await initDBIfNecessary();

  const collectionMovie = getCollectionMovie();
  const movie = await collectionMovie.findOne({
    _id: new ObjectId(req.params.id)
  });

  if (!movie) return res.send("Movie not found");

  res.render("movies/movieForm", {
    movie,
    isEdit: true,
    title: "Movies",
    error: null
  });
});

// POST update
router.post("/edit/:id", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();
    
    // Check if another movie with same name exists (case-insensitive, excluding current movie)
    const escapedName = req.body.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingMovie = await collectionMovie.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, 'i') },
      _id: { $ne: new ObjectId(req.params.id) }
    });
    
    if (existingMovie) {
      const currentMovie = await collectionMovie.findOne({
        _id: new ObjectId(req.params.id)
      });
      return res.render("movies/movieForm", {
        movie: { ...currentMovie, ...req.body, _id: req.params.id },
        isEdit: true,
        title: "Movies",
        error: "A movie with this name already exists. Please choose a different name."
      });
    }
    
    const movieData = req.body;

    if (req.file) {
      movieData.pictureUrl = "/uploads/" + req.file.filename;
    }

    await updateMovie(req.params.id, movieData);
    await logAction(req, {
      module: "movie",
      operation: "update",
      targetId: req.params.id,
      item: movieData.name || ""
    });
    res.redirect(`/movies/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.send("Error updating movie");
  }
});

// delete
router.post("/delete/:id", requireRoles(["Admin", "Manager"]), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();
    const existingMovie = ObjectId.isValid(req.params.id)
      ? await collectionMovie.findOne({ _id: new ObjectId(req.params.id) })
      : null;
    await deleteMovie(req.params.id);
    await logAction(req, {
      module: "movie",
      operation: "delete",
      targetId: req.params.id,
      item: existingMovie?.name || ""
    });
    res.redirect("/movies"); // redirect back to the movie list
  } catch (err) {
    console.error(err);
    res.send("Error deleting movie");
  }
});

// GET all movies (list/grid)
router.get("/", requireRoles(["Admin", "Manager", "Staff"]), getAllMovies);


// GET single movie details
router.get("/:id", requireRoles(["Admin", "Manager", "Staff"]), async (req, res) => {
    const movie = await getMoviebyId(req.params.id);
    //add title to all routes that uses templating unless not using
    res.render('movies/movieDetail', { title: "Movies", isEdit: false, movie});
  }

);

module.exports = router;

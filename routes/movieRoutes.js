const express = require("express");
const axios = require("axios");
const router = express.Router();
const { createMovie, getAllMovies, getMoviebyId, updateMovie, deleteMovie } = require("../controllers/movieController");
const { initDBIfNecessary, getCollectionMovie } = require("../config/database");
const { ObjectId } = require("mongodb");
const { requireRoles } = require("../config/session");
const { logAction } = require("../config/audit");

const multer = require("multer");
const path = require("path");

const OMDB_BASE_URL = "https://www.omdbapi.com/";
const OMDB_RESULT_LIMIT = 8;

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeOmdbText(value) {
  const text = (value || "").toString().trim();
  if (!text || text.toUpperCase() === "N/A") return "";
  return text;
}

function truncate(value, maxLength) {
  const text = (value || "").toString();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function getTodayIsoDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseOmdbReleasedDate(rawDate) {
  const value = normalizeOmdbText(rawDate);
  if (!value) return "";

  const monthMap = {
    Jan: "01",
    Feb: "02",
    Mar: "03",
    Apr: "04",
    May: "05",
    Jun: "06",
    Jul: "07",
    Aug: "08",
    Sep: "09",
    Oct: "10",
    Nov: "11",
    Dec: "12"
  };

  const match = value.match(/^(\d{1,2})\s([A-Za-z]{3})\s(\d{4})$/);
  if (!match) return "";

  const [, dayRaw, monthRaw, year] = match;
  const month = monthMap[monthRaw];
  if (!month) return "";

  const day = String(Number(dayRaw)).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseOmdbRuntime(rawRuntime) {
  const value = normalizeOmdbText(rawRuntime);
  if (!value) return "";
  const minutes = parseInt(value, 10);
  if (Number.isNaN(minutes) || minutes <= 0) return "";
  return minutes;
}

function parseOmdbImdbRating(rawRating) {
  const value = normalizeOmdbText(rawRating);
  if (!value) return "";

  const imdbOutOfTen = parseFloat(value);
  if (Number.isNaN(imdbOutOfTen)) return "";

  const converted = Math.round((imdbOutOfTen / 2) * 10) / 10;
  return Math.max(0, Math.min(5, converted));
}

function mapOmdbRatedToAgeRestriction(rawRated) {
  const rated = normalizeOmdbText(rawRated).toUpperCase();

  if (!rated || rated === "N/A" || rated === "NOT RATED" || rated === "UNRATED") return "G";

  if (rated === "G") return "G";
  if (rated === "PG") return "PG";
  if (rated === "PG-13" || rated === "PG13") return "PG13";
  if (rated === "R") return "M18";
  if (rated === "NC-17" || rated === "NC17") return "R21";
  if (rated === "TV-14") return "NC16";
  if (rated === "TV-MA") return "M18";
  if (rated === "TV-PG") return "PG";
  if (rated === "TV-G" || rated === "TV-Y" || rated === "TV-Y7") return "G";
  if (rated === "M") return "M18";
  if (rated === "GP") return "PG";
  if (rated === "PASSED" || rated === "APPROVED") return "G";

  return "G";
}

function mapOmdbLanguageAndSubtitle(rawLanguage) {
  const parts = (rawLanguage || "")
    .toString()
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const hasEnglish = parts.some((part) => part.includes("english"));
  const hasMandarin = parts.some((part) => part.includes("mandarin") || part.includes("chinese"));

  let language = "";
  let subtitle = "";

  if (hasEnglish) {
    language = "English";
  } else if (hasMandarin) {
    language = "Mandarin";
  }

  if (hasEnglish && hasMandarin) {
    subtitle = language === "English" ? "Mandarin" : "English";
  }

  return { language, subtitle };
}

function normalizeOmdbPosterUrl(rawPoster) {
  const posterUrl = normalizeOmdbText(rawPoster);
  if (!posterUrl) return "";
  return posterUrl;
}

function mapOmdbMovieToFormPayload(omdbMovie) {
  const releaseDate = parseOmdbReleasedDate(omdbMovie.Released);
  const todayIso = getTodayIsoDate();
  const status = releaseDate
    ? (releaseDate <= todayIso ? "Now Showing" : "Coming Soon")
    : "";

  const { language, subtitle } = mapOmdbLanguageAndSubtitle(omdbMovie.Language);

  return {
    name: truncate(normalizeOmdbText(omdbMovie.Title), 50),
    duration: parseOmdbRuntime(omdbMovie.Runtime),
    rating: parseOmdbImdbRating(omdbMovie.imdbRating),
    ageRestriction: mapOmdbRatedToAgeRestriction(omdbMovie.Rated),
    producer: normalizeOmdbText(omdbMovie.Director),
    genre: normalizeOmdbText(omdbMovie.Genre),
    language,
    subtitle,
    releaseDate,
    status,
    cast: normalizeOmdbText(omdbMovie.Actors),
    description: truncate(normalizeOmdbText(omdbMovie.Plot), 150),
    pictureUrl: normalizeOmdbPosterUrl(omdbMovie.Poster),
    imdbId: normalizeOmdbText(omdbMovie.imdbID)
  };
}

function getOmdbKey() {
  return (process.env.OMDB_KEY || "").toString().trim();
}

// GET movie creation form
router.get("/create", requireRoles(["Admin", "Manager"]), (req, res) => {
  res.render("movies/movieForm", {
    movie: null,
    isEdit: false,
    title: "Movies",
    error: null
  });
});

// POST form submission
router.post("/create", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();

    const movieName = (req.body.name || "").toString().trim();
    const escapedName = escapeRegex(movieName);
    const existingMovie = await collectionMovie.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") }
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

    const movieName = (req.body.name || "").toString().trim();
    const escapedName = escapeRegex(movieName);
    const existingMovie = await collectionMovie.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
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
    res.redirect("/movies");
  } catch (err) {
    console.error(err);
    res.send("Error deleting movie");
  }
});

// GET all movies (list/grid)
router.get("/", requireRoles(["Admin", "Manager", "Staff"]), getAllMovies);

// Search OMDB by title for picker list
router.get("/omdb/search", requireRoles(["Admin", "Manager"]), async (req, res) => {
  const title = (req.query.title || "").toString().trim();
  if (!title) {
    return res.status(400).json({ error: "Title is required", results: [] });
  }

  const omdbKey = getOmdbKey();
  if (!omdbKey) {
    return res.status(500).json({ error: "OMDB API key is missing", results: [] });
  }

  try {
    const response = await axios.get(OMDB_BASE_URL, {
      params: {
        apikey: omdbKey,
        s: title,
        type: "movie"
      },
      timeout: 8000
    });

    const omdbData = response.data || {};
    if (omdbData.Response === "False") {
      return res.json({
        error: omdbData.Error || "No results found",
        results: []
      });
    }

    const results = Array.isArray(omdbData.Search)
      ? omdbData.Search.slice(0, OMDB_RESULT_LIMIT).map((item) => ({
          imdbId: normalizeOmdbText(item.imdbID),
          title: normalizeOmdbText(item.Title),
          year: normalizeOmdbText(item.Year),
          posterUrl: normalizeOmdbPosterUrl(item.Poster)
        }))
      : [];

    return res.json({ results });
  } catch (error) {
    console.error("OMDB search error:", error.message);
    const upstreamError =
      error?.response?.data?.Error ||
      error?.code ||
      error?.message ||
      "Unknown error";
    return res.status(502).json({
      error: `Failed to fetch OMDB results: ${upstreamError}`,
      results: []
    });
  }
});

// Fetch a single OMDB record and map it to form fields
router.get("/omdb/details", requireRoles(["Admin", "Manager"]), async (req, res) => {
  const imdbId = (req.query.imdbId || "").toString().trim();
  if (!imdbId) {
    return res.status(400).json({ error: "imdbId is required" });
  }

  const omdbKey = getOmdbKey();
  if (!omdbKey) {
    return res.status(500).json({ error: "OMDB API key is missing" });
  }

  try {
    const response = await axios.get(OMDB_BASE_URL, {
      params: {
        apikey: omdbKey,
        i: imdbId,
        plot: "full"
      },
      timeout: 8000
    });

    const omdbData = response.data || {};
    if (omdbData.Response === "False") {
      return res.status(404).json({ error: omdbData.Error || "Movie not found" });
    }

    return res.json({ movie: mapOmdbMovieToFormPayload(omdbData) });
  } catch (error) {
    console.error("OMDB details error:", error.message);
    const upstreamError =
      error?.response?.data?.Error ||
      error?.code ||
      error?.message ||
      "Unknown error";
    return res.status(502).json({
      error: `Failed to fetch OMDB movie details: ${upstreamError}`
    });
  }
});

// GET single movie details
router.get("/:id", requireRoles(["Admin", "Manager", "Staff"]), async (req, res) => {
  const movie = await getMoviebyId(req.params.id);
  res.render("movies/movieDetail", { title: "Movies", isEdit: false, movie });
});

module.exports = router;

const express = require("express");
const axios = require("axios");
const router = express.Router();
const { createMovie, getAllMovies, getMoviebyId, updateMovie, deleteMovie } = require("../controllers/movieController");
const { initDBIfNecessary, getCollectionMovie, getCollectionScreening } = require("../config/database");
const { ObjectId } = require("mongodb");
const { requireRoles } = require("../config/session");
const { logAction } = require("../config/audit");

const multer = require("multer");
const path = require("path");

const OMDB_BASE_URL = "https://www.omdbapi.com/";
const OMDB_RESULT_LIMIT = 8;
const SYNOPSIS_MAX_WORDS = 150;
const MOVIE_NAME_MAX_LENGTH = 50;

const ALLOWED_AGE_RESTRICTIONS = new Set(["G", "PG", "PG13", "NC16", "M18", "R21"]);
const ALLOWED_LANGUAGES = new Set(["English", "Mandarin", "Malay", "Tamil", "Hindi"]);
const ALLOWED_SUBTITLES = new Set(["English", "Mandarin", "Malay", "Tamil", "Hindi"]);
const ALLOWED_STATUSES = new Set(["Now Showing", "Advance Sales", "Coming Soon", "Discontinued"]);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IMDB_ID_PATTERN = /^tt\d+$/i;
const UPLOAD_PICTURE_PATH_PATTERN = /^\/uploads\/[A-Za-z0-9._-]+$/;

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

function sanitizeReturnTo(returnTo) {
  if (typeof returnTo !== "string" || !returnTo.startsWith("/")) {
    return "/movies";
  }
  if (returnTo.startsWith("//")) {
    return "/movies";
  }
  return returnTo;
}

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

function normalizeText(value) {
  return (value || "").toString().trim();
}

function normalizeMovieData(rawMovieData = {}) {
  return {
    ...rawMovieData,
    name: normalizeText(rawMovieData.name),
    duration: normalizeText(rawMovieData.duration),
    rating: normalizeText(rawMovieData.rating),
    ageRestriction: normalizeText(rawMovieData.ageRestriction),
    producer: normalizeText(rawMovieData.producer),
    genre: normalizeText(rawMovieData.genre),
    language: normalizeText(rawMovieData.language),
    subtitle: normalizeText(rawMovieData.subtitle),
    releaseDate: normalizeText(rawMovieData.releaseDate),
    status: normalizeText(rawMovieData.status),
    cast: normalizeText(rawMovieData.cast),
    description: normalizeText(rawMovieData.description),
    pictureUrl: normalizeText(rawMovieData.pictureUrl),
    imdbId: normalizeText(rawMovieData.imdbId)
  };
}

function getWordCount(value) {
  const text = (value || "").toString().trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function truncateWords(value, maxWords) {
  const text = (value || "").toString().trim();
  if (!text) return "";

  const words = text.split(/\s+/);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

function isValidIsoDate(value) {
  if (!value) return true;
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function isValidPictureUrl(value) {
  if (!value) return true;
  if (UPLOAD_PICTURE_PATH_PATTERN.test(value)) return true;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

function validateMovieData(movieData) {
  if (!movieData.name) return "Movie name is required.";
  if (movieData.name.length > MOVIE_NAME_MAX_LENGTH) {
    return `Movie name cannot exceed ${MOVIE_NAME_MAX_LENGTH} characters.`;
  }

  if (!movieData.duration) return "Duration is required.";
  if (!/^\d+$/.test(movieData.duration)) return "Duration must be a whole number greater than 0.";
  const parsedDuration = Number.parseInt(movieData.duration, 10);
  if (!Number.isInteger(parsedDuration) || parsedDuration <= 0) {
    return "Duration must be a whole number greater than 0.";
  }

  if (movieData.rating) {
    const parsedRating = Number(movieData.rating);
    if (!Number.isFinite(parsedRating) || parsedRating < 0 || parsedRating > 5) {
      return "Rating must be a number between 0 and 5.";
    }
  }

  if (movieData.ageRestriction && !ALLOWED_AGE_RESTRICTIONS.has(movieData.ageRestriction)) {
    return "Invalid age restriction selected.";
  }

  if (!ALLOWED_LANGUAGES.has(movieData.language)) {
    return "Please select a valid language.";
  }

  if (movieData.subtitle && !ALLOWED_SUBTITLES.has(movieData.subtitle)) {
    return "Invalid subtitle selected.";
  }

  if (movieData.status && !ALLOWED_STATUSES.has(movieData.status)) {
    return "Invalid status selected.";
  }

  if (!isValidIsoDate(movieData.releaseDate)) {
    return "Invalid release date.";
  }

  if (getWordCount(movieData.description) > SYNOPSIS_MAX_WORDS) {
    return `Synopsis cannot exceed ${SYNOPSIS_MAX_WORDS} words.`;
  }

  if (movieData.imdbId && !IMDB_ID_PATTERN.test(movieData.imdbId)) {
    return "Invalid IMDb ID format.";
  }

  if (!isValidPictureUrl(movieData.pictureUrl)) {
    return "Poster URL must be a valid URL or uploaded file path.";
  }

  return null;
}

function coerceMovieDataForPersistence(movieData) {
  return {
    ...movieData,
    duration: Number.parseInt(movieData.duration, 10),
    rating: movieData.rating === "" ? "" : Number(movieData.rating)
  };
}

async function findDuplicateMovieError(collectionMovie, movieData, excludeMovieId = null) {
  const excludeFilter = {};
  if (excludeMovieId && ObjectId.isValid(excludeMovieId)) {
    excludeFilter._id = { $ne: new ObjectId(excludeMovieId) };
  }

  if (movieData.imdbId) {
    const escapedImdbId = escapeRegex(movieData.imdbId);
    const existingByImdbId = await collectionMovie.findOne({
      imdbId: { $regex: new RegExp(`^${escapedImdbId}$`, "i") },
      ...excludeFilter
    });
    if (existingByImdbId) {
      return "A movie with this IMDb ID already exists.";
    }
  }

  const escapedName = escapeRegex(movieData.name);
  const existingByName = await collectionMovie.findOne({
    name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    ...excludeFilter
  });

  if (existingByName) {
    return "A movie with this name already exists. Please choose a different name.";
  }

  return null;
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

  const detectedLanguages = [];
  const addDetectedLanguage = (language) => {
    if (language && !detectedLanguages.includes(language)) {
      detectedLanguages.push(language);
    }
  };

  parts.forEach((part) => {
    if (part.includes("english")) {
      addDetectedLanguage("English");
      return;
    }
    if (part.includes("mandarin") || part.includes("chinese")) {
      addDetectedLanguage("Mandarin");
      return;
    }
    if (/\bmalay\b/.test(part)) {
      addDetectedLanguage("Malay");
      return;
    }
    if (part.includes("tamil")) {
      addDetectedLanguage("Tamil");
      return;
    }
    if (part.includes("hindi")) {
      addDetectedLanguage("Hindi");
    }
  });

  return {
    language: detectedLanguages[0] || "",
    subtitle: detectedLanguages[1] || ""
  };
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
    description: truncateWords(normalizeOmdbText(omdbMovie.Plot), SYNOPSIS_MAX_WORDS),
    pictureUrl: normalizeOmdbPosterUrl(omdbMovie.Poster),
    imdbId: normalizeOmdbText(omdbMovie.imdbID)
  };
}

function getOmdbKey() {
  return (process.env.OMDB_KEY || "").toString().trim();
}

// GET movie creation form
router.get("/create", requireRoles(["Admin", "Manager"]), (req, res) => {
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  res.render("movies/movieForm", {
    movie: null,
    isEdit: false,
    title: "Movies",
    error: null,
    returnTo
  });
});

// POST form submission
router.post("/create", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();
    const movieData = normalizeMovieData(req.body);
    const returnTo = sanitizeReturnTo(req.body.returnTo);

    if (req.file) {
      movieData.pictureUrl = "/uploads/" + req.file.filename;
    }

    const validationError = validateMovieData(movieData);
    if (validationError) {
      return res.render("movies/movieForm", {
        movie: movieData,
        isEdit: false,
        title: "Movies",
        error: validationError,
        returnTo
      });
    }

    const duplicateError = await findDuplicateMovieError(collectionMovie, movieData);
    if (duplicateError) {
      return res.render("movies/movieForm", {
        movie: movieData,
        isEdit: false,
        title: "Movies",
        error: duplicateError,
        returnTo
      });
    }

    const movieDataToPersist = coerceMovieDataForPersistence(movieData);
    await createMovie(movieDataToPersist);
    await logAction(req, {
      module: "movie",
      operation: "create",
      item: movieDataToPersist.name || ""
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
  const returnTo = sanitizeReturnTo(req.query.returnTo);

  const collectionMovie = getCollectionMovie();
  const movie = await collectionMovie.findOne({
    _id: new ObjectId(req.params.id)
  });

  if (!movie) return res.send("Movie not found");

  res.render("movies/movieForm", {
    movie,
    isEdit: true,
    title: "Movies",
    error: null,
    returnTo
  });
});

// POST update
router.post("/edit/:id", requireRoles(["Admin", "Manager"]), upload.single("picture"), async (req, res) => {
  try {
    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();
    const movieData = normalizeMovieData(req.body);
    const returnTo = sanitizeReturnTo(req.body.returnTo);

    if (req.file) {
      movieData.pictureUrl = "/uploads/" + req.file.filename;
    }

    const validationError = validateMovieData(movieData);
    if (validationError) {
      return res.render("movies/movieForm", {
        movie: { ...movieData, _id: req.params.id },
        isEdit: true,
        title: "Movies",
        error: validationError,
        returnTo
      });
    }

    const duplicateError = await findDuplicateMovieError(collectionMovie, movieData, req.params.id);
    if (duplicateError) {
      return res.render("movies/movieForm", {
        movie: { ...movieData, _id: req.params.id },
        isEdit: true,
        title: "Movies",
        error: duplicateError,
        returnTo
      });
    }

    const movieDataToPersist = coerceMovieDataForPersistence(movieData);
    await updateMovie(req.params.id, movieDataToPersist);
    await logAction(req, {
      module: "movie",
      operation: "update",
      targetId: req.params.id,
      item: movieDataToPersist.name || ""
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
    if (err.message && err.message.includes("Cannot delete movie")) {
      return res.redirect(`/movies/${req.params.id}?deleteError=${encodeURIComponent(err.message)}`);
    }
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
  await initDBIfNecessary();
  const movie = await getMoviebyId(req.params.id);
  const returnTo = sanitizeReturnTo(req.query.returnTo);
  const collectionScreening = getCollectionScreening();
  const totalLinkedScreeningCount = ObjectId.isValid(req.params.id)
    ? await collectionScreening.countDocuments({ movieId: new ObjectId(req.params.id) })
    : 0;
  const activeLinkedScreeningCount = ObjectId.isValid(req.params.id)
    ? await collectionScreening.countDocuments({
        movieId: new ObjectId(req.params.id),
        status: { $in: ["scheduled", "ongoing", "paused"] }
      })
    : 0;
  res.render("movies/movieDetail", {
    title: "Movies",
    isEdit: false,
    movie,
    returnTo,
    totalLinkedScreeningCount,
    activeLinkedScreeningCount,
    deleteError: req.query.deleteError || null
  });
});

module.exports = router;

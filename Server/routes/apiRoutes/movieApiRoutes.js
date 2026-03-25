const express = require("express");
const {
  listMovies,
  getMovieById
} = require("../../controllers/apiControllers/movieApiController");

const router = express.Router();

router.get("/", listMovies);
router.get("/:id", getMovieById);

module.exports = router;

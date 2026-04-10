const axios = require("axios");
const { ObjectId } = require("mongodb");
const {
  initDBIfNecessary,
  getCollectionMovie,
  getCollectionHall,
  getCollectionScreening
} = require("../../config/database");
const { updateScreeningStatuses } = require("../screeningController");
const { evaluateScreeningBookability } = require("../screeningBookability");

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function serializeMovie(movie) {
  if (!movie) return null;

  return {
    ...movie,
    _id: String(movie._id)
  };
}

function buildMovieFilters(query = {}) {
  const filters = {};

  if (query.status) {
    filters.status = query.status.toString().trim();
  }

  return filters;
}

function parseLimit(limitValue) {
  if (!limitValue) return 0;

  const parsed = Number.parseInt(limitValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;

  return parsed;
}

function getTmdbConfig() {
  const bearerToken = (
    process.env.TMDB_BEARER_TOKEN ||
    process.env.TMDB_READ_ACCESS_TOKEN ||
    process.env.TMDB_ACCESS_TOKEN ||
    ""
  ).toString().trim();

  const apiKey = (
    process.env.TMDB_API_KEY ||
    process.env.TMDB_KEY ||
    ""
  ).toString().trim();

  return {
    bearerToken,
    apiKey
  };
}

async function requestTmdb(pathname, params = {}) {
  const { bearerToken, apiKey } = getTmdbConfig();

  if (!bearerToken && !apiKey) {
    return null;
  }

  const headers = {};
  const queryParams = { ...params };

  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  } else {
    queryParams.api_key = apiKey;
  }

  const response = await axios.get(`${TMDB_BASE_URL}${pathname}`, {
    headers,
    params: queryParams,
    timeout: 12000
  });

  return response.data || null;
}

function getMovieReleaseYear(movie) {
  const releaseDate = (movie?.releaseDate || "").toString().trim();
  if (!releaseDate) return "";
  return releaseDate.slice(0, 4);
}

async function findTmdbMovieId(movie) {
  if (!movie) return "";

  const imdbId = (movie.imdbId || "").toString().trim();
  if (imdbId) {
    const findResponse = await requestTmdb(`/find/${encodeURIComponent(imdbId)}`, {
      external_source: "imdb_id"
    });

    const match = Array.isArray(findResponse?.movie_results)
      ? findResponse.movie_results[0]
      : null;

    if (match?.id) {
      return String(match.id);
    }
  }

  const movieName = (movie.name || "").toString().trim();
  if (!movieName) return "";

  const searchResponse = await requestTmdb("/search/movie", {
    query: movieName,
    year: getMovieReleaseYear(movie) || undefined,
    include_adult: false
  });

  const match = Array.isArray(searchResponse?.results)
    ? searchResponse.results[0]
    : null;

  return match?.id ? String(match.id) : "";
}

function scoreTrailer(video) {
  if (!video) return -1;

  let score = 0;

  if (video.site === "YouTube") score += 100;
  if (video.site === "Vimeo") score += 60;
  if (video.type === "Trailer") score += 40;
  if (video.official) score += 20;

  const publishedAt = Date.parse(video.published_at || "");
  if (Number.isFinite(publishedAt)) {
    score += publishedAt / 1_000_000_000_000;
  }

  return score;
}

function buildTrailerPayload(video) {
  if (!video?.key || !video?.site) return null;

  if (video.site === "YouTube") {
    const key = String(video.key).trim();
    return {
      site: video.site,
      type: video.type || "",
      name: video.name || "",
      official: Boolean(video.official),
      watchUrl: `https://www.youtube.com/watch?v=${key}`,
      embedUrl: `https://www.youtube.com/embed/${key}?autoplay=1&mute=1&controls=0&loop=1&playlist=${key}&modestbranding=1&rel=0&playsinline=1`
    };
  }

  if (video.site === "Vimeo") {
    const key = String(video.key).trim();
    return {
      site: video.site,
      type: video.type || "",
      name: video.name || "",
      official: Boolean(video.official),
      watchUrl: `https://vimeo.com/${key}`,
      embedUrl: `https://player.vimeo.com/video/${key}?autoplay=1&muted=1&loop=1&title=0&byline=0&portrait=0`
    };
  }

  return {
    site: video.site,
    type: video.type || "",
    name: video.name || "",
    official: Boolean(video.official),
    watchUrl: "",
    embedUrl: ""
  };
}

async function fetchMovieTrailer(movie) {
  try {
    const tmdbMovieId = await findTmdbMovieId(movie);
    if (!tmdbMovieId) return null;

    const videosResponse = await requestTmdb(`/movie/${encodeURIComponent(tmdbMovieId)}/videos`, {
      language: "en-US"
    });

    const videos = Array.isArray(videosResponse?.results) ? videosResponse.results : [];
    const selectedVideo = [...videos]
      .filter((video) => ["Trailer", "Teaser"].includes(video.type))
      .filter((video) => ["YouTube", "Vimeo"].includes(video.site))
      .sort((a, b) => scoreTrailer(b) - scoreTrailer(a))[0];

    return buildTrailerPayload(selectedVideo);
  } catch (error) {
    console.error("Error fetching TMDB trailer:", error.response?.data || error.message);
    return null;
  }
}

function formatApiDateParts(dateValue, now) {
  const date = new Date(dateValue);
  const isoDate = date.toISOString().slice(0, 10);

  const dayNumber = date.toLocaleDateString("en-GB", { day: "2-digit" });
  const monthShort = date.toLocaleDateString("en-GB", { month: "short" });
  const weekdayShort = date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase();

  const startOfInput = new Date(date);
  startOfInput.setHours(0, 0, 0, 0);
  const startOfNow = new Date(now);
  startOfNow.setHours(0, 0, 0, 0);

  const diffDays = Math.round((startOfInput - startOfNow) / 86_400_000);
  let relativeLabel = weekdayShort;
  if (diffDays === 0) relativeLabel = "TODAY";
  if (diffDays === 1) relativeLabel = "TOMORROW";

  return {
    isoDate,
    dayNumber,
    monthShort,
    weekdayShort,
    relativeLabel,
    fullDate: date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    })
  };
}

async function buildMovieShowtimes(movieId) {
  if (!movieId) return [];

  await updateScreeningStatuses();

  const collectionScreening = getCollectionScreening();
  const collectionHall = getCollectionHall();
  const now = new Date();
  const maxDate = new Date(now);
  maxDate.setMonth(maxDate.getMonth() + 3);

  const screenings = await collectionScreening.find({
    movieId: new ObjectId(movieId),
    startDateTime: {
      $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
      $lte: maxDate
    },
    status: { $in: ["scheduled", "ongoing", "paused"] }
  }).sort({ startDateTime: 1 }).toArray();

  const hallIds = [...new Set(screenings.map((screening) => screening.hallId.toString()))];
  const halls = await collectionHall.find({
    _id: { $in: hallIds.map((id) => new ObjectId(id)) }
  }).project({
    name: 1,
    type: 1,
    status: 1,
    maintenanceStartDate: 1,
    maintenanceEndDate: 1
  }).toArray();

  const hallMap = new Map(
    halls.map((hall) => [
      hall._id.toString(),
      hall
    ])
  );

  const visibleScreenings = screenings.filter((screening) => {
    const hall = hallMap.get((screening.hallId || "").toString()) || null;
    const evaluation = evaluateScreeningBookability({
      screening,
      hall,
      now
    });
    return evaluation.bookable;
  });
  if (!visibleScreenings.length) return [];

  const groupedByDate = new Map();

  visibleScreenings.forEach((screening) => {
    const dateParts = formatApiDateParts(screening.startDateTime, now);
    const hallInfo = screening.hallSnapshot
      ? {
          name: screening.hallSnapshot.hallName || "Unknown Hall",
          type: screening.hallSnapshot.hallType || "Standard"
        }
      : ((() => {
          const hall = hallMap.get(screening.hallId.toString());
          if (!hall) return null;
          return {
            name: hall.name || "Unknown Hall",
            type: hall.type || "Standard"
          };
        })() || {
          name: "Unknown Hall",
          type: "Standard"
        });

    if (!groupedByDate.has(dateParts.isoDate)) {
      groupedByDate.set(dateParts.isoDate, {
        ...dateParts,
        halls: new Map()
      });
    }

    const dayEntry = groupedByDate.get(dateParts.isoDate);
    if (!dayEntry.halls.has(hallInfo.name)) {
      dayEntry.halls.set(hallInfo.name, {
        hallName: hallInfo.name,
        hallTypeGroups: new Map()
      });
    }

    const hallEntry = dayEntry.halls.get(hallInfo.name);
    if (!hallEntry.hallTypeGroups.has(hallInfo.type)) {
      hallEntry.hallTypeGroups.set(hallInfo.type, []);
    }

    hallEntry.hallTypeGroups.get(hallInfo.type).push({
      screeningId: screening._id.toString(),
      time: new Date(screening.startDateTime).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }),
      price: screening.price,
      status: screening.status || "scheduled"
    });
  });

  return [...groupedByDate.values()]
    .map((dayEntry) => ({
      isoDate: dayEntry.isoDate,
      dayNumber: dayEntry.dayNumber,
      monthShort: dayEntry.monthShort,
      weekdayShort: dayEntry.weekdayShort,
      relativeLabel: dayEntry.relativeLabel,
      fullDate: dayEntry.fullDate,
      halls: [...dayEntry.halls.values()].map((hallEntry) => ({
        hallName: hallEntry.hallName,
        hallTypeGroups: [...hallEntry.hallTypeGroups.entries()].map(([hallType, showtimes]) => ({
          hallType,
          showtimes: showtimes.sort((a, b) => a.time.localeCompare(b.time))
        }))
      }))
    }));
}

async function listMovies(req, res) {
  try {
    await initDBIfNecessary();

    const filters = buildMovieFilters(req.query);
    const limit = parseLimit(req.query.limit);
    const collectionMovie = getCollectionMovie();

    let cursor = collectionMovie.find(filters).sort({
      releaseDate: -1,
      created: -1,
      _id: -1
    });

    if (limit > 0) {
      cursor = cursor.limit(limit);
    }

    const items = (await cursor.toArray()).map(serializeMovie);

    return res.json({
      items,
      total: items.length
    });
  } catch (error) {
    console.error("Error listing movies via API:", error);
    return res.status(500).json({ error: "Failed to fetch movies" });
  }
}

async function getMovieById(req, res) {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid movie ID" });
    }

    await initDBIfNecessary();
    const collectionMovie = getCollectionMovie();
    const item = await collectionMovie.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ error: "Movie not found" });
    }

    const serializedMovie = serializeMovie(item);
    const [trailer, showtimes] = await Promise.all([
      fetchMovieTrailer(item),
      buildMovieShowtimes(id)
    ]);

    return res.json({
      item: {
        ...serializedMovie,
        trailer,
        showtimes
      }
    });
  } catch (error) {
    console.error("Error fetching movie via API:", error);
    return res.status(500).json({ error: "Failed to fetch movie" });
  }
}

module.exports = {
  listMovies,
  getMovieById
};

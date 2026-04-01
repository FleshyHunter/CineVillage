import { useEffect, useMemo, useState } from "react";
import CardRail from "../components/CardRail";
import ElementCard from "../components/ElementCard";
import ShowcaseCard from "../components/ShowcaseCard";
import ViewportSection from "../components/ViewportSection";
import {
  fetchMovies,
  fetchTmdbShowcaseImageUrlByTitle,
  resolveMoviePictureUrl
} from "../services/api";
import "./Home.css";

const SHOWCASE_SLOT_CLASSES = [
  "showcase-card showcase-card-main",
  "showcase-card showcase-card-side"
];

function toMovieTimestamp(movie) {
  const releaseTimestamp = Date.parse(movie.releaseDate || "");
  if (Number.isFinite(releaseTimestamp)) return releaseTimestamp;

  const createdTimestamp = Date.parse(movie.created || "");
  if (Number.isFinite(createdTimestamp)) return createdTimestamp;

  return 0;
}

function compareNewestFirst(a, b) {
  return toMovieTimestamp(b) - toMovieTimestamp(a);
}

function compareSoonestFirst(a, b) {
  return toMovieTimestamp(a) - toMovieTimestamp(b);
}

function isNowShowing(movie) {
  return (movie?.status || "").toString().trim().toLowerCase() === "now showing";
}

function mapMovieToCard(movie, defaultBadge = "Movie") {
  const durationText = movie.duration ? `${movie.duration} mins` : "N/A";
  const ratingValue = (movie.ageRestriction || "NR").toString().trim() || "NR";

  return {
    _id: movie._id,
    title: movie.name || "Untitled Movie",
    badge: movie.status || defaultBadge,
    image: resolveMoviePictureUrl(movie.pictureUrl),
    durationText,
    ratingText: ratingValue,
    description: (movie.description || "").toString().trim()
  };
}

function buildShowcaseItems(movies, tmdbPosterByMovieId = {}) {
  const fallbackItems = [
    {
      title: "CineVillage",
      label: "Featured Release",
      image: resolveMoviePictureUrl("")
    },
    {
      title: "Book Your Seats",
      label: "Now Showing",
      image: resolveMoviePictureUrl("")
    }
  ];

  const selected = [...movies]
    .slice(0, 2)
    .map((movie, index) => ({
      title: movie.name || "Untitled Movie",
      label:
        index === 1
          ? "Get Tickets"
          : movie.status || "Featured Release",
      image: tmdbPosterByMovieId[movie._id] || resolveMoviePictureUrl(movie.pictureUrl)
    }));

  return fallbackItems.map((fallbackItem, index) => selected[index] || fallbackItem);
}

function buildMovieSections(movies) {
  const nowShowing = [...movies]
    .filter((movie) => isNowShowing(movie))
    .sort(compareNewestFirst);

  const advanceSales = [...movies]
    .filter((movie) => movie.status === "Advance Sales")
    .sort(compareSoonestFirst);

  const comingSoon = [...movies]
    .filter((movie) => movie.status === "Coming Soon")
    .sort(compareSoonestFirst);

  return [
    {
      title: "Now Showing",
      movies: nowShowing.map((movie) => mapMovieToCard(movie, "Now Showing"))
    },
    {
      title: "Advance Sales",
      movies: advanceSales.map((movie) => mapMovieToCard(movie, "Advance Sales"))
    },
    {
      title: "Coming Soon",
      movies: comingSoon.map((movie) => mapMovieToCard(movie, "Coming Soon"))
    }
  ];
}

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tmdbPosterByMovieId, setTmdbPosterByMovieId] = useState({});

  useEffect(() => {
    let isActive = true;

    async function loadMovies() {
      try {
        setLoading(true);
        setError("");
        const movieItems = await fetchMovies();
        if (!isActive) return;
        setMovies(Array.isArray(movieItems) ? movieItems : []);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || "Failed to load movies");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadMovies();

    return () => {
      isActive = false;
    };
  }, []);

  const nowShowingForShowcase = useMemo(
    () => [...movies].filter((movie) => isNowShowing(movie)).sort(compareNewestFirst).slice(0, 2),
    [movies]
  );

  useEffect(() => {
    let isActive = true;

    async function loadShowcaseTmdbPosters() {
      if (!nowShowingForShowcase.length) {
        setTmdbPosterByMovieId({});
        return;
      }

      const posterEntries = await Promise.all(
        nowShowingForShowcase.map(async (movie, index) => {
          const movieId = (movie?._id || "").toString().trim();
          if (!movieId) return null;

          const tmdbPosterUrl = await fetchTmdbShowcaseImageUrlByTitle({
            title: movie?.name || "",
            releaseDate: movie?.releaseDate || "",
            imageType: index === 0 ? "backdrop" : "poster"
          });

          if (!tmdbPosterUrl) return null;
          return [movieId, tmdbPosterUrl];
        })
      );

      if (!isActive) return;

      const nextMap = {};
      posterEntries.forEach((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) return;
        const [movieId, posterUrl] = entry;
        nextMap[movieId] = posterUrl;
      });

      setTmdbPosterByMovieId(nextMap);
    }

    loadShowcaseTmdbPosters();
    return () => {
      isActive = false;
    };
  }, [nowShowingForShowcase]);

  const showcaseItems = buildShowcaseItems(nowShowingForShowcase, tmdbPosterByMovieId);
  const sections = buildMovieSections(movies);

  return (
    <div className="home-page">
      <section className="home-showcase">
        <div className="showcase-primary-grid">
          <ShowcaseCard item={showcaseItems[0]} className={SHOWCASE_SLOT_CLASSES[0]} />
          <ShowcaseCard item={showcaseItems[1]} className={SHOWCASE_SLOT_CLASSES[1]} />
        </div>
      </section>

      {loading ? (
        <section className="home-status-panel">
          <p>Loading movies...</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="home-status-panel home-status-panel-error">
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error ? sections.map((section, index) => (
        <ViewportSection
          key={section.title}
          className="movie-rail-section fade-in-panel"
          style={{ "--fade-delay": `${0.14 + index * 0.1}s` }}
          estimatedHeight={395}
        >
          <div className="rail-heading">
            <h2>{section.title}</h2>
          </div>

          {section.movies.length > 0 ? (
            <CardRail label={section.title}>
              {section.movies.map((movie) => (
                <ElementCard key={`${section.title}-${movie._id || movie.title}`} movie={movie} />
              ))}
            </CardRail>
          ) : (
            <div className="empty-rail-state">
              No movies available in this section yet.
            </div>
          )}
        </ViewportSection>
      )) : null}
    </div>
  );
}

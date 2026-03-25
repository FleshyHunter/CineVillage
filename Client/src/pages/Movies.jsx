import { useEffect, useMemo, useState } from "react";
import MovieCard from "../components/MovieCard";
import { fetchMovies, resolveMoviePictureUrl } from "../services/api";
import "./Movies.css";

const FILTERS = [
  { key: "all", label: "All", icon: "bi-grid-3x3-gap" },
  { key: "Now Showing", label: "Now Showing", icon: "bi-play-circle" },
  { key: "Advance Sales", label: "Advance Sales", icon: "bi-ticket-perforated" },
  { key: "Coming Soon", label: "Coming Soon", icon: "bi-clock-history" }
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

function buildDurationText(movie) {
  return movie.duration ? `${movie.duration} mins` : "N/A";
}

function buildRatingText(movie) {
  const value = (movie.ageRestriction || "NR").toString().trim();
  return value || "NR";
}

function buildMovieDescription(movie) {
  const trimmed = (movie.description || "").toString().trim();
  return trimmed || "No description available for this movie yet.";
}

function mapMovieToCard(movie) {
  return {
    _id: movie._id,
    title: movie.name || "Untitled Movie",
    badge: movie.status || "Movie",
    image: resolveMoviePictureUrl(movie.pictureUrl),
    durationText: buildDurationText(movie),
    ratingText: buildRatingText(movie),
    description: buildMovieDescription(movie)
  };
}

function getFilteredMovies(movies, activeFilter) {
  const sorted = [...movies].sort(compareNewestFirst);

  if (activeFilter === "all") {
    return sorted;
  }

  return sorted.filter((movie) => movie.status === activeFilter);
}

export default function Movies() {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    let isActive = true;

    async function loadMovies() {
      try {
        setLoading(true);
        setError("");
        const items = await fetchMovies();
        if (!isActive) return;
        setMovies(items);
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

  const filteredMovies = useMemo(
    () => getFilteredMovies(movies, activeFilter),
    [movies, activeFilter]
  );
  const visibleMovies = useMemo(() => filteredMovies.slice(0, 20), [filteredMovies]);

  return (
    <div className="movies-page">
      <nav className="movies-breadcrumbs" aria-label="Breadcrumb">
        <a href="#">Home</a>
        <span aria-hidden="true">›</span>
        <strong>Movies</strong>
      </nav>

      <header className="movies-page-header">
        <h1>Movies</h1>
      </header>

      <div className="movies-filter-bar" role="tablist" aria-label="Movie status filters">
        {FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter.key}
            className={`movies-filter-btn${activeFilter === filter.key ? " is-active" : ""}`}
            onClick={() => setActiveFilter(filter.key)}
          >
            <i className={`bi ${filter.icon}`} aria-hidden="true" />
            {filter.label}
          </button>
        ))}
      </div>

      {loading ? (
        <section className="movies-status-panel">
          <p>Loading movies...</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="movies-status-panel movies-status-panel-error">
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="movies-list" aria-live="polite">
          {visibleMovies.length > 0 ? (
            visibleMovies.map((movie) => {
              const cardMovie = mapMovieToCard(movie);

              return (
                <div key={movie._id || movie.name} className="movies-grid-card">
                  <MovieCard movie={cardMovie} />
                </div>
              );
            })
          ) : (
            <div className="movies-empty-state">
              No movies available in this category yet.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

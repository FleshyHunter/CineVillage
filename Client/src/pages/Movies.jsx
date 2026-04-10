import { useEffect, useMemo, useState } from "react";
import ElementCard from "../components/ElementCard";
import { fetchMovies, resolveMoviePictureUrl } from "../services/api";
import "./Movies.css";

const STATUS_FILTERS = [
  { key: "Now Showing", label: "Now Showing", icon: "bi-play-circle" },
  { key: "Coming Soon", label: "Coming Soon", icon: "bi-clock-history" },
  { key: "Advance Sales", label: "Advance Sales", icon: "bi-ticket-perforated" },
  { key: "Promotions", label: "Promotions", icon: "bi-megaphone" }
];
const HALL_TYPE_SLUGS = new Set(["standard", "imax", "vip"]);
const PAGE_SIZE = 20;

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

function normalizeHallTypeLabel(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "imax") return "IMAX";
  if (normalized === "vip") return "VIP";
  return "Standard";
}

function resolveHallTypeContext(selectedHallType = "") {
  const normalizedSlug = (selectedHallType || "").toString().trim().toLowerCase();
  if (!HALL_TYPE_SLUGS.has(normalizedSlug)) {
    return { slug: "standard", label: "Standard" };
  }
  if (normalizedSlug === "imax") return { slug: "imax", label: "IMAX" };
  if (normalizedSlug === "vip") return { slug: "vip", label: "VIP" };
  return { slug: "standard", label: "Standard" };
}

function getMovieHallTypeCandidates(movie = {}) {
  const candidates = [];
  const pushIfPresent = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach((item) => pushIfPresent(item));
      return;
    }
    const text = value.toString().trim();
    if (!text) return;
    candidates.push(normalizeHallTypeLabel(text));
  };

  pushIfPresent(movie.hallType);
  pushIfPresent(movie.hallTypes);
  pushIfPresent(movie.type);
  pushIfPresent(movie.format);
  pushIfPresent(movie.hall?.type);

  return [...new Set(candidates)];
}

function movieMatchesHallType(movie, targetHallTypeLabel) {
  const candidates = getMovieHallTypeCandidates(movie);
  if (!candidates.length) {
    return targetHallTypeLabel === "Standard";
  }
  return candidates.includes(targetHallTypeLabel);
}

function getFilteredMovies(movies, activeFilter, hallTypeLabel) {
  const sorted = [...movies].sort(compareNewestFirst);
  if (activeFilter === "Promotions") return [];

  return sorted.filter((movie) => {
    const movieStatus = (movie.status || "").toString().trim().toLowerCase();
    const targetStatus = activeFilter.toLowerCase();
    return movieStatus === targetStatus && movieMatchesHallType(movie, hallTypeLabel);
  });
}

export default function Movies({ selectedHallType = "" }) {
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("Now Showing");
  const [currentPage, setCurrentPage] = useState(1);

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

  const hallTypeContext = useMemo(
    () => resolveHallTypeContext(selectedHallType),
    [selectedHallType]
  );

  const filteredMovies = useMemo(
    () => getFilteredMovies(movies, activeFilter, hallTypeContext.label),
    [movies, activeFilter, hallTypeContext.label]
  );
  const totalPages = Math.max(1, Math.ceil(filteredMovies.length / PAGE_SIZE));
  const visibleMovies = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredMovies.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredMovies]);
  const isPromotionsFilter = activeFilter === "Promotions";

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, hallTypeContext.slug]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  return (
    <div className="movies-page">
      <nav className="movies-breadcrumbs" aria-label="Breadcrumb">
        <a href="#">Home</a>
        <span aria-hidden="true">›</span>
        <a href="#movies">Movies</a>
        <span aria-hidden="true">›</span>
        <strong>{`View ${hallTypeContext.label}`}</strong>
      </nav>

      <header className="movies-page-header">
        <h1>{`View ${hallTypeContext.label}`}</h1>
      </header>

      <div className="movies-filter-bar" role="tablist" aria-label="Movie status filters">
        {STATUS_FILTERS.map((filter) => (
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

      {!loading && !error && isPromotionsFilter ? (
        <section className="movies-status-panel">
          <p>Promotions cards are on hold for now.</p>
        </section>
      ) : null}

      {!loading && !error && !isPromotionsFilter ? (
        <>
          <section className="movies-list" aria-live="polite">
            {visibleMovies.length > 0 ? (
              visibleMovies.map((movie) => {
                const cardMovie = mapMovieToCard(movie);

                return (
                  <div key={movie._id || movie.name} className="movies-grid-card">
                    <ElementCard movie={cardMovie} />
                  </div>
                );
              })
            ) : (
              <div className="movies-empty-state">
                No movies available in this category yet.
              </div>
            )}
          </section>

          {filteredMovies.length > 0 ? (
            <div className="movies-pagination">
              <button
                type="button"
                className="movies-pagination-btn"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>

              <span className="movies-pagination-label">
                Page {currentPage} of {totalPages}
              </span>

              <button
                type="button"
                className="movies-pagination-btn"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

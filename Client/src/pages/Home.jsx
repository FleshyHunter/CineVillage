import { useEffect, useState } from "react";
import CardRail from "../components/CardRail";
import MovieCard from "../components/MovieCard";
import ShowcaseCard from "../components/ShowcaseCard";
import ViewportSection from "../components/ViewportSection";
import { fetchMovies, resolveMoviePictureUrl } from "../services/api";
import "./Home.css";

const SHOWCASE_SLOT_CLASSES = [
  "showcase-card showcase-card-main",
  "showcase-card showcase-card-side",
  "showcase-card showcase-card-strip",
  "showcase-card showcase-card-promo"
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

function buildShowcaseItems(movies) {
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
    },
    {
      title: "Dining Promos",
      label: "Cinema Offers",
      image: resolveMoviePictureUrl("")
    },
    {
      title: "Coming Soon",
      label: "Upcoming Release",
      image: resolveMoviePictureUrl("")
    }
  ];

  const selected = [...movies]
    .filter((movie) => movie.pictureUrl)
    .sort(compareNewestFirst)
    .slice(0, 4)
    .map((movie, index) => ({
      title: movie.name || "Untitled Movie",
      label:
        index === 1
          ? "Get Tickets"
          : movie.status || "Featured Release",
      image: resolveMoviePictureUrl(movie.pictureUrl)
    }));

  return fallbackItems.map((fallbackItem, index) => selected[index] || fallbackItem);
}

function buildMovieSections(movies) {
  const nowShowing = [...movies]
    .filter((movie) => movie.status === "Now Showing")
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

  const showcaseItems = buildShowcaseItems(movies);
  const sections = buildMovieSections(movies);

  return (
    <div className="home-page">
      <section className="home-showcase">
        <div className="showcase-primary-grid">
          <ShowcaseCard item={showcaseItems[0]} className={SHOWCASE_SLOT_CLASSES[0]} />
          <ShowcaseCard item={showcaseItems[1]} className={SHOWCASE_SLOT_CLASSES[1]} />
        </div>

        <div className="showcase-secondary-grid">
          <ShowcaseCard item={showcaseItems[2]} className={SHOWCASE_SLOT_CLASSES[2]} />
          <ShowcaseCard item={showcaseItems[3]} className={SHOWCASE_SLOT_CLASSES[3]} />
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
                <MovieCard key={`${section.title}-${movie._id || movie.title}`} movie={movie} />
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

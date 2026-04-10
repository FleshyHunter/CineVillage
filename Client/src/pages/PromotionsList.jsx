import { useEffect, useMemo, useState } from "react";
import ElementCard from "../components/ElementCard";
import { fetchPromotions, resolveMoviePictureUrl } from "../services/api";
import "./Movies.css";

const FILTERS = [
  { key: "all", label: "All", icon: "bi-grid-3x3-gap" }
];

function buildPromotionCard(promotion = {}) {
  const title = (promotion.name || "Promotion").toString().trim();
  const badge = (promotion.type || "all").toString().replace(/_/g, " ").toUpperCase();
  const description = (promotion.description || "").toString().trim();
  const code = (promotion.code || "").toString().trim();

  return {
    _id: (promotion._id || promotion.id || title).toString(),
    title,
    badge,
    image: resolveMoviePictureUrl(promotion.pictureUrl),
    durationText: code ? `Code: ${code}` : "Promotion",
    ratingText: "CineVillage",
    description: description || "Promotion details available soon.",
    actionLabel: "MORE",
    detailsHref: "#"
  };
}

export default function PromotionsList() {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    let isActive = true;

    async function loadPromotions() {
      try {
        setLoading(true);
        setError("");
        const items = await fetchPromotions();
        if (!isActive) return;
        setPromotions(Array.isArray(items) ? items : []);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError?.message || "Failed to load promotions.");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadPromotions();
    return () => {
      isActive = false;
    };
  }, []);

  const cards = useMemo(
    () => promotions.map(buildPromotionCard),
    [promotions]
  );

  return (
    <div className="movies-page">
      <nav className="movies-breadcrumbs" aria-label="Breadcrumb">
        <a href="#">Home</a>
        <span aria-hidden="true">›</span>
        <strong>Promotions</strong>
      </nav>

      <header className="movies-page-header">
        <h1>Promotions</h1>
      </header>

      <div className="movies-filter-bar" role="tablist" aria-label="Promotions filters">
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
          <p>Loading promotions...</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="movies-status-panel movies-status-panel-error">
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="movies-list" aria-live="polite">
          {cards.length > 0 ? (
            cards.map((promotion) => (
              <div key={promotion._id} className="movies-grid-card">
                <ElementCard movie={promotion} />
              </div>
            ))
          ) : (
            <div className="movies-empty-state">
              No promotions available yet.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

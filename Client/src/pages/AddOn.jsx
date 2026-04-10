import { useEffect, useMemo, useState } from "react";
import ElementCard from "../components/ElementCard";
import { fetchAddOns, resolveMoviePictureUrl } from "../services/api";
import "./Movies.css";

const FILTERS = [
  { key: "all", label: "All", icon: "bi-grid-3x3-gap" },
  { key: "ala_carte", label: "Ala carte", icon: "bi-cup-straw" },
  { key: "combo", label: "Combo", icon: "bi-basket" }
];

function normalizeAddOnType(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === "combo") return "combo";
  return "ala_carte";
}

function formatPrice(price) {
  const amount = Number(price);
  const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
  return `SGD ${safeAmount.toFixed(2)}`;
}

function buildAddOnCard(addOn = {}) {
  const title = (addOn.name || "Add-on").toString().trim();
  const type = normalizeAddOnType(addOn.type);
  const badge = type === "combo" ? "COMBO" : "ALA CARTE";
  const description = (addOn.description || "").toString().trim();

  return {
    _id: (addOn._id || addOn.id || title).toString(),
    title,
    badge,
    image: resolveMoviePictureUrl(addOn.pictureUrl),
    durationText: formatPrice(addOn.price),
    ratingText: "CineVillage",
    description: description || "Add-on details available soon.",
    actionLabel: "MORE",
    detailsHref: "#",
    type
  };
}

export default function AddOn() {
  const [addOns, setAddOns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  useEffect(() => {
    let isActive = true;

    async function loadAddOns() {
      try {
        setLoading(true);
        setError("");
        const items = await fetchAddOns();
        if (!isActive) return;
        setAddOns(Array.isArray(items) ? items : []);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError?.message || "Failed to load add-ons.");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadAddOns();
    return () => {
      isActive = false;
    };
  }, []);

  const cards = useMemo(
    () => addOns.map(buildAddOnCard),
    [addOns]
  );

  const filteredCards = useMemo(() => {
    if (activeFilter === "all") return cards;
    return cards.filter((card) => card.type === activeFilter);
  }, [activeFilter, cards]);

  return (
    <div className="movies-page">
      <nav className="movies-breadcrumbs" aria-label="Breadcrumb">
        <a href="#">Home</a>
        <span aria-hidden="true">›</span>
        <strong>Add Ons</strong>
      </nav>

      <header className="movies-page-header">
        <h1>Add Ons</h1>
      </header>

      <div className="movies-filter-bar" role="tablist" aria-label="Add-ons filters">
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
          <p>Loading add-ons...</p>
        </section>
      ) : null}

      {!loading && error ? (
        <section className="movies-status-panel movies-status-panel-error">
          <p>{error}</p>
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="movies-list" aria-live="polite">
          {filteredCards.length > 0 ? (
            filteredCards.map((addOn) => (
              <div key={addOn._id} className="movies-grid-card">
                <ElementCard movie={addOn} />
              </div>
            ))
          ) : (
            <div className="movies-empty-state">
              No add-ons available in this category yet.
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

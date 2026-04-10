import { useEffect, useMemo, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { useAccount } from "../context/AccountContext";
import "./Tickets.css";

const FILTERS = [
  { key: "All", label: "All", icon: "bi-grid-3x3-gap" },
  { key: "Standard", label: "Standard", icon: "bi-ticket" },
  { key: "IMAX", label: "IMAX", icon: "bi-badge-4k" },
  { key: "VIP", label: "VIP", icon: "bi-star" }
];
const SORT_OPTIONS = [
  { key: "purchase_desc", label: "Bought: Newest First" },
  { key: "purchase_asc", label: "Bought: Oldest First" },
  { key: "screening_asc", label: "Screening: Earliest First" },
  { key: "screening_desc", label: "Screening: Latest First" }
];
const PAGE_SIZE = 10;

function parseDateAndTime(dateValue, timeValue) {
  const rawDate = (dateValue || "").toString().trim();
  const rawTime = (timeValue || "").toString().trim();
  if (!rawDate) return Number.NaN;

  if (rawDate.includes("T")) {
    const direct = new Date(rawDate);
    return direct.getTime();
  }

  const normalizedTime = rawTime || "00:00";
  const isoLike = `${rawDate}T${normalizedTime}`;
  const parsed = new Date(isoLike);
  return parsed.getTime();
}

function getPurchaseTimestamp(booking = {}) {
  const fromDateTime = parseDateAndTime(booking.purchaseDateTime, "");
  if (Number.isFinite(fromDateTime)) return fromDateTime;

  const fromParts = parseDateAndTime(booking.purchaseDate, booking.purchaseTime);
  if (Number.isFinite(fromParts)) return fromParts;

  return Number.NaN;
}

function getScreeningTimestamp(booking = {}) {
  const fromParts = parseDateAndTime(booking.date, booking.time);
  if (Number.isFinite(fromParts)) return fromParts;
  return Number.NaN;
}

function compareTimestamp(a, b, direction = "desc") {
  const safeA = Number.isFinite(a) ? a : (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  const safeB = Number.isFinite(b) ? b : (direction === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY);
  return direction === "asc" ? safeA - safeB : safeB - safeA;
}

function formatDateLabel(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTimeLabel(value) {
  if (!value) return "N/A";
  return value;
}

export default function Tickets() {
  const { bookings, isAuthenticated, isLoadingBookings, bookingsError, refreshBookings } = useAccount();
  const [activeFilter, setActiveFilter] = useState("All");
  const [sortKey, setSortKey] = useState("purchase_desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let isActive = true;
    let isSyncing = false;

    async function runSync({ silent = false } = {}) {
      if (!isActive || isSyncing) return;
      isSyncing = true;
      if (!silent) setIsAutoSyncing(true);

      try {
        await refreshBookings({ silent });
      } finally {
        isSyncing = false;
        if (isActive && !silent) setIsAutoSyncing(false);
      }
    }

    runSync();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runSync({ silent: true });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isActive = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, refreshBookings]);

  const visibleBookings = useMemo(() => {
    const filtered = activeFilter === "All"
      ? bookings
      : bookings.filter((booking) => (booking.hallType || "").toUpperCase() === activeFilter.toUpperCase());

    const sortable = [...filtered];
    if (sortKey === "purchase_asc") {
      sortable.sort((a, b) => compareTimestamp(getPurchaseTimestamp(a), getPurchaseTimestamp(b), "asc"));
      return sortable;
    }

    if (sortKey === "screening_asc") {
      sortable.sort((a, b) => compareTimestamp(getScreeningTimestamp(a), getScreeningTimestamp(b), "asc"));
      return sortable;
    }

    if (sortKey === "screening_desc") {
      sortable.sort((a, b) => compareTimestamp(getScreeningTimestamp(a), getScreeningTimestamp(b), "desc"));
      return sortable;
    }

    sortable.sort((a, b) => compareTimestamp(getPurchaseTimestamp(a), getPurchaseTimestamp(b), "desc"));
    return sortable;
  }, [activeFilter, bookings, sortKey]);

  const totalPages = Math.max(1, Math.ceil(visibleBookings.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, sortKey]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pagedBookings = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleBookings.slice(start, start + PAGE_SIZE);
  }, [currentPage, visibleBookings]);

  return (
    <section className="my-tickets-page">
      <div className="my-tickets-header">
        <h2>My Tickets</h2>
      </div>

      <div className="my-tickets-controls">
        <div className="movies-filter-bar my-tickets-filters" role="tablist" aria-label="Ticket type filters">
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

        <div className="my-tickets-right-controls">
          <div className="my-tickets-sort-row">
            <label htmlFor="ticketsSortSelect">Sort By</label>
            <select
              id="ticketsSortSelect"
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <SeatSelectionButton variant="secondary" onClick={() => refreshBookings()}>
            {isAutoSyncing ? "SYNCING..." : "REFRESH"}
          </SeatSelectionButton>
        </div>
      </div>

      {isLoadingBookings ? (
        <div className="my-tickets-status">Loading bookings...</div>
      ) : bookingsError ? (
        <div className="my-tickets-status my-tickets-status-error">{bookingsError}</div>
      ) : (
        <div className="my-tickets-table-wrap">
          <table className="my-tickets-table">
            <thead>
              <tr>
                <th>Date of Purchase</th>
                <th>Time of Purchase</th>
                <th>Movie Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pagedBookings.length ? (
                pagedBookings.map((booking) => (
                  <tr key={booking.id}>
                    <td>{formatDateLabel(booking.purchaseDate || booking.purchaseDateTime)}</td>
                    <td>{formatTimeLabel(booking.purchaseTime)}</td>
                    <td>{booking.movieName || "N/A"}</td>
                    <td>
                      <span className={`my-ticket-status my-ticket-status-${booking.status || "incomplete"}`}>
                        {(booking.status || "incomplete").toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <SeatSelectionButton
                        variant="secondary"
                        onClick={() => { window.location.hash = `#ticket/${booking.id}`; }}
                      >
                        VIEW
                      </SeatSelectionButton>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>
                    <div className="my-tickets-empty">No bookings found for this filter.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isLoadingBookings && !bookingsError && visibleBookings.length > 0 ? (
        <div className="my-tickets-pagination">
          <button
            type="button"
            className="my-tickets-pagination-btn"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            disabled={currentPage === 1}
          >
            Prev
          </button>

          <span className="my-tickets-pagination-label">
            Page {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            className="my-tickets-pagination-btn"
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

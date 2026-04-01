import { useMemo, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { useAccount } from "../context/AccountContext";
import "./Tickets.css";

const FILTERS = [
  { key: "All", label: "All", icon: "bi-grid-3x3-gap" },
  { key: "Standard", label: "Standard", icon: "bi-ticket" },
  { key: "IMAX", label: "IMAX", icon: "bi-badge-4k" },
  { key: "VIP", label: "VIP", icon: "bi-star" }
];

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
  const { bookings, isLoadingBookings, bookingsError, refreshBookings } = useAccount();
  const [activeFilter, setActiveFilter] = useState("All");

  const visibleBookings = useMemo(() => {
    if (activeFilter === "All") return bookings;
    return bookings.filter((booking) => (booking.hallType || "").toUpperCase() === activeFilter.toUpperCase());
  }, [activeFilter, bookings]);

  return (
    <section className="my-tickets-page">
      <div className="my-tickets-header">
        <h2>My Tickets</h2>
        <SeatSelectionButton variant="secondary" onClick={refreshBookings}>
          REFRESH
        </SeatSelectionButton>
      </div>

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
              {visibleBookings.length ? (
                visibleBookings.map((booking) => (
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
    </section>
  );
}

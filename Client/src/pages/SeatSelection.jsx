import { useEffect, useMemo, useState } from "react";
import {
  fetchMovieById,
  fetchScreeningSeatPreview,
  resolveMoviePictureUrl
} from "../services/api";
import "./SeatSelection.css";

function formatDuration(duration) {
  const minutes = Number.parseInt(duration, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return "N/A";

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) return `${minutes} mins`;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} mins`;
}

function formatScreeningDate(dateValue) {
  if (!dateValue) return "N/A";

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });
}

function getAdvisoryText(ageRestriction) {
  const advisoryByAge = {
    G: "Suitable for General Audiences",
    PG: "Parental Guidance Advised",
    PG13: "Some Coarse Language",
    NC16: "Violence and Mature Themes",
    M18: "Mature Content",
    R21: "Restricted to Adults"
  };

  return advisoryByAge[ageRestriction] || "Viewer discretion advised";
}

function getAisleColumns(hall) {
  return new Set(
    (hall?.aisleColumns || [])
      .map((column) => Number.parseInt(column, 10))
      .filter((column) => Number.isInteger(column) && column >= 0)
  );
}

function shouldInsertWingLaneAfterColumn(column, columns, wingColumns, aisleColumns) {
  if (wingColumns <= 0 || wingColumns >= columns) return false;

  const leftBoundaryColumn = wingColumns - 1;
  const rightBoundaryColumn = columns - wingColumns - 1;
  const nextColumn = column + 1;

  if (column !== leftBoundaryColumn && column !== rightBoundaryColumn) return false;
  if (nextColumn >= columns) return false;
  if (aisleColumns.has(column) || aisleColumns.has(nextColumn)) return false;

  return true;
}

function buildSeatRows(hall, selectedSeats) {
  const rows = Number.parseInt(hall?.rows, 10) || 0;
  const columns = Number.parseInt(hall?.columns, 10) || 0;
  const wingColumns = Number.parseInt(hall?.wingColumns, 10) || 0;
  const seatConfig = hall?.seatConfig || {};
  const aisleColumns = getAisleColumns(hall);

  if (!rows || !columns) return [];

  return Array.from({ length: rows }, (_, rowIndex) => {
    const rowLabel = String.fromCharCode(65 + rowIndex);
    const cells = [];

    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      if (aisleColumns.has(columnIndex)) {
        cells.push({
          key: `lane-${rowIndex}-${columnIndex}`,
          kind: "lane"
        });
      } else {
        const seatState = seatConfig[`${rowIndex}-${columnIndex}`] || "normal";
        const seatKey = `${rowIndex}-${columnIndex}`;

        if (seatState === "removed") {
          cells.push({
            key: `gap-${seatKey}`,
            kind: "gap"
          });

          if (shouldInsertWingLaneAfterColumn(columnIndex, columns, wingColumns, aisleColumns)) {
            cells.push({
              key: `wing-lane-${rowIndex}-${columnIndex}`,
              kind: "lane"
            });
          }

          continue;
        }

        cells.push({
          key: `seat-${seatKey}`,
          kind: "seat",
          seatKey,
          baseState: seatState,
          state: selectedSeats.has(seatKey) ? "selected" : seatState
        });
      }

      if (shouldInsertWingLaneAfterColumn(columnIndex, columns, wingColumns, aisleColumns)) {
        cells.push({
          key: `wing-lane-${rowIndex}-${columnIndex}`,
          kind: "lane"
        });
      }
    }

    return {
      key: `row-${rowIndex}`,
      label: rowLabel,
      cells
    };
  });
}

function buildCountdownParts(targetDate, now) {
  const target = new Date(targetDate);
  if (Number.isNaN(target.getTime())) return ["0", "0", "0", "0", "0", "0"];

  const remainingMs = Math.max(target.getTime() - now.getTime(), 0);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}${String(seconds).padStart(2, "0")}`.split("");
}

function formatSeatLabel(seatKey) {
  const [rowValue, columnValue] = (seatKey || "").split("-");
  const rowIndex = Number.parseInt(rowValue, 10);
  const columnIndex = Number.parseInt(columnValue, 10);

  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return seatKey;

  return `${String.fromCharCode(65 + rowIndex)}${columnIndex + 1}`;
}

function formatCurrency(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "SGD 0.00";

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(numeric);
}

const checkoutSteps = [
  { label: "Seats", icon: "seat", active: true },
  { label: "Promos", icon: "bi bi-ticket-detailed" },
  { label: "Add-ons", icon: "bi bi-basket" },
  { label: "Payment", icon: "bi bi-credit-card-2-front" }
];

export default function SeatSelection({ screeningId = "" }) {
  const MAX_SELECTED_SEATS = 10;
  const [preview, setPreview] = useState(null);
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSeats, setSelectedSeats] = useState(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const [selectionNotice, setSelectionNotice] = useState("");
  const [pendingWheelchairSeat, setPendingWheelchairSeat] = useState(null);

  useEffect(() => {
    if (!screeningId) {
      setError("No screening selected.");
      setLoading(false);
      return undefined;
    }

    let isActive = true;

    async function loadSeatSelection() {
      try {
        setLoading(true);
        setError("");

        const seatPreview = await fetchScreeningSeatPreview(screeningId);
        if (!isActive) return;

        setPreview(seatPreview);

        if (seatPreview?.movie?._id) {
          const movieDetails = await fetchMovieById(seatPreview.movie._id);
          if (!isActive) return;
          setMovie(movieDetails);
        } else {
          setMovie(null);
        }
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || "Failed to load seat selection");
        setPreview(null);
        setMovie(null);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadSeatSelection();

    return () => {
      isActive = false;
    };
  }, [screeningId]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const selectedSeatLabels = useMemo(
    () => [...selectedSeats].map(formatSeatLabel).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [selectedSeats]
  );

  if (loading) {
    return (
      <section className="seat-selection-status">
        <p>Loading seat selection...</p>
      </section>
    );
  }

  if (error || !preview) {
    return (
      <section className="seat-selection-status seat-selection-status-error">
        <p>{error || "Seat selection is unavailable."}</p>
      </section>
    );
  }

  const heroMovie = movie || preview.movie || {};
  const posterUrl = resolveMoviePictureUrl(heroMovie.pictureUrl || heroMovie.posterUrl || "");
  const countdownDigits = buildCountdownParts(preview.startDateTime, now);
  const seatRows = buildSeatRows(preview.hall, selectedSeats);
  const selectedSeatCount = selectedSeats.size;
  const ticketPrice = Number(preview.price) || 0;
  const totalCost = ticketPrice * selectedSeatCount;

  function tryAddSeat(seatKey) {
    let added = false;

    setSelectedSeats((previous) => {
      const next = new Set(previous);

      if (next.size >= MAX_SELECTED_SEATS) {
        return previous;
      }

      if (!next.has(seatKey)) {
        next.add(seatKey);
        added = true;
      }

      return next;
    });

    if (!added) {
      setSelectionNotice(`You can select up to ${MAX_SELECTED_SEATS} seats only.`);
      return false;
    }

    setSelectionNotice("");
    return true;
  }

  function handleSeatToggle(cell) {
    if (!cell?.seatKey || (cell.state !== "normal" && cell.state !== "selected" && cell.baseState !== "wheelchair")) return;

    if (selectedSeats.has(cell.seatKey)) {
      setSelectedSeats((previous) => {
        const next = new Set(previous);
        next.delete(cell.seatKey);
        setSelectionNotice("");
        return next;
      });
      return;
    }

    if (cell.baseState === "wheelchair") {
      setPendingWheelchairSeat(cell);
      return;
    }

    tryAddSeat(cell.seatKey);
  }

  return (
    <section className="seat-selection-page">
      <div
        className="seat-selection-stage"
        style={{ "--seat-selection-hero-image": `url("${posterUrl}")` }}
      >
        <div className="seat-selection-stage-frame">
          <div className="seat-selection-topbar">
            <div className="seat-selection-breadcrumbs">
              <a href={`#movie-details/${heroMovie._id || preview.movie?._id || ""}`}>Movies &amp; Showtimes</a>
              <span><i className="bi bi-chevron-right" /></span>
              <strong>Seat Selection</strong>
            </div>

            <div className="seat-selection-countdown" aria-label="Time remaining">
              {countdownDigits.map((digit, index) => (
                <span key={`${digit}-${index}`} className="seat-selection-countdown-digit">
                  {digit}
                </span>
              ))}
            </div>
          </div>

          <div className="seat-selection-header">
            <h1>{heroMovie.name || "Movie"}</h1>

            <div className="seat-selection-rating-row">
              <span className="seat-selection-rating-chip">{heroMovie.ageRestriction || preview.movie?.ageRestriction || "NR"}</span>
              <span>{getAdvisoryText(heroMovie.ageRestriction || preview.movie?.ageRestriction)}</span>
            </div>

            <div className="seat-selection-screening-pill">
              <span>
                <i className="bi bi-clock" />
                {formatScreeningDate(preview.startDateTime)} {preview.time}
              </span>
              <span>
                <i className="bi bi-building" />
                {preview.hall?.name || "Hall"}
              </span>
              <button
                type="button"
                aria-label="Back to movie details"
                onClick={() => {
                  window.location.hash = `#movie-details/${heroMovie._id || preview.movie?._id || ""}`;
                }}
              >
                <i className="bi bi-chevron-down" />
              </button>
            </div>
          </div>

          <div className="seat-selection-steps">
            {checkoutSteps.map((step, index) => (
              <div key={step.label} className="seat-selection-step-item">
                <div className={`seat-selection-step-icon${step.active ? " is-active" : ""}`}>
                  {step.icon === "seat" ? (
                    <span className="seat-selection-step-seat-glyph" aria-hidden="true">
                      <span className="seat-selection-step-seat-back" />
                      <span className="seat-selection-step-seat-base" />
                    </span>
                  ) : (
                    <i className={step.icon} />
                  )}
                </div>
                <span className={`seat-selection-step-label${step.active ? " is-active" : ""}`}>
                  {step.label}
                </span>
                {index < checkoutSteps.length - 1 ? <span className="seat-selection-step-line" /> : null}
              </div>
            ))}
          </div>

          <div className="seat-selection-map-panel">
            <div className="seat-selection-map-toolbar">
              <div className="seat-selection-map-summary">
                <span>Hall Preview</span>
                <strong>{preview.hall?.type || "Standard"}</strong>
              </div>

              <div className="seat-selection-map-toolbar-actions">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSeats(new Set());
                    setSelectionNotice("");
                  }}
                >
                  Clear Seats
                </button>
              </div>
            </div>

            <div className="seat-selection-map-stage">
              <div className="seat-selection-map-layout">
                <div className="seat-selection-screen-wrap">
                  <div className="seat-selection-screen" />
                  <span>Screen</span>
                </div>

                <div className="seat-selection-grid-shell">
                  <div className="seat-selection-grid-scale" style={{ transform: `scale(${zoom})` }}>
                    <div className="seat-selection-grid">
                      {seatRows.map((row) => (
                        <div key={row.key} className="seat-selection-row">
                          <span className="seat-selection-row-label">{row.label}</span>

                          <div className="seat-selection-row-cells">
                          {row.cells.map((cell) => (
                            cell.kind === "lane" ? (
                              <span key={cell.key} className="seat-selection-lane" aria-hidden="true" />
                            ) : cell.kind === "gap" ? (
                              <span key={cell.key} className="seat-selection-gap" aria-hidden="true" />
                            ) : (
                              <button
                                key={cell.key}
                                type="button"
                                className={`seat-selection-seat seat-selection-seat-${cell.state}`}
                                onClick={() => handleSeatToggle(cell)}
                                disabled={
                                  cell.state !== "normal" &&
                                  cell.state !== "selected" &&
                                  cell.baseState !== "wheelchair"
                                }
                                aria-label={`Seat ${row.label}`}
                              />
                            )
                          ))}
                        </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <div className="seat-selection-lower-grid">
            <div className="seat-selection-legend-panel">
              <div className="seat-selection-legend-title">Legend</div>

              <div className="seat-selection-legend">
                <span><i className="seat-selection-seat seat-selection-seat-normal" />Available Seats</span>
                <span><i className="seat-selection-seat seat-selection-seat-selected" />Selected Seats</span>
                <span><i className="seat-selection-seat seat-selection-seat-onhold" />On-hold Seat</span>
                <span><i className="seat-selection-seat seat-selection-seat-removed" />Unavailable Seats</span>
                <span><i className="seat-selection-seat seat-selection-seat-wheelchair" />Wheelchair Berth</span>
              </div>

              <div className="seat-selection-footer-note">
                {selectedSeatCount > 0 ? `${selectedSeatCount} seat${selectedSeatCount === 1 ? "" : "s"} selected.` : "Select available seats to continue."}
              </div>
            </div>

            <aside className="seat-selection-cart-panel">
              <div className="seat-selection-cart-header">
                <div>
                  <span className="seat-selection-cart-kicker">Item Cart</span>
                  <h3>Selected Seats</h3>
                </div>
                <span className="seat-selection-cart-cap">Max {MAX_SELECTED_SEATS}</span>
              </div>

              {selectionNotice ? (
                <div className="seat-selection-cart-notice">{selectionNotice}</div>
              ) : null}

              <div className="seat-selection-cart-list">
                {selectedSeatLabels.length ? (
                  selectedSeatLabels.map((seatLabel) => (
                    <button
                      key={seatLabel}
                      type="button"
                      className="seat-selection-cart-seat"
                      onClick={() => {
                        setSelectionNotice("");
                        setSelectedSeats((previous) => {
                          const next = new Set(previous);
                          const [rowChar, ...numberParts] = seatLabel.split("");
                          const rowIndex = rowChar.charCodeAt(0) - 65;
                          const colIndex = Number.parseInt(numberParts.join(""), 10) - 1;
                          next.delete(`${rowIndex}-${colIndex}`);
                          return next;
                        });
                      }}
                    >
                      <span>{seatLabel}</span>
                      <i className="bi bi-x-lg" />
                    </button>
                  ))
                ) : (
                  <div className="seat-selection-cart-empty">
                    No seats selected yet.
                  </div>
                )}
              </div>

              <div className="seat-selection-cart-summary">
                <div className="seat-selection-cart-row">
                  <span>Total Qty</span>
                  <strong>{selectedSeatCount}</strong>
                </div>
                <div className="seat-selection-cart-row">
                  <span>Price Per Seat</span>
                  <strong>{formatCurrency(ticketPrice)}</strong>
                </div>
                <div className="seat-selection-cart-row seat-selection-cart-row-total">
                  <span>Total Cost</span>
                  <strong>{formatCurrency(totalCost)}</strong>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      {pendingWheelchairSeat ? (
        <div className="seat-selection-modal-backdrop" role="presentation">
          <div
            className="seat-selection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="wheelchairSeatTitle"
          >
            <button
              type="button"
              className="seat-selection-modal-close"
              aria-label="Close dialog"
              onClick={() => setPendingWheelchairSeat(null)}
            >
              <i className="bi bi-x-lg" />
            </button>

            <h3 id="wheelchairSeatTitle">Wheelchair Seat Selection</h3>
            <p>
              This seat is marked as a wheelchair-accessible seat. Please confirm that you want to select{" "}
              <strong>{formatSeatLabel(pendingWheelchairSeat.seatKey)}</strong>.
            </p>

            <div className="seat-selection-modal-actions">
              <button
                type="button"
                className="seat-selection-modal-btn seat-selection-modal-btn-primary"
                onClick={() => {
                  const added = tryAddSeat(pendingWheelchairSeat.seatKey);
                  if (added) {
                    setPendingWheelchairSeat(null);
                  }
                }}
              >
                OK
              </button>
              <button
                type="button"
                className="seat-selection-modal-btn seat-selection-modal-btn-secondary"
                onClick={() => setPendingWheelchairSeat(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

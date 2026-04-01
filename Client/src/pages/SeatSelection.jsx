import { useEffect, useMemo, useState } from "react";
import {
  createBooking,
  extendBookingHold,
  fetchMovieById,
  fetchScreeningSeatPreview,
  releaseBookingHold,
  resolveMoviePictureUrl
} from "../services/api";
import {
  BOOKING_FEE_DEFAULT,
  BOOKING_TIMER_EXTEND_MS,
  BOOKING_TIMER_INITIAL_MS,
  buildCountdownDigitsFromRemainingMs,
  clearBookingPipelineSession,
  createStageOneBookingSession,
  formatRemainingMmSs,
  getSessionRemainingMs,
  readBookingPipelineSession,
  saveBookingPipelineSession,
  updateBookingPipelineSession
} from "../services/bookingPipeline";
import SeatSelectionButton from "../components/SeatSelectionButton";
import "./SeatSelection.css";

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

function getSeatTooltipAnchor(target) {
  if (!target || typeof target.getBoundingClientRect !== "function") return null;

  const rect = target.getBoundingClientRect();

  return {
    left: rect.left + rect.width / 2,
    top: rect.top
  };
}

const checkoutSteps = [
  { label: "Seats", icon: "seat", active: true },
  { label: "Promos", icon: "bi bi-ticket-detailed" },
  { label: "Add-ons", icon: "bi bi-basket" },
  { label: "Payment", icon: "bi bi-credit-card-2-front" }
];

export default function SeatSelection({ screeningId = "" }) {
  const MAX_SELECTED_SEATS = 10;
  const LOW_TIME_THRESHOLD_MS = 60 * 1000;
  const [preview, setPreview] = useState(null);
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSeats, setSelectedSeats] = useState(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [now, setNow] = useState(() => new Date());
  const [bookingSession, setBookingSession] = useState(() => readBookingPipelineSession());
  const [selectionNotice, setSelectionNotice] = useState("");
  const [pendingWheelchairSeat, setPendingWheelchairSeat] = useState(null);
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [isConfirmingBooking, setIsConfirmingBooking] = useState(false);
  const [warningVisible, setWarningVisible] = useState(false);
  const [expiredVisible, setExpiredVisible] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [seatTooltip, setSeatTooltip] = useState({
    visible: false,
    label: "",
    left: 0,
    top: 0
  });

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
    if (!seatTooltip.visible) return undefined;

    function hideTooltip() {
      setSeatTooltip((previous) => (previous.visible ? { ...previous, visible: false } : previous));
    }

    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);

    return () => {
      window.removeEventListener("scroll", hideTooltip, true);
      window.removeEventListener("resize", hideTooltip);
    };
  }, [seatTooltip.visible]);

  useEffect(() => {
    if (!preview?.screeningId) return;

    const nextSession = createStageOneBookingSession({
      screeningId: preview.screeningId,
      movieId: preview.movie?._id || ""
    });

    saveBookingPipelineSession(nextSession);
    setBookingSession(nextSession);
    setWarningVisible(false);
    setExpiredVisible(false);
  }, [preview?.screeningId, preview?.movie?._id]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
      setBookingSession(readBookingPipelineSession());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const selectedSeatLabels = useMemo(
    () => [...selectedSeats].map(formatSeatLabel).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [selectedSeats]
  );

  const activeSession = useMemo(() => {
    if (!bookingSession) return null;
    if (bookingSession.screeningId !== screeningId) return null;
    if (bookingSession.stage !== "seat-selection") return null;
    return bookingSession;
  }, [bookingSession, screeningId]);

  const remainingMs = activeSession
    ? getSessionRemainingMs(activeSession, now)
    : BOOKING_TIMER_INITIAL_MS;

  const countdownDigits = buildCountdownDigitsFromRemainingMs(remainingMs);

  useEffect(() => {
    if (!activeSession) return;

    if (remainingMs <= 0) {
      setWarningVisible(false);
      setExpiredVisible(true);
      return;
    }

    if (remainingMs <= LOW_TIME_THRESHOLD_MS && !activeSession.lowTimePrompted) {
      const nextSession = updateBookingPipelineSession({ lowTimePrompted: true });
      if (nextSession) setBookingSession(nextSession);
      setWarningVisible(true);
      return;
    }

    if (remainingMs > LOW_TIME_THRESHOLD_MS && activeSession.lowTimePrompted) {
      const nextSession = updateBookingPipelineSession({ lowTimePrompted: false });
      if (nextSession) setBookingSession(nextSession);
    }
  }, [activeSession, remainingMs]);

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
  const seatRows = buildSeatRows(preview.hall, selectedSeats);
  const selectedSeatCount = selectedSeats.size;
  const ticketPrice = Number(preview.price) || 0;
  const totalCost = ticketPrice * selectedSeatCount;

  function tryAddSeat(seatKey) {
    if (selectedSeats.has(seatKey)) {
      setSelectionNotice("");
      setBookingMessage("");
      setBookingError("");
      return true;
    }

    if (selectedSeats.size >= MAX_SELECTED_SEATS) {
      setSelectionNotice(`You can select up to ${MAX_SELECTED_SEATS} seats only.`);
      return false;
    }

    setSelectedSeats((previous) => {
      const next = new Set(previous);
      next.add(seatKey);
      return next;
    });

    setSelectionNotice("");
    setBookingMessage("");
    setBookingError("");
    return true;
  }

  function handleSeatToggle(cell) {
    if (!cell?.seatKey || (cell.state !== "normal" && cell.state !== "selected" && cell.baseState !== "wheelchair")) return;

    if (selectedSeats.has(cell.seatKey)) {
      setSelectedSeats((previous) => {
        const next = new Set(previous);
        next.delete(cell.seatKey);
        setSelectionNotice("");
        setBookingMessage("");
        setBookingError("");
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

  function showSeatTooltip(target, seatKey) {
    const anchor = getSeatTooltipAnchor(target);
    if (!anchor) return;

    setSeatTooltip({
      visible: true,
      label: formatSeatLabel(seatKey),
      left: anchor.left,
      top: anchor.top
    });
  }

  function hideSeatTooltip() {
    setSeatTooltip((previous) => (previous.visible ? { ...previous, visible: false } : previous));
  }

  async function handleConfirmBooking() {
    if (!preview?.screeningId || !selectedSeatLabels.length || isConfirmingBooking) return;
    if (!activeSession || remainingMs <= 0) {
      setExpiredVisible(true);
      return;
    }

    try {
      setIsConfirmingBooking(true);
      setBookingError("");
      setBookingMessage("");

      const response = await createBooking({
        screeningId: preview.screeningId,
        seats: selectedSeatLabels,
        holdDurationSeconds: Math.max(Math.ceil(remainingMs / 1000), 1)
      });

      const booking = response?.booking || null;
      const nextScreeningId = booking?.screeningId || preview.screeningId || screeningId;
      const bookingMovieId = booking?.movieId || heroMovie._id || preview.movie?._id || "";
      const bookingExpiresAt = booking?.expiresAt || null;

      if (!booking?._id || !nextScreeningId || !bookingExpiresAt) {
        setBookingError("Unable to confirm your booking hold. Please try again.");
        return;
      }

      const confirmedSeats = Array.isArray(booking?.seats) && booking.seats.length
        ? booking.seats
        : selectedSeatLabels;

      saveBookingPipelineSession({
        bookingId: booking._id,
        screeningId: nextScreeningId,
        movieId: bookingMovieId,
        stage: "promotions",
        lowTimePrompted: Boolean(activeSession.lowTimePrompted),
        expiresAt: bookingExpiresAt,
        selectedSeats: confirmedSeats,
        seatCount: Number.isFinite(booking?.seatCount) ? booking.seatCount : confirmedSeats.length,
        ticketPrice: Number.isFinite(booking?.pricePerSeat) ? booking.pricePerSeat : ticketPrice,
        seatType: preview?.hall?.type || "Standard",
        ticketType: "Adult",
        bookingFee: Number.isFinite(activeSession?.bookingFee) ? activeSession.bookingFee : BOOKING_FEE_DEFAULT,
        promo: null,
        addons: []
      });

      window.location.hash = `#promotions/${nextScreeningId}`;
      return;
    } catch (confirmError) {
      const conflictedSeats = Array.isArray(confirmError?.conflictedSeats)
        ? confirmError.conflictedSeats
        : [];

      if (conflictedSeats.length) {
        setPreview((previous) => {
          if (!previous?.hall || !previous.hall.seatConfig) return previous;
          const nextSeatConfig = { ...previous.hall.seatConfig };

          conflictedSeats.forEach((seatLabel) => {
            const match = /^([A-Z])(\d+)$/.exec((seatLabel || "").toString().trim().toUpperCase());
            if (!match) return;
            const rowIndex = match[1].charCodeAt(0) - 65;
            const columnIndex = Number.parseInt(match[2], 10) - 1;
            if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
            nextSeatConfig[`${rowIndex}-${columnIndex}`] = "onhold";
          });

          return {
            ...previous,
            hall: {
              ...previous.hall,
              seatConfig: nextSeatConfig
            }
          };
        });

        setSelectedSeats((previous) => {
          const next = new Set(previous);
          conflictedSeats.forEach((seatLabel) => {
            const match = /^([A-Z])(\d+)$/.exec((seatLabel || "").toString().trim().toUpperCase());
            if (!match) return;
            const rowIndex = match[1].charCodeAt(0) - 65;
            const columnIndex = Number.parseInt(match[2], 10) - 1;
            if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)) return;
            next.delete(`${rowIndex}-${columnIndex}`);
          });
          return next;
        });

        setSelectionNotice(
          `Seat is now unavailable: ${conflictedSeats.join(", ")}. Remaining seats stay selected.`
        );
        setBookingError("");
        return;
      }

      setBookingError(confirmError.message || "Failed to confirm booking.");
    } finally {
      setIsConfirmingBooking(false);
    }
  }

  async function handleExtendSession() {
    if (!activeSession || isExtending) return;

    try {
      setIsExtending(true);

      if (activeSession.bookingId) {
        const response = await extendBookingHold(activeSession.bookingId);
        const nextExpiresAt = response?.booking?.expiresAt;
        if (!nextExpiresAt) return;

        const nextSession = {
          ...activeSession,
          expiresAt: nextExpiresAt,
          lowTimePrompted: false
        };

        saveBookingPipelineSession(nextSession);
        setBookingSession(nextSession);
      } else {
        const currentExpiryMs = new Date(activeSession.expiresAt).getTime();
        const fallbackBase = Number.isFinite(currentExpiryMs)
          ? Math.max(currentExpiryMs, Date.now())
          : Date.now();
        const nextSession = {
          ...activeSession,
          expiresAt: new Date(fallbackBase + BOOKING_TIMER_EXTEND_MS).toISOString(),
          lowTimePrompted: false
        };

        saveBookingPipelineSession(nextSession);
        setBookingSession(nextSession);
      }

      setWarningVisible(false);
    } catch (_error) {
      setBookingError("Unable to extend reservation at the moment.");
    } finally {
      setIsExtending(false);
    }
  }

  async function handleExpiredSessionConfirm() {
    const movieId = activeSession?.movieId || heroMovie._id || preview.movie?._id || "";

    if (activeSession?.bookingId) {
      await releaseBookingHold(activeSession.bookingId).catch(() => null);
    }

    clearBookingPipelineSession();
    setBookingSession(null);
    setExpiredVisible(false);
    window.location.hash = `#movie-details/${movieId}`;
  }

  return (
    <section className="seat-selection-page">
      <div
        className="seat-selection-stage"
        style={{ "--seat-selection-hero-image": `url("${posterUrl}")` }}
      >
        <div className="seat-selection-stage-frame">
          <div className="seat-selection-hero-block">
            <div className="seat-selection-topbar">
              <div className="seat-selection-breadcrumbs">
                <a href={`#movie-details/${heroMovie._id || preview.movie?._id || ""}`}>Movies &amp; Showtimes</a>
                <span><i className="bi bi-chevron-right" /></span>
                <strong>Seat Selection</strong>
              </div>

              <div className="seat-selection-countdown" aria-label="Time remaining">
                {countdownDigits.map((digit, index) => (
                  <span
                    key={`${digit}-${index}`}
                    className={`seat-selection-countdown-digit${digit === ":" ? " seat-selection-countdown-separator" : ""}`}
                  >
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
          </div>

          <div className="seat-selection-map-panel">
            <div className="seat-selection-map-toolbar">
              <div className="seat-selection-map-summary">
                <span>Hall Preview</span>
                <strong>{preview.hall?.type || "Standard"}</strong>
              </div>

              <div className="seat-selection-map-toolbar-actions">
                <SeatSelectionButton
                  variant="outline"
                  size="md"
                  onClick={() => {
                    setSelectedSeats(new Set());
                    setSelectionNotice("");
                    setBookingMessage("");
                    setBookingError("");
                  }}
                >
                  Clear Seats
                </SeatSelectionButton>
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
                                onMouseEnter={(event) => showSeatTooltip(event.currentTarget, cell.seatKey)}
                                onMouseMove={(event) => showSeatTooltip(event.currentTarget, cell.seatKey)}
                                onMouseLeave={hideSeatTooltip}
                                onFocus={(event) => showSeatTooltip(event.currentTarget, cell.seatKey)}
                                onBlur={hideSeatTooltip}
                                aria-label={`Seat ${formatSeatLabel(cell.seatKey)}`}
                                data-seat-label={formatSeatLabel(cell.seatKey)}
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

              <div className="seat-selection-cart-actions">
                <SeatSelectionButton
                  variant="secondary"
                  className="seat-selection-cart-action"
                  onClick={() => {
                    window.location.hash = `#movie-details/${heroMovie._id || preview.movie?._id || ""}`;
                  }}
                >
                  Back
                </SeatSelectionButton>
                <SeatSelectionButton
                  variant="primary"
                  className="seat-selection-cart-action"
                  onClick={handleConfirmBooking}
                  disabled={!selectedSeatLabels.length || isConfirmingBooking}
                >
                  {isConfirmingBooking ? "Confirming..." : "Confirm"}
                </SeatSelectionButton>
              </div>

              {bookingError ? (
                <div className="seat-selection-cart-feedback seat-selection-cart-feedback-error">
                  {bookingError}
                </div>
              ) : null}
              {bookingMessage ? (
                <div className="seat-selection-cart-feedback seat-selection-cart-feedback-success">
                  {bookingMessage}
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </div>

      {seatTooltip.visible ? (
        <div
          className="seat-selection-seat-tooltip"
          style={{ left: `${seatTooltip.left}px`, top: `${seatTooltip.top}px` }}
          aria-hidden="true"
        >
          {`Seat\n${seatTooltip.label}`}
        </div>
      ) : null}

      {warningVisible ? (
        <div className="seat-selection-modal-backdrop" role="presentation">
          <div className="seat-selection-modal" role="dialog" aria-modal="true" aria-labelledby="reservationWarningTitle">
            <h3 id="reservationWarningTitle">Reservation Ending Soon</h3>
            <p>
              Reservation will expire in <strong>{formatRemainingMmSs(remainingMs)}</strong>.
              <br />
              Would you like to extend?
            </p>

            <div className="seat-selection-modal-actions">
              <SeatSelectionButton
                variant="secondary"
                size="sm"
                className="seat-selection-modal-btn"
                onClick={() => setWarningVisible(false)}
              >
                Cancel
              </SeatSelectionButton>
              <SeatSelectionButton
                variant="primary"
                size="sm"
                className="seat-selection-modal-btn"
                onClick={handleExtendSession}
                disabled={isExtending}
              >
                {isExtending ? "Extending..." : "Extend"}
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}

      {expiredVisible ? (
        <div className="seat-selection-modal-backdrop" role="presentation">
          <div className="seat-selection-modal" role="dialog" aria-modal="true" aria-labelledby="reservationExpiredTitle">
            <h3 id="reservationExpiredTitle">Cart Expired</h3>
            <p>
              Your session has expired, please book again.
            </p>
            <div className="seat-selection-modal-actions">
              <SeatSelectionButton
                variant="primary"
                size="sm"
                className="seat-selection-modal-btn"
                onClick={handleExpiredSessionConfirm}
              >
                Confirm
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}

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
              <SeatSelectionButton
                variant="primary"
                size="sm"
                className="seat-selection-modal-btn"
                onClick={() => {
                  const added = tryAddSeat(pendingWheelchairSeat.seatKey);
                  if (added) {
                    setPendingWheelchairSeat(null);
                  }
                }}
              >
                OK
              </SeatSelectionButton>
              <SeatSelectionButton
                variant="secondary"
                size="sm"
                className="seat-selection-modal-btn"
                onClick={() => setPendingWheelchairSeat(null)}
              >
                Cancel
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

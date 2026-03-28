import { useEffect, useMemo, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import {
  extendBookingHold,
  fetchMovieById,
  fetchPromotions,
  fetchScreeningSeatPreview,
  releaseBookingHold,
  resolveMoviePictureUrl
} from "../services/api";
import {
  buildCountdownDigitsFromRemainingMs,
  clearBookingPipelineSession,
  formatRemainingMmSs,
  getSessionRemainingMs,
  readBookingPipelineSession,
  saveBookingPipelineSession,
  updateBookingPipelineSession
} from "../services/bookingPipeline";
import "./Promotions.css";

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

function formatCurrency(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "SGD 0.00";

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(numeric);
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

const checkoutSteps = [
  { label: "Seats", icon: "bi bi-check2", state: "complete" },
  { label: "Promos", icon: "bi bi-ticket-detailed", state: "active" },
  { label: "Add-ons", icon: "bi bi-basket", state: "upcoming" },
  { label: "Payment", icon: "bi bi-credit-card-2-front", state: "upcoming" }
];

export default function Promotions({ screeningId = "", flowStage = "promotions" }) {
  const LOW_TIME_THRESHOLD_MS = 60 * 1000;
  const [preview, setPreview] = useState(null);
  const [movie, setMovie] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [bookingSession, setBookingSession] = useState(() => readBookingPipelineSession());
  const [warningVisible, setWarningVisible] = useState(false);
  const [expiredVisible, setExpiredVisible] = useState(false);
  const [isExtending, setIsExtending] = useState(false);

  useEffect(() => {
    if (!screeningId) {
      setError("No screening selected.");
      setLoading(false);
      return undefined;
    }

    let isActive = true;

    async function loadPromotionsPage() {
      try {
        setLoading(true);
        setError("");

        const [seatPreview, promoItems] = await Promise.all([
          fetchScreeningSeatPreview(screeningId),
          fetchPromotions({ limit: 20 })
        ]);

        if (!isActive) return;

        setPreview(seatPreview);
        setPromotions(promoItems || []);

        if (seatPreview?.movie?._id) {
          const movieDetails = await fetchMovieById(seatPreview.movie._id);
          if (!isActive) return;
          setMovie(movieDetails);
        } else {
          setMovie(null);
        }
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || "Failed to load promotions.");
        setPreview(null);
        setMovie(null);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadPromotionsPage();

    return () => {
      isActive = false;
    };
  }, [screeningId]);

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
      setBookingSession(readBookingPipelineSession());
    }, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  const activeSession = useMemo(() => {
    if (!bookingSession) return null;
    if (bookingSession.screeningId !== screeningId) return null;
    if (!bookingSession.bookingId) return null;
    return bookingSession;
  }, [bookingSession, screeningId]);

  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.stage === flowStage) return;

    const nextSession = updateBookingPipelineSession({ stage: flowStage });
    if (nextSession) setBookingSession(nextSession);
  }, [activeSession, flowStage]);

  const remainingMs = getSessionRemainingMs(activeSession, now);
  const countdownDigits = buildCountdownDigitsFromRemainingMs(remainingMs);

  useEffect(() => {
    if (!activeSession || expiredVisible) return;

    if (remainingMs <= 0) {
      setWarningVisible(false);
      if (!expiredVisible) {
        (async () => {
          if (activeSession.bookingId) {
            await releaseBookingHold(activeSession.bookingId).catch(() => null);
          }
          clearBookingPipelineSession();
          setBookingSession(null);
          setExpiredVisible(true);
        })();
      }
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
  }, [activeSession, remainingMs, expiredVisible]);

  const heroMovie = movie || preview?.movie || {};
  const posterUrl = resolveMoviePictureUrl(heroMovie.pictureUrl || heroMovie.posterUrl || "");

  const seatLabel = "A1";
  const seatQty = 1;
  const ticketPrice = Number(preview?.price) || 0;
  const seatsAmount = ticketPrice * seatQty;
  const bookingFee = 2;
  const grandTotal = seatsAmount + bookingFee;

  function handleApplyPromoCode() {
    const normalized = promoCode.trim();
    if (!normalized) {
      setCodeMessage("Please enter a promo code.");
      return;
    }

    setCodeMessage(`Code "${normalized}" captured. Validation flow will be added next.`);
  }

  if (loading) {
    return (
      <section className="promotions-status">
        <p>Loading promotions...</p>
      </section>
    );
  }

  if (error || !preview) {
    return (
      <section className="promotions-status promotions-status-error">
        <p>{error || "Promotions are unavailable."}</p>
      </section>
    );
  }

  if (!activeSession && !expiredVisible) {
    return (
      <section className="promotions-status promotions-status-error">
        <p>No active reservation found. Please select seats again.</p>
      </section>
    );
  }

  async function handleExtendSession() {
    if (!activeSession?.bookingId || isExtending) return;

    try {
      setIsExtending(true);
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
      setWarningVisible(false);
    } catch (_error) {
      setCodeMessage("Unable to extend reservation at the moment.");
    } finally {
      setIsExtending(false);
    }
  }

  return (
    <section className="promotions-page">
      <div
        className="promotions-stage"
        style={{ "--promotions-hero-image": `url("${posterUrl}")` }}
      >
        <div className="promotions-stage-frame">
          <div className="promotions-hero-block">
            <div className="promotions-topbar">
              <div className="promotions-breadcrumbs">
                <a href={`#movie-details/${heroMovie._id || preview.movie?._id || ""}`}>Movies &amp; Showtimes</a>
                <span><i className="bi bi-chevron-right" /></span>
                <strong>Promotions</strong>
              </div>

            <div className="promotions-countdown" aria-label="Time remaining">
              {countdownDigits.map((digit, index) => (
                  <span
                    key={`${digit}-${index}`}
                    className={`promotions-countdown-digit${digit === ":" ? " promotions-countdown-separator" : ""}`}
                  >
                    {digit}
                  </span>
                ))}
              </div>
            </div>

            <div className="promotions-header">
              <h1>{heroMovie.name || "Movie"}</h1>

              <div className="promotions-rating-row">
                <span className="promotions-rating-chip">{heroMovie.ageRestriction || preview.movie?.ageRestriction || "NR"}</span>
                <span>{getAdvisoryText(heroMovie.ageRestriction || preview.movie?.ageRestriction)}</span>
              </div>

              <div className="promotions-screening-pill">
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

            <div className="promotions-steps">
              {checkoutSteps.map((step, index) => (
                <div key={step.label} className="promotions-step-item">
                  <div className={`promotions-step-icon promotions-step-icon-${step.state}`}>
                    <i className={step.icon} />
                  </div>
                  <span className={`promotions-step-label promotions-step-label-${step.state}`}>
                    {step.label}
                  </span>
                  {index < checkoutSteps.length - 1 ? <span className="promotions-step-line" /> : null}
                </div>
              ))}
            </div>
          </div>

          <section className="promotions-panel">
            <h2>EPromo Code</h2>
            <div className="promotions-code-row">
              <input
                type="text"
                value={promoCode}
                onChange={(event) => {
                  setPromoCode(event.target.value);
                  setCodeMessage("");
                }}
                placeholder="ePromoCode"
              />
              <SeatSelectionButton
                variant="primary"
                onClick={handleApplyPromoCode}
              >
                APPLY
              </SeatSelectionButton>
            </div>
            {codeMessage ? <p className="promotions-code-message">{codeMessage}</p> : null}
          </section>

          <section className="promotions-panel">
            <h2>Promotions</h2>
            <div className="promotions-list">
              {promotions.length ? (
                promotions.map((promotion) => (
                  <article key={promotion._id} className="promotions-card">
                    <img
                      src={resolveMoviePictureUrl(promotion.pictureUrl)}
                      alt={promotion.name || "Promotion"}
                    />
                    <h3>{promotion.name || "Promotion"}</h3>
                    <a href="#" onClick={(event) => event.preventDefault()}>Terms &amp; Conditions</a>
                  </article>
                ))
              ) : (
                <p className="promotions-empty">No promotions available.</p>
              )}
            </div>
          </section>

          <section className="promotions-panel">
            <h2>Order Summary</h2>
            <div className="promotions-summary-header">
              <span>Item</span>
              <span>Qty</span>
              <span>Amount</span>
            </div>

            <div className="promotions-summary-body">
              <h3>Seats</h3>
              <div className="promotions-summary-row">
                <div>
                  <p>{preview.hall?.type || "Standard"} Seat(s)</p>
                  <p>Adult ({formatCurrency(ticketPrice)})</p>
                  <p>{seatLabel}</p>
                </div>
                <strong>{seatQty}</strong>
                <strong>{formatCurrency(seatsAmount)}</strong>
              </div>
            </div>

            <div className="promotions-summary-footer">
              <div className="promotions-summary-total-row">
                <span>Booking Fee</span>
                <strong>{formatCurrency(bookingFee)}</strong>
              </div>
              <div className="promotions-summary-total-row promotions-summary-total-row-grand">
                <span>Grand Total</span>
                <strong>{formatCurrency(grandTotal)}</strong>
              </div>
            </div>

            <p className="promotions-terms">
              By clicking on continue, you agree to all terms and conditions of the promotion(s) applied.
            </p>

            <div className="promotions-actions">
              <SeatSelectionButton
                variant="secondary"
                onClick={() => {
                  window.location.hash = `#seat-selection/${preview.screeningId || screeningId}`;
                }}
              >
                BACK TO SEATS
              </SeatSelectionButton>
              <SeatSelectionButton
                variant="primary"
                onClick={() => {
                  window.location.hash = `#addons/${preview.screeningId || screeningId}`;
                }}
              >
                CONTINUE
              </SeatSelectionButton>
            </div>
          </section>
        </div>
      </div>

      {warningVisible ? (
        <div className="promotions-modal-backdrop" role="presentation">
          <div className="promotions-modal" role="dialog" aria-modal="true" aria-labelledby="reservationWarningTitle">
            <h3 id="reservationWarningTitle">Reservation Ending Soon</h3>
            <p>
              Reservation will expire in <strong>{formatRemainingMmSs(remainingMs)}</strong>.
            </p>
            <div className="promotions-modal-actions">
              <SeatSelectionButton variant="secondary" onClick={() => setWarningVisible(false)}>
                Dismiss
              </SeatSelectionButton>
              <SeatSelectionButton variant="primary" onClick={handleExtendSession} disabled={isExtending}>
                {isExtending ? "Extending..." : "Extend"}
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}

      {expiredVisible ? (
        <div className="promotions-modal-backdrop" role="presentation">
          <div className="promotions-modal" role="dialog" aria-modal="true" aria-labelledby="reservationExpiredTitle">
            <h3 id="reservationExpiredTitle">Cart Expired</h3>
            <p>
              You have exceeded the time allowed for completing the booking.
              Please proceed with a new booking.
            </p>
            <div className="promotions-modal-actions">
              <SeatSelectionButton
                variant="primary"
                size="sm"
                onClick={() => {
                  const movieId = activeSession?.movieId || heroMovie._id || preview.movie?._id || "";
                  clearBookingPipelineSession();
                  window.location.hash = `#movie-details/${movieId}`;
                }}
              >
                Confirm
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

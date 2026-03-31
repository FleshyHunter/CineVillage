import { useEffect, useMemo, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { fetchMovieById, fetchScreeningSeatPreview, resolveMoviePictureUrl } from "../services/api";
import { clearBookingPipelineSession, readBookingPipelineSession } from "../services/bookingPipeline";
import "./PaymentSuccess.css";

function formatCurrency(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "SGD 0.00";

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(numeric);
}

function formatScreeningDate(dateValue) {
  if (!dateValue) return "N/A";

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatDateTimeLabel(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "N/A";
  return parsed.toLocaleString("en-SG", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function normalizeSeatLabels(seats = []) {
  if (!Array.isArray(seats)) return [];

  const seen = new Set();
  const normalized = [];

  seats.forEach((seat) => {
    const seatLabel = (seat || "").toString().trim().toUpperCase();
    if (!seatLabel || seen.has(seatLabel)) return;
    seen.add(seatLabel);
    normalized.push(seatLabel);
  });

  return normalized;
}

function normalizeSessionAddOns(addons = []) {
  if (!Array.isArray(addons)) return [];

  return addons
    .map((addon) => {
      if (!addon || typeof addon !== "object") return null;

      const id = (addon.id || addon._id || "").toString().trim();
      const name = (addon.name || "").toString().trim() || "Add-on";
      const qty = Math.max(0, Number.parseInt(addon.qty, 10) || 0);
      const price = Number(addon.price);
      const normalizedPrice = Number.isFinite(price) && price >= 0 ? price : 0;

      if (!id && !name) return null;
      if (qty <= 0) return null;

      return {
        id: id || name,
        name,
        qty,
        price: normalizedPrice
      };
    })
    .filter(Boolean);
}

function resolvePromoDiscountAmount(promo, totalBeforeDiscount) {
  if (!promo || typeof promo !== "object") return 0;
  if (totalBeforeDiscount <= 0) return 0;

  const explicitAmount = Number(promo.discountAmount);
  if (Number.isFinite(explicitAmount) && explicitAmount > 0) {
    return Math.min(explicitAmount, totalBeforeDiscount);
  }

  const value = Number(promo.discountValue);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const discountType = (promo.discountType || promo.type || "").toString().trim().toLowerCase();
  if (discountType.includes("percent") || discountType.includes("%")) {
    return Math.min((totalBeforeDiscount * value) / 100, totalBeforeDiscount);
  }

  return Math.min(value, totalBeforeDiscount);
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

function buildQrPayloadText(bookingId) {
  return JSON.stringify({ bookingId: (bookingId || "").toString() });
}

function buildQrCodeUrl(payloadText) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payloadText)}`;
}

export default function PaymentSuccess({ screeningId = "" }) {
  const [bookingSession, setBookingSession] = useState(() => readBookingPipelineSession());
  const [preview, setPreview] = useState(null);
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setBookingSession(readBookingPipelineSession());
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadPreview() {
      if (!screeningId) {
        if (isActive) {
          setPreview(null);
          setMovie(null);
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        setError("");

        const nextPreview = await fetchScreeningSeatPreview(screeningId);
        if (!isActive) return;
        setPreview(nextPreview);

        const movieId = nextPreview?.movie?._id || bookingSession?.movieId || "";
        if (movieId) {
          const movieDetails = await fetchMovieById(movieId);
          if (!isActive) return;
          setMovie(movieDetails);
        } else {
          setMovie(null);
        }
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || "Unable to load booking confirmation details.");
        setPreview(null);
        setMovie(null);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadPreview();
    return () => {
      isActive = false;
    };
  }, [screeningId, bookingSession?.movieId]);

  const activeSession = useMemo(() => {
    if (!bookingSession) return null;
    if (!bookingSession.bookingId) return null;
    if (screeningId && bookingSession.screeningId !== screeningId) return null;
    return bookingSession;
  }, [bookingSession, screeningId]);

  const heroMovie = movie || preview?.movie || {};
  const posterUrl = resolveMoviePictureUrl(heroMovie.pictureUrl || heroMovie.posterUrl || "");
  const bookingId = (activeSession?.bookingId || "").toString();
  const paymentConfirmation = activeSession?.paymentConfirmation || null;
  const bookingReference = paymentConfirmation?.bookingReference || bookingId || "N/A";
  const transactionId = paymentConfirmation?.transactionId || `mock-${bookingReference}`;
  const confirmationEmail = activeSession?.contactInfo?.email || paymentConfirmation?.recipientEmail || "N/A";
  const paymentTimestamp = formatDateTimeLabel(paymentConfirmation?.confirmedAt);
  const selectedSeats = normalizeSeatLabels(activeSession?.selectedSeats);
  const seatQty = Number.parseInt(activeSession?.seatCount, 10) || selectedSeats.length;
  const ticketPrice = Number(activeSession?.ticketPrice);
  const normalizedTicketPrice = Number.isFinite(ticketPrice) && ticketPrice >= 0 ? ticketPrice : 0;
  const seatSubtotal = seatQty * normalizedTicketPrice;
  const addOns = normalizeSessionAddOns(activeSession?.addons);
  const addOnsSubtotal = addOns.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const bookingFee = Number(activeSession?.bookingFee);
  const normalizedBookingFee = Number.isFinite(bookingFee) && bookingFee >= 0 ? bookingFee : 0;
  const subtotalBeforeDiscount = seatSubtotal + addOnsSubtotal + normalizedBookingFee;
  const promo = activeSession?.promo && typeof activeSession.promo === "object"
    ? activeSession.promo
    : null;
  const promoDiscountAmount = resolvePromoDiscountAmount(promo, subtotalBeforeDiscount);
  const computedGrandTotal = Math.max(subtotalBeforeDiscount - promoDiscountAmount, 0);
  const finalizedTotal = Number(paymentConfirmation?.finalizedTotal);
  const grandTotal = Number.isFinite(finalizedTotal) && finalizedTotal >= 0
    ? finalizedTotal
    : computedGrandTotal;

  const cinemaName = (
    preview?.cinema?.name
    || preview?.hall?.cinemaName
    || preview?.hall?.name
    || "CineVillage"
  ).toString();
  const hallName = (preview?.hall?.name || "Hall").toString();
  const screenFormat = (preview?.hall?.type || activeSession?.seatType || "Standard").toString();
  const advisory = (heroMovie.ageRestriction || preview?.movie?.ageRestriction || "").toString();
  const qrPayloadText = paymentConfirmation?.qrPayloadText || buildQrPayloadText(bookingId);
  const qrCodeUrl = paymentConfirmation?.qrCodeUrl || buildQrCodeUrl(qrPayloadText);

  function handleBackHome() {
    clearBookingPipelineSession();
    window.location.hash = "#";
  }

  if (loading) {
    return (
      <section className="payment-success-status">
        <p>Loading booking confirmation...</p>
      </section>
    );
  }

  if (!activeSession) {
    return (
      <section className="payment-success-status payment-success-status-error">
        <p>{error || "No confirmed booking found."}</p>
        <SeatSelectionButton variant="primary" onClick={handleBackHome}>
          BACK TO HOME
        </SeatSelectionButton>
      </section>
    );
  }

  return (
    <section className="payment-success-page">
      <div
        className="payment-success-stage"
        style={{ "--payment-success-hero-image": `url("${posterUrl}")` }}
      >
        <div className="payment-success-stage-frame">
          <section className="payment-success-panel payment-success-header">
            <span className="payment-success-check" aria-hidden="true">
              <i className="bi bi-check2-circle" />
            </span>
            <h1>Payment Successful</h1>
            <p>Your booking has been confirmed.</p>
          </section>

          <section className="payment-success-panel payment-success-confirmation">
            <h2>Booking Confirmation</h2>
            <div className="payment-success-grid">
              <div>
                <span>Booking ID</span>
                <strong>{bookingId || "N/A"}</strong>
              </div>
              <div>
                <span>Booking Reference</span>
                <strong>{bookingReference}</strong>
              </div>
              <div>
                <span>Transaction ID</span>
                <strong>{transactionId}</strong>
              </div>
              <div>
                <span>Confirmation Email</span>
                <strong>{confirmationEmail}</strong>
              </div>
              <div>
                <span>Payment Timestamp</span>
                <strong>{paymentTimestamp}</strong>
              </div>
            </div>
          </section>

          <section className="payment-success-panel payment-success-movie">
            <h2>Movie &amp; Screening Details</h2>
            <div className="payment-success-grid">
              <div>
                <span>Movie</span>
                <strong>{heroMovie.name || "Movie"}</strong>
              </div>
              <div>
                <span>Advisory</span>
                <strong>{advisory || "N/A"} {advisory ? `• ${getAdvisoryText(advisory)}` : ""}</strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{formatScreeningDate(preview?.startDateTime)}</strong>
              </div>
              <div>
                <span>Time</span>
                <strong>{preview?.time || "N/A"}</strong>
              </div>
              <div>
                <span>Cinema</span>
                <strong>{cinemaName}</strong>
              </div>
              <div>
                <span>Hall</span>
                <strong>{hallName}</strong>
              </div>
              <div>
                <span>Format</span>
                <strong>{screenFormat}</strong>
              </div>
              <div>
                <span>Seat(s)</span>
                <strong>{selectedSeats.length ? selectedSeats.join(", ") : "N/A"}</strong>
              </div>
            </div>
          </section>

          <section className="payment-success-panel payment-success-ticket-layout">
            <div className="payment-success-qr-block">
              <h2>Entry QR Code</h2>
              <img src={qrCodeUrl} alt="Booking QR code" />
              <p>Present this QR code at the counter or entrance.</p>
              <p>If scanning fails, use Booking ID: <strong>{bookingId || "N/A"}</strong></p>
            </div>

            <div className="payment-success-summary-block">
              <h2>Order Summary</h2>
              <div className="payment-success-summary-row">
                <span>Seats / Tickets</span>
                <strong>{formatCurrency(seatSubtotal)}</strong>
              </div>
              {addOns.map((item) => (
                <div key={item.id} className="payment-success-summary-row">
                  <span>{item.name} x{item.qty}</span>
                  <strong>{formatCurrency(item.price * item.qty)}</strong>
                </div>
              ))}
              <div className="payment-success-summary-row">
                <span>Booking Fee</span>
                <strong>{formatCurrency(normalizedBookingFee)}</strong>
              </div>
              <div className="payment-success-summary-row payment-success-summary-row-discount">
                <span>Promo Discount</span>
                <strong>-{formatCurrency(promoDiscountAmount)}</strong>
              </div>
              <div className="payment-success-summary-row payment-success-summary-row-total">
                <span>Grand Total</span>
                <strong>{formatCurrency(grandTotal)}</strong>
              </div>
            </div>
          </section>

          <section className="payment-success-panel">
            <h2>Next Steps</h2>
            <ul className="payment-success-notes">
              <li>Confirmation email has been sent to your registered email address.</li>
              <li>Please arrive at least 15 minutes before showtime.</li>
              <li>Present your QR code or Booking ID for entry.</li>
              <li>Discounted tickets and promotions may require in-person verification.</li>
            </ul>
          </section>

          <div className="payment-success-bottom-action">
            <SeatSelectionButton variant="primary" onClick={handleBackHome}>
              BACK TO HOME
            </SeatSelectionButton>
          </div>
        </div>
      </div>
    </section>
  );
}

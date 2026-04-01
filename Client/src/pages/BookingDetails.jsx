import { useEffect, useMemo, useState } from "react";
import SeatSelectionButton from "../components/SeatSelectionButton";
import { useAccount } from "../context/AccountContext";
import "./BookingDetails.css";

function formatCurrency(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "SGD 0.00";
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(numeric);
}

function buildQrPayloadText(bookingId) {
  return JSON.stringify({ bookingId: (bookingId || "").toString() });
}

function buildQrCodeUrl(payloadText) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(payloadText)}`;
}

function formatDateLabel(value) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function BookingDetails({ bookingId = "" }) {
  const {
    getBookingById,
    ensureBookingById,
    cancelBooking
  } = useAccount();
  const [booking, setBooking] = useState(() => getBookingById(bookingId));
  const [loading, setLoading] = useState(!booking);
  const [error, setError] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadBooking() {
      const existing = getBookingById(bookingId);
      if (existing) {
        setBooking(existing);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const fetched = await ensureBookingById(bookingId);
        if (!isActive) return;
        setBooking(fetched);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError?.message || "Failed to load booking details.");
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadBooking();
    return () => {
      isActive = false;
    };
  }, [bookingId, ensureBookingById, getBookingById]);

  useEffect(() => {
    const latest = getBookingById(bookingId);
    if (latest) setBooking(latest);
  }, [bookingId, getBookingById]);

  const qrPayloadText = booking?.qrPayloadText || buildQrPayloadText(booking?.id || bookingId);
  const qrCodeUrl = booking?.qrCodeUrl || buildQrCodeUrl(qrPayloadText);

  const addonRows = useMemo(() => {
    if (!Array.isArray(booking?.addons)) return [];
    return booking.addons
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const name = (item.name || "").toString().trim() || "Add-on";
        const qty = Math.max(0, Number.parseInt(item.qty, 10) || 0);
        const amount = Number(item.amount ?? (Number(item.price || 0) * qty));
        const safeAmount = Number.isFinite(amount) && amount >= 0 ? amount : 0;
        if (qty <= 0) return null;

        return {
          key: `${name}-${qty}`,
          label: `${name} x${qty}`,
          amount: safeAmount
        };
      })
      .filter(Boolean);
  }, [booking?.addons]);

  async function handleCancelBooking() {
    if (!booking?.id || isCancelling) return;
    const confirmed = window.confirm("Are you sure you want to cancel this booking?");
    if (!confirmed) return;

    setIsCancelling(true);
    try {
      const updated = await cancelBooking(booking.id);
      if (updated) {
        setBooking(updated);
      }
    } catch (cancelError) {
      setError(cancelError?.message || "Failed to cancel booking.");
    } finally {
      setIsCancelling(false);
    }
  }

  if (loading) {
    return (
      <section className="booking-details-status">
        <p>Loading booking details...</p>
      </section>
    );
  }

  if (!booking) {
    return (
      <section className="booking-details-status booking-details-status-error">
        <p>{error || "Booking not found."}</p>
        <SeatSelectionButton variant="secondary" onClick={() => { window.location.hash = "#my-tickets"; }}>
          BACK TO MY TICKETS
        </SeatSelectionButton>
      </section>
    );
  }

  const canCancel = booking.status !== "cancelled";
  const cancelDisabled = booking.status !== "scheduled" || isCancelling;

  return (
    <section className="booking-details-page">
      <div className="booking-details-stage">
        <div className="booking-details-frame">
          <section className="booking-details-panel">
            <h1>Booking Details</h1>
            <div className="booking-details-grid">
              <div>
                <span>Booking ID</span>
                <strong>{booking.id}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong className={`booking-details-status-text booking-details-status-text-${booking.status}`}>
                  {booking.status}
                </strong>
              </div>
              <div>
                <span>Date of Purchase</span>
                <strong>{formatDateLabel(booking.purchaseDate || booking.purchaseDateTime)}</strong>
              </div>
              <div>
                <span>Time of Purchase</span>
                <strong>{booking.purchaseTime || "N/A"}</strong>
              </div>
            </div>
          </section>

          <section className="booking-details-panel">
            <h2>Movie Details</h2>
            <div className="booking-details-grid">
              <div>
                <span>Movie</span>
                <strong>{booking.movieName || "N/A"}</strong>
              </div>
              <div>
                <span>Hall</span>
                <strong>{booking.hallName || "N/A"}</strong>
              </div>
              <div>
                <span>Format</span>
                <strong>{booking.hallType || "Standard"}</strong>
              </div>
              <div>
                <span>Show Date</span>
                <strong>{formatDateLabel(booking.date)}</strong>
              </div>
              <div>
                <span>Show Time</span>
                <strong>{booking.time || "N/A"}</strong>
              </div>
              <div>
                <span>Seats</span>
                <strong>{Array.isArray(booking.seats) && booking.seats.length ? booking.seats.join(", ") : "N/A"}</strong>
              </div>
            </div>
          </section>

          <section className="booking-details-panel booking-details-order-layout">
            <div className="booking-details-order-summary">
              <h2>Order Summary</h2>
              <div className="booking-details-summary-row">
                <span>Tickets</span>
                <strong>{formatCurrency(booking.ticketSubtotal || 0)}</strong>
              </div>
              {addonRows.map((item) => (
                <div key={item.key} className="booking-details-summary-row">
                  <span>{item.label}</span>
                  <strong>{formatCurrency(item.amount)}</strong>
                </div>
              ))}
              <div className="booking-details-summary-row">
                <span>Platform Fee</span>
                <strong>{formatCurrency(booking.bookingFee || 0)}</strong>
              </div>
              <div className="booking-details-summary-row booking-details-summary-row-discount">
                <span>Promo Discount</span>
                <strong>-{formatCurrency(booking.promoDiscount || 0)}</strong>
              </div>
              <div className="booking-details-summary-row booking-details-summary-row-total">
                <span>Grand Total</span>
                <strong>{formatCurrency(booking.total || 0)}</strong>
              </div>
            </div>

            <div className="booking-details-qr">
              <h2>Scan At Cinema</h2>
              <img src={qrCodeUrl} alt="Booking QR code" />
              <p>Present this QR code at the counter or entrance.</p>
              <p>If scanning fails, use Booking ID: <strong>{booking.id}</strong></p>
            </div>
          </section>

          {error ? (
            <section className="booking-details-panel booking-details-status-info">
              <p>{error}</p>
            </section>
          ) : null}

          <section className="booking-details-actions">
            <SeatSelectionButton variant="secondary" onClick={() => { window.location.hash = "#my-tickets"; }}>
              BACK TO MY TICKETS
            </SeatSelectionButton>
            {canCancel ? (
              <SeatSelectionButton
                variant="primary"
                onClick={handleCancelBooking}
                disabled={cancelDisabled}
              >
                {isCancelling ? "CANCELLING..." : "CANCEL BOOKING"}
              </SeatSelectionButton>
            ) : null}
          </section>
        </div>
      </div>
    </section>
  );
}

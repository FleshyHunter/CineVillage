import { useEffect, useMemo, useState } from "react";
import AddOnCard from "../components/AddOnCard";
import CardRail from "../components/CardRail";
import SeatSelectionButton from "../components/SeatSelectionButton";
import {
  extendBookingHold,
  fetchAddOns,
  fetchMovieById,
  fetchPromotions,
  fetchScreeningSeatPreview,
  releaseBookingHold,
  resolveMoviePictureUrl
} from "../services/api";
import {
  BOOKING_FEE_DEFAULT,
  buildCountdownDigitsFromRemainingMs,
  clearBookingPipelineSession,
  formatRemainingMmSs,
  getSessionRemainingMs,
  readBookingPipelineSession,
  saveBookingPipelineSession,
  updateBookingPipelineSession
} from "../services/bookingPipeline";

const FLOW_STAGE_INDEX = {
  promotions: 1,
  addons: 2,
  payment: 3
};

const STEP_CONFIG = [
  { key: "seats", label: "Seats", icon: "bi bi-ticket-perforated" },
  { key: "promotions", label: "Promos", icon: "bi bi-ticket-detailed" },
  { key: "addons", label: "Add-ons", icon: "bi bi-basket" },
  { key: "payment", label: "Payment", icon: "bi bi-credit-card-2-front" }
];

const ADD_ON_TYPE_ALA_CARTE = "ala_carte";
const ADD_ON_TYPE_COMBO = "combo";

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

function normalizeSeatLabels(seats = []) {
  if (!Array.isArray(seats)) return [];

  const seen = new Set();
  const normalized = [];

  seats.forEach((seat) => {
    const seatCode = (seat || "").toString().trim().toUpperCase();
    if (!seatCode || seen.has(seatCode)) return;

    seen.add(seatCode);
    normalized.push(seatCode);
  });

  return normalized;
}

function normalizeAddOnType(value) {
  const normalized = (value || "").toString().trim().toLowerCase();
  if (normalized === ADD_ON_TYPE_COMBO) return ADD_ON_TYPE_COMBO;
  return ADD_ON_TYPE_ALA_CARTE;
}

function sanitizeAddOnItem(raw) {
  if (!raw || typeof raw !== "object") return null;

  const id = (raw.id || raw._id || "").toString().trim();
  const name = (raw.name || "").toString().trim();
  if (!id && !name) return null;

  const price = Number(raw.price);
  const normalizedPrice = Number.isFinite(price) && price >= 0 ? price : 0;

  return {
    id: id || name,
    name: name || "Add-on",
    type: normalizeAddOnType(raw.type),
    price: normalizedPrice,
    description: (raw.description || "").toString().trim(),
    image: (raw.image || raw.pictureUrl || "").toString().trim()
  };
}

function normalizeSessionAddOns(addons = []) {
  if (!Array.isArray(addons)) return [];

  return addons
    .map(sanitizeAddOnItem)
    .map((addon, index) => {
      if (!addon) return null;

      const qty = Math.max(0, Number.parseInt(addons[index]?.qty, 10) || 0);
      if (qty <= 0) return null;

      return {
        ...addon,
        type: normalizeAddOnType(addons[index]?.type || addon.type),
        qty
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

  const value = Number(promo.discountValue ?? promo.value ?? promo.amount);
  if (!Number.isFinite(value) || value <= 0) return 0;

  const discountType = (promo.discountType || promo.type || "").toString().trim().toLowerCase();
  if (discountType.includes("percent") || discountType.includes("%")) {
    return Math.min((totalBeforeDiscount * value) / 100, totalBeforeDiscount);
  }

  return Math.min(value, totalBeforeDiscount);
}

function getStageTitle(flowStage) {
  if (flowStage === "addons") return "Add Ons";
  if (flowStage === "payment") return "Payment";
  return "Promotions";
}

function buildCheckoutSteps(flowStage) {
  const currentIndex = FLOW_STAGE_INDEX[flowStage] || FLOW_STAGE_INDEX.promotions;

  return STEP_CONFIG.map((step, index) => {
    const isActive = index === currentIndex;
    const isComplete = index < currentIndex;

    return {
      label: step.label,
      icon: isComplete ? "bi bi-check2" : step.icon,
      state: isActive ? "active" : (isComplete ? "complete" : "upcoming")
    };
  });
}

export default function BookingFlowStage({ screeningId = "", flowStage = "promotions" }) {
  const LOW_TIME_THRESHOLD_MS = 60 * 1000;
  const isPromotionsStage = flowStage === "promotions";
  const isAddOnsStage = flowStage === "addons";
  const isPaymentStage = flowStage === "payment";

  const [preview, setPreview] = useState(null);
  const [movie, setMovie] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [addOns, setAddOns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [codeMessage, setCodeMessage] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [bookingSession, setBookingSession] = useState(() => readBookingPipelineSession());
  const [warningVisible, setWarningVisible] = useState(false);
  const [expiredVisible, setExpiredVisible] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const [modalAddOn, setModalAddOn] = useState(null);
  const [modalQuantity, setModalQuantity] = useState(1);

  useEffect(() => {
    if (!screeningId) {
      setError("No screening selected.");
      setLoading(false);
      return undefined;
    }

    let isActive = true;

    async function loadFlowPage() {
      try {
        setLoading(true);
        setError("");

        const [seatPreview, promoItems, addOnItems] = await Promise.all([
          fetchScreeningSeatPreview(screeningId),
          isPromotionsStage ? fetchPromotions({ limit: 20 }) : Promise.resolve([]),
          isAddOnsStage ? fetchAddOns() : Promise.resolve([])
        ]);

        if (!isActive) return;

        setPreview(seatPreview);
        setPromotions(Array.isArray(promoItems) ? promoItems : []);
        setAddOns(
          (Array.isArray(addOnItems) ? addOnItems : [])
            .map(sanitizeAddOnItem)
            .filter(Boolean)
        );

        if (seatPreview?.movie?._id) {
          const movieDetails = await fetchMovieById(seatPreview.movie._id);
          if (!isActive) return;
          setMovie(movieDetails);
        } else {
          setMovie(null);
        }
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || "Failed to load booking flow details.");
        setPreview(null);
        setMovie(null);
        setPromotions([]);
        setAddOns([]);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadFlowPage();

    return () => {
      isActive = false;
    };
  }, [screeningId, isPromotionsStage, isAddOnsStage]);

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
  const stageTitle = getStageTitle(flowStage);
  const checkoutSteps = useMemo(() => buildCheckoutSteps(flowStage), [flowStage]);

  const selectedSeats = useMemo(
    () => normalizeSeatLabels(activeSession?.selectedSeats),
    [activeSession?.selectedSeats]
  );

  const seatQty = useMemo(() => {
    const parsed = Number.parseInt(activeSession?.seatCount, 10);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
    return selectedSeats.length;
  }, [activeSession?.seatCount, selectedSeats.length]);

  const ticketPrice = useMemo(() => {
    const sessionPrice = Number(activeSession?.ticketPrice);
    if (Number.isFinite(sessionPrice) && sessionPrice >= 0) return sessionPrice;

    const previewPrice = Number(preview?.price);
    if (Number.isFinite(previewPrice) && previewPrice >= 0) return previewPrice;

    return 0;
  }, [activeSession?.ticketPrice, preview?.price]);

  const seatType = (activeSession?.seatType || preview?.hall?.type || "Standard").toString();
  const ticketType = (activeSession?.ticketType || "Adult").toString();

  const sessionAddOns = useMemo(
    () => normalizeSessionAddOns(activeSession?.addons),
    [activeSession?.addons]
  );

  const addOnQtyById = useMemo(() => {
    const map = new Map();
    sessionAddOns.forEach((item) => {
      map.set(item.id, item.qty);
    });
    return map;
  }, [sessionAddOns]);

  const alaCarteAddOns = useMemo(
    () => addOns.filter((item) => item.type === ADD_ON_TYPE_ALA_CARTE),
    [addOns]
  );

  const comboAddOns = useMemo(
    () => addOns.filter((item) => item.type === ADD_ON_TYPE_COMBO),
    [addOns]
  );

  const seatsAmount = seatQty * ticketPrice;
  const addOnsAmount = sessionAddOns.reduce((sum, item) => sum + (item.price * item.qty), 0);
  const bookingFeeRaw = Number(activeSession?.bookingFee);
  const bookingFee = Number.isFinite(bookingFeeRaw) && bookingFeeRaw >= 0 ? bookingFeeRaw : BOOKING_FEE_DEFAULT;
  const subtotalBeforeDiscount = seatsAmount + addOnsAmount + bookingFee;

  const promo = activeSession?.promo && typeof activeSession.promo === "object"
    ? activeSession.promo
    : null;
  const promoDiscountAmount = resolvePromoDiscountAmount(promo, subtotalBeforeDiscount);
  const grandTotal = Math.max(subtotalBeforeDiscount - promoDiscountAmount, 0);

  function persistSessionPatch(patch) {
    const nextSession = updateBookingPipelineSession(patch);
    if (nextSession) setBookingSession(nextSession);
    return nextSession;
  }

  function navigateToHash(targetStage) {
    const targetScreeningId = preview?.screeningId || screeningId;
    if (!targetScreeningId) return;

    if (targetStage === "seat-selection") {
      window.location.hash = `#seat-selection/${targetScreeningId}`;
      return;
    }

    if (targetStage === "promotions") {
      window.location.hash = `#promotions/${targetScreeningId}`;
      return;
    }

    if (targetStage === "addons") {
      window.location.hash = `#addons/${targetScreeningId}`;
      return;
    }

    if (targetStage === "payment") {
      window.location.hash = `#payment/${targetScreeningId}`;
    }
  }

  function handleApplyPromoCode() {
    const normalized = promoCode.trim();
    if (!normalized) {
      setCodeMessage("Please enter a promo code.");
      return;
    }

    setCodeMessage(`Code \"${normalized}\" captured. Validation flow will be added next.`);
  }

  function handleOpenAddOnModal(addOn) {
    if (!addOn) return;

    const addOnId = addOn.id;
    const existingQty = addOnQtyById.get(addOnId) || 0;

    setModalAddOn(addOn);
    setModalQuantity(existingQty > 0 ? existingQty : 1);
  }

  function handleCloseAddOnModal() {
    setModalAddOn(null);
    setModalQuantity(1);
  }

  function handleConfirmAddOn() {
    if (!activeSession || !modalAddOn) return;

    const nextQty = Math.max(0, Number.parseInt(modalQuantity, 10) || 0);
    const nextAddOns = sessionAddOns.filter((item) => item.id !== modalAddOn.id);

    if (nextQty > 0) {
      nextAddOns.push({
        id: modalAddOn.id,
        name: modalAddOn.name,
        type: normalizeAddOnType(modalAddOn.type),
        price: modalAddOn.price,
        qty: nextQty,
        image: modalAddOn.image,
        description: modalAddOn.description
      });
    }

    persistSessionPatch({ addons: nextAddOns });
    handleCloseAddOnModal();
  }

  function renderOrderSummarySection({
    backLabel,
    onBack,
    continueLabel,
    onContinue,
    continueDisabled = false,
    termsText = ""
  }) {
    return (
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
              <p>{seatType} Seat(s)</p>
              <p>{ticketType} ({formatCurrency(ticketPrice)})</p>
              {selectedSeats.length ? (
                selectedSeats.map((seatCode) => <p key={seatCode}>{seatCode}</p>)
              ) : (
                <p>No seats selected.</p>
              )}
            </div>
            <strong>{seatQty}</strong>
            <strong>{formatCurrency(seatsAmount)}</strong>
          </div>

          {sessionAddOns.length ? (
            <>
              <h3>Add-ons</h3>
              {sessionAddOns.map((item) => (
                <div key={item.id} className="promotions-summary-row">
                  <div>
                    <p>{item.name}</p>
                    <p>{formatCurrency(item.price)} each</p>
                  </div>
                  <strong>{item.qty}</strong>
                  <strong>{formatCurrency(item.qty * item.price)}</strong>
                </div>
              ))}
            </>
          ) : null}
        </div>

        <div className="promotions-summary-footer">
          <div className="promotions-summary-total-row">
            <span>Booking Fee</span>
            <strong>{formatCurrency(bookingFee)}</strong>
          </div>

          {promo ? (
            <div className="promotions-summary-total-row promotions-summary-total-row-discount">
              <span>Promo Discount{promo?.name ? ` (${promo.name})` : promo?.code ? ` (${promo.code})` : ""}</span>
              <strong>
                {promoDiscountAmount > 0
                  ? `-${formatCurrency(promoDiscountAmount)}`
                  : formatCurrency(0)}
              </strong>
            </div>
          ) : null}

          <div className="promotions-summary-total-row promotions-summary-total-row-grand">
            <span>Grand Total</span>
            <strong>{formatCurrency(grandTotal)}</strong>
          </div>
        </div>

        {termsText ? <p className="promotions-terms">{termsText}</p> : null}

        <div className="promotions-actions">
          <SeatSelectionButton variant="secondary" onClick={onBack}>
            {backLabel}
          </SeatSelectionButton>
          <SeatSelectionButton variant="primary" onClick={onContinue} disabled={continueDisabled}>
            {continueLabel}
          </SeatSelectionButton>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="promotions-status">
        <p>Loading booking flow...</p>
      </section>
    );
  }

  if (error || !preview) {
    return (
      <section className="promotions-status promotions-status-error">
        <p>{error || "Booking flow data is unavailable."}</p>
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
                <strong>{stageTitle}</strong>
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

          {isPromotionsStage ? (
            <>
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

              {renderOrderSummarySection({
                backLabel: "BACK TO SEATS",
                onBack: () => navigateToHash("seat-selection"),
                continueLabel: "CONTINUE",
                onContinue: () => {
                  persistSessionPatch({ stage: "addons" });
                  navigateToHash("addons");
                },
                termsText: "By clicking on continue, you agree to all terms and conditions of the promotion(s) applied."
              })}
            </>
          ) : null}

          {isAddOnsStage ? (
            <>
              <section className="promotions-panel">
                <h2>Add Ons</h2>

                <div className="promotions-addons-rails">
                  <div className="promotions-addons-rail-group">
                    <h3>Ala Carte</h3>
                    {alaCarteAddOns.length ? (
                      <CardRail label="Ala Carte Add-ons" className="promotions-addons-rail">
                        {alaCarteAddOns.map((addOn) => (
                          <AddOnCard
                            key={addOn.id}
                            addOn={addOn}
                            selectedQty={addOnQtyById.get(addOn.id) || 0}
                            onSelect={handleOpenAddOnModal}
                          />
                        ))}
                      </CardRail>
                    ) : (
                      <p className="promotions-empty">No ala carte add-ons available.</p>
                    )}
                  </div>

                  <div className="promotions-addons-rail-group">
                    <h3>Combos</h3>
                    {comboAddOns.length ? (
                      <CardRail label="Combo Add-ons" className="promotions-addons-rail">
                        {comboAddOns.map((addOn) => (
                          <AddOnCard
                            key={addOn.id}
                            addOn={addOn}
                            selectedQty={addOnQtyById.get(addOn.id) || 0}
                            onSelect={handleOpenAddOnModal}
                          />
                        ))}
                      </CardRail>
                    ) : (
                      <p className="promotions-empty">No combo add-ons available.</p>
                    )}
                  </div>
                </div>
              </section>

              {renderOrderSummarySection({
                backLabel: "BACK TO PROMOS",
                onBack: () => navigateToHash("promotions"),
                continueLabel: "CONTINUE",
                onContinue: () => {
                  persistSessionPatch({ stage: "payment" });
                  navigateToHash("payment");
                }
              })}
            </>
          ) : null}

          {isPaymentStage ? (
            <>
              <section className="promotions-panel promotions-payment-placeholder">
                <h2>Payment</h2>
                <p>Payment stage scaffold is ready. Proceed with payment implementation next.</p>
              </section>

              {renderOrderSummarySection({
                backLabel: "BACK TO ADD ONS",
                onBack: () => navigateToHash("addons"),
                continueLabel: "CONTINUE",
                onContinue: () => null,
                continueDisabled: true
              })}
            </>
          ) : null}
        </div>
      </div>

      {modalAddOn ? (
        <div className="promotions-modal-backdrop promotions-addon-modal-backdrop" role="presentation">
          <div className="promotions-addon-modal" role="dialog" aria-modal="true" aria-labelledby="selectAddOnTitle">
            <div className="promotions-addon-modal-top">
              <h3 id="selectAddOnTitle">Select Add On</h3>
              <button
                type="button"
                className="promotions-addon-modal-close"
                aria-label="Close dialog"
                onClick={handleCloseAddOnModal}
              >
                <i className="bi bi-x-lg" />
              </button>
            </div>

            <div className="promotions-addon-modal-main">
              <div className="promotions-addon-modal-image-wrap">
                <img
                  src={resolveMoviePictureUrl(modalAddOn.image)}
                  alt={modalAddOn.name}
                />
              </div>

              <div className="promotions-addon-modal-content">
                <h4>{modalAddOn.name}</h4>
                <p className="promotions-addon-modal-description">
                  {modalAddOn.description || "Freshly prepared and ready for your movie experience."}
                </p>
                <p className="promotions-addon-modal-price">{formatCurrency(modalAddOn.price)}</p>

                <div className="promotions-addon-modal-qty">
                  <button
                    type="button"
                    onClick={() => setModalQuantity((previous) => Math.max(previous - 1, 0))}
                    aria-label="Decrease quantity"
                  >
                    <i className="bi bi-dash-lg" />
                  </button>
                  <span>{modalQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setModalQuantity((previous) => previous + 1)}
                    aria-label="Increase quantity"
                  >
                    <i className="bi bi-plus-lg" />
                  </button>
                </div>
              </div>
            </div>

            <div className="promotions-addon-modal-actions">
              <SeatSelectionButton
                variant="secondary"
                onClick={handleCloseAddOnModal}
              >
                BACK
              </SeatSelectionButton>
              <SeatSelectionButton
                variant="primary"
                onClick={handleConfirmAddOn}
              >
                ADD TO CART
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}

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

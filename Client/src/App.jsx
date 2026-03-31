import { useEffect, useRef, useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import SeatSelectionButton from "./components/SeatSelectionButton";
import Sidebar from "./components/Sidebar";
import {
  clearBookingPipelineSession,
  hasActiveBookingPipelineSession,
  readBookingPipelineSession
} from "./services/bookingPipeline";
import { releaseBookingHold, releaseBookingHoldBestEffort } from "./services/api";
import Home from "./pages/Home";
import MovieDetails from "./pages/MovieDetails";
import Movies from "./pages/Movies";
import AddOns from "./pages/AddOns";
import Payment from "./pages/Payment";
import PaymentSuccess from "./pages/PaymentSuccess";
import Promotions from "./pages/Promotions";
import SeatSelection from "./pages/SeatSelection";

const FLOW_GUARD_PAGES = new Set(["promotions", "addons", "payment"]);
const BOOKING_REFRESH_RECOVERY_KEY = "cinevillage_booking_refresh_recovery";
const BOOKING_REFRESH_MOVIE_ID_KEY = "cinevillage_booking_refresh_movie_id";

function readClientViewFromHash() {
  const hash = (window.location.hash || "").replace(/^#/, "");

  if (hash.startsWith("seat-selection")) {
    const [, screeningId = ""] = hash.split("/");
    return {
      page: "seat-selection",
      movieId: "",
      screeningId
    };
  }

  if (hash.startsWith("promotions")) {
    const [, screeningId = ""] = hash.split("/");
    return {
      page: "promotions",
      movieId: "",
      screeningId
    };
  }

  if (hash.startsWith("addons")) {
    const [, screeningId = ""] = hash.split("/");
    return {
      page: "addons",
      movieId: "",
      screeningId
    };
  }

  if (hash.startsWith("payment-success")) {
    const [, screeningId = ""] = hash.split("/");
    return {
      page: "payment-success",
      movieId: "",
      screeningId
    };
  }

  if (hash.startsWith("payment")) {
    const [, screeningId = ""] = hash.split("/");
    return {
      page: "payment",
      movieId: "",
      screeningId
    };
  }

  if (hash.startsWith("movie-details")) {
    const [, movieId = ""] = hash.split("/");
    return {
      page: "movie-details",
      movieId,
      screeningId: ""
    };
  }

  if (hash === "movies") {
    return {
      page: "movies",
      movieId: "",
      screeningId: ""
    };
  }

  return {
    page: "home",
    movieId: "",
    screeningId: ""
  };
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [clientView, setClientView] = useState(readClientViewFromHash);
  const [leavePromptOpen, setLeavePromptOpen] = useState(false);
  const [pendingView, setPendingView] = useState(null);
  const [isReleasingHold, setIsReleasingHold] = useState(false);
  const [refreshLossMovieId, setRefreshLossMovieId] = useState("");
  const [refreshLossOpen, setRefreshLossOpen] = useState(false);
  const suppressNextHashChange = useRef(false);

  function getHashForView(view) {
    if (!view || !view.page) return "#";
    if (view.page === "movie-details") return `#movie-details/${view.movieId || ""}`;
    if (view.page === "seat-selection") return `#seat-selection/${view.screeningId || ""}`;
    if (view.page === "promotions") return `#promotions/${view.screeningId || ""}`;
    if (view.page === "addons") return `#addons/${view.screeningId || ""}`;
    if (view.page === "payment") return `#payment/${view.screeningId || ""}`;
    if (view.page === "payment-success") return `#payment-success/${view.screeningId || ""}`;
    if (view.page === "movies") return "#movies";
    return "#";
  }

  useEffect(() => {
    function handleHashChange() {
      if (suppressNextHashChange.current) {
        suppressNextHashChange.current = false;
        return;
      }

      const nextView = readClientViewFromHash();
      const isCurrentGuardPage = FLOW_GUARD_PAGES.has(clientView.page);
      const isLeavingProtectedFlow = !FLOW_GUARD_PAGES.has(nextView.page);
      const isPayToSuccessTransition =
        clientView.page === "payment" && nextView.page === "payment-success";

      if (
        isCurrentGuardPage
        && isLeavingProtectedFlow
        && !isPayToSuccessTransition
        && hasActiveBookingPipelineSession()
      ) {
        setPendingView(nextView);
        setLeavePromptOpen(true);
        suppressNextHashChange.current = true;
        window.location.hash = getHashForView(clientView);
        return;
      }

      setClientView(readClientViewFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [clientView]);

  useEffect(() => {
    const navigationEntry = performance.getEntriesByType("navigation")[0];
    const isReloadNavigation = navigationEntry?.type === "reload";

    if (!isReloadNavigation) {
      window.sessionStorage.removeItem(BOOKING_REFRESH_RECOVERY_KEY);
      window.sessionStorage.removeItem(BOOKING_REFRESH_MOVIE_ID_KEY);
      return;
    }

    if (!FLOW_GUARD_PAGES.has(clientView.page)) {
      window.sessionStorage.removeItem(BOOKING_REFRESH_RECOVERY_KEY);
      window.sessionStorage.removeItem(BOOKING_REFRESH_MOVIE_ID_KEY);
      return;
    }

    const recoveryFlag = window.sessionStorage.getItem(BOOKING_REFRESH_RECOVERY_KEY);
    if (!recoveryFlag) return;
    if (hasActiveBookingPipelineSession()) return;

    const session = readBookingPipelineSession();
    const movieId = (
      session?.movieId ||
      window.sessionStorage.getItem(BOOKING_REFRESH_MOVIE_ID_KEY) ||
      ""
    ).toString().trim();

    setRefreshLossMovieId(movieId);
    setRefreshLossOpen(true);
  }, [clientView.page]);

  useEffect(() => {
    function handlePageHide() {
      if (!FLOW_GUARD_PAGES.has(clientView.page)) return;
      const session = readBookingPipelineSession();
      if (!session) return;
      if (!hasActiveBookingPipelineSession()) return;

      const movieId = (session.movieId || "").toString().trim();
      if (movieId) {
        window.sessionStorage.setItem(BOOKING_REFRESH_MOVIE_ID_KEY, movieId);
      }
      window.sessionStorage.setItem(BOOKING_REFRESH_RECOVERY_KEY, "1");

      if (session.bookingId) {
        releaseBookingHoldBestEffort(session.bookingId);
      }
      clearBookingPipelineSession();
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [clientView.page]);

  async function handleConfirmLeavePipeline() {
    try {
      setIsReleasingHold(true);
      const session = readBookingPipelineSession();
      if (session?.bookingId) {
        await releaseBookingHold(session.bookingId).catch(() => null);
      }
      clearBookingPipelineSession();
      window.sessionStorage.removeItem(BOOKING_REFRESH_RECOVERY_KEY);
      window.sessionStorage.removeItem(BOOKING_REFRESH_MOVIE_ID_KEY);
    } finally {
      setIsReleasingHold(false);
      setLeavePromptOpen(false);

      const next = pendingView || { page: "home", movieId: "", screeningId: "" };
      setPendingView(null);
      window.location.hash = getHashForView(next);
    }
  }

  function handleConfirmRefreshLoss() {
    window.sessionStorage.removeItem(BOOKING_REFRESH_RECOVERY_KEY);
    window.sessionStorage.removeItem(BOOKING_REFRESH_MOVIE_ID_KEY);
    setRefreshLossOpen(false);

    if (refreshLossMovieId) {
      window.location.hash = `#movie-details/${refreshLossMovieId}`;
      return;
    }

    window.location.hash = "#movies";
  }

  return (
    <div className="client-shell">
      <div
        className={`client-backdrop${menuOpen ? " open" : ""}`}
        onClick={() => setMenuOpen(false)}
        aria-hidden="true"
      />

      <Sidebar menuOpen={menuOpen} />

      <div className="client-main">
        <Header menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        <main className="content-wrapper">
          {clientView.page === "seat-selection" ? (
            <SeatSelection screeningId={clientView.screeningId} />
          ) : clientView.page === "promotions" ? (
            <Promotions screeningId={clientView.screeningId} />
          ) : clientView.page === "addons" ? (
            <AddOns screeningId={clientView.screeningId} />
          ) : clientView.page === "payment" ? (
            <Payment screeningId={clientView.screeningId} />
          ) : clientView.page === "payment-success" ? (
            <PaymentSuccess screeningId={clientView.screeningId} />
          ) : clientView.page === "movie-details" ? (
            <MovieDetails movieId={clientView.movieId} />
          ) : clientView.page === "movies" ? (
            <Movies />
          ) : (
            <Home />
          )}
        </main>
        <Footer />
      </div>

      {leavePromptOpen ? (
        <div className="booking-leave-modal-backdrop" role="presentation">
          <div className="booking-leave-modal" role="dialog" aria-modal="true" aria-labelledby="bookingLeaveTitle">
            <button
              type="button"
              className="booking-leave-modal-close"
              aria-label="Close dialog"
              onClick={() => {
                if (isReleasingHold) return;
                setLeavePromptOpen(false);
                setPendingView(null);
              }}
            >
              <i className="bi bi-x-lg" />
            </button>

            <h3 id="bookingLeaveTitle">Are you sure you want to leave?</h3>
            <p>Your current cart will be cleared</p>

            <div className="booking-leave-modal-actions">
              <SeatSelectionButton
                variant="secondary"
                onClick={() => {
                  if (isReleasingHold) return;
                  setLeavePromptOpen(false);
                  setPendingView(null);
                }}
              >
                Cancel
              </SeatSelectionButton>
              <SeatSelectionButton
                variant="primary"
                onClick={handleConfirmLeavePipeline}
                disabled={isReleasingHold}
              >
                {isReleasingHold ? "Confirming..." : "Confirm"}
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}

      {refreshLossOpen ? (
        <div className="booking-leave-modal-backdrop" role="presentation">
          <div className="booking-leave-modal" role="dialog" aria-modal="true" aria-labelledby="bookingRefreshLossTitle">
            <h3 id="bookingRefreshLossTitle">Booking Session Lost</h3>
            <p>
              Your booking process data was cleared after refresh.
              You will be redirected to movie details to start again.
            </p>
            <div className="booking-leave-modal-actions">
              <SeatSelectionButton variant="primary" onClick={handleConfirmRefreshLoss}>
                Confirm
              </SeatSelectionButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

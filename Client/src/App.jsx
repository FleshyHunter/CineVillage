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
import Promotions from "./pages/Promotions";
import SeatSelection from "./pages/SeatSelection";

const FLOW_GUARD_PAGES = new Set(["promotions", "addons", "payment"]);

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
  const suppressNextHashChange = useRef(false);

  function getHashForView(view) {
    if (!view || !view.page) return "#";
    if (view.page === "movie-details") return `#movie-details/${view.movieId || ""}`;
    if (view.page === "seat-selection") return `#seat-selection/${view.screeningId || ""}`;
    if (view.page === "promotions") return `#promotions/${view.screeningId || ""}`;
    if (view.page === "addons") return `#addons/${view.screeningId || ""}`;
    if (view.page === "payment") return `#payment/${view.screeningId || ""}`;
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

      if (isCurrentGuardPage && isLeavingProtectedFlow && hasActiveBookingPipelineSession()) {
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
    function handleBeforeUnload(event) {
      if (!FLOW_GUARD_PAGES.has(clientView.page)) return;
      if (!hasActiveBookingPipelineSession()) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handlePageHide() {
      if (!FLOW_GUARD_PAGES.has(clientView.page)) return;
      const session = readBookingPipelineSession();
      if (!session?.bookingId) return;
      if (!hasActiveBookingPipelineSession()) return;

      releaseBookingHoldBestEffort(session.bookingId);
      clearBookingPipelineSession();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
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
    } finally {
      setIsReleasingHold(false);
      setLeavePromptOpen(false);

      const next = pendingView || { page: "home", movieId: "", screeningId: "" };
      setPendingView(null);
      window.location.hash = getHashForView(next);
    }
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
            <Promotions screeningId={clientView.screeningId} flowStage="promotions" />
          ) : clientView.page === "addons" ? (
            <Promotions screeningId={clientView.screeningId} flowStage="addons" />
          ) : clientView.page === "payment" ? (
            <Promotions screeningId={clientView.screeningId} flowStage="payment" />
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
    </div>
  );
}

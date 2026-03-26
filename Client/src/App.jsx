import { useEffect, useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import MovieDetails from "./pages/MovieDetails";
import Movies from "./pages/Movies";
import SeatSelection from "./pages/SeatSelection";

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

  useEffect(() => {
    function handleHashChange() {
      setClientView(readClientViewFromHash());
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

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
    </div>
  );
}

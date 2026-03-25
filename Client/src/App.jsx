import { useEffect, useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";
import MovieDetails from "./pages/MovieDetails";
import Movies from "./pages/Movies";

function readClientViewFromHash() {
  const hash = (window.location.hash || "").replace(/^#/, "");

  if (hash.startsWith("movie-details")) {
    const [, movieId = ""] = hash.split("/");
    return {
      page: "movie-details",
      movieId
    };
  }

  if (hash === "movies") {
    return {
      page: "movies",
      movieId: ""
    };
  }

  return {
    page: "home",
    movieId: ""
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
          {clientView.page === "movie-details" ? (
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

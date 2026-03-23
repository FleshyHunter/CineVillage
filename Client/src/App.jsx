import { useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import Home from "./pages/Home";

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);

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
          <Home />
        </main>
        <Footer />
      </div>
    </div>
  );
}

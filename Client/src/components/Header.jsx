import "./Header.css";
import Icon from "./Icon";
import { useAccount } from "../context/AccountContext";

function getInitials(name) {
  const tokens = (name || "").toString().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return "CV";
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return `${tokens[0][0] || ""}${tokens[1][0] || ""}`.toUpperCase();
}

export default function Header({ menuOpen, setMenuOpen }) {
  const { user, isAuthenticated } = useAccount();
  const displayName = (user?.name || "Guest").toString().trim() || "Guest";
  const initials = getInitials(displayName);

  return (
    <header className="page-header">
      <div className="page-header-left">
        <button
          type="button"
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle navigation"
        >
          <Icon name="menu" />
        </button>

        
      </div>

      <div className="page-header-right">
        <button
          className="header-account"
          type="button"
          onClick={() => { window.location.hash = isAuthenticated ? "#profile" : "#login"; }}
        >
          <span className="header-account-avatar">{initials}</span>
          <span className="header-account-text">
            <strong>{displayName}</strong>
          </span>
        </button>
      </div>
    </header>
  );
}

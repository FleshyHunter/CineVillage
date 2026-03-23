import "./Header.css";
import Icon from "./Icon";

export default function Header({ menuOpen, setMenuOpen }) {
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
        <button className="header-action-btn" type="button" aria-label="Search">
          <Icon name="search" />
        </button>
        <button className="header-action-btn" type="button" aria-label="Notifications">
          <Icon name="bell" />
        </button>
        <button className="header-account" type="button">
          <span className="header-account-avatar">AL</span>
          <span className="header-account-text">
            <strong>Amelia Lee</strong>
            <small>Gold Member</small>
          </span>
        </button>
      </div>
    </header>
  );
}

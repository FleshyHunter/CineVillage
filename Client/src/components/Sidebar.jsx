import "./Sidebar.css";

const primaryNav = [
  { label: "Home", icon: "bi-grid-1x2", href: "#" },
  { label: "Movies", icon: "bi-film", href: "#movies" },
  { label: "Coming Soon", icon: "bi-stars", href: "#" },
  { label: "My Tickets", icon: "bi-ticket-perforated", href: "#" },
  { label: "Profile", icon: "bi-person-circle", href: "#" }
];

const serviceNav = [
  { label: "Cinema Deals", icon: "bi-gift", href: "#" },
  { label: "Food & Drinks", icon: "bi-cup-straw", href: "#" },
  { label: "Help Centre", icon: "bi-shield-lock", href: "#" }
];

function NavLink({ item, activeHash }) {
  const isActive = item.href === "#"
    ? activeHash === ""
    : item.href === `#${activeHash}`;

  return (
    <a className={`sidebar-link${isActive ? " active" : ""}`} href={item.href}>
      <i className={`bi ${item.icon}`} aria-hidden="true"></i>
      <span>{item.label}</span>
    </a>
  );
}

export default function Sidebar({ menuOpen }) {
  const activeHash = (window.location.hash || "").replace(/^#/, "");

  return (
    <aside className={`client-sidebar${menuOpen ? " open" : ""}`}>
      <button className="sidebar-brand" type="button">
        <img src="/CVLogo2.png" alt="CineVillage logo" className="sidebar-brand-logo" />
        <div className="sidebar-brand-copy">
          <strong className="sidebar-title">CineVillage</strong>
          <span className="sidebar-subtitle">Client Experience</span>
        </div>
      </button>

      <div className="sidebar-nav-group">
        <div className="sidebar-nav-label">Main</div>
        {primaryNav.map((item) => (
          <NavLink key={item.label} item={item} activeHash={activeHash} />
        ))}
      </div>

      <div className="sidebar-nav-group">
        <div className="sidebar-nav-label sidebar-nav-label-management">Services</div>
        {serviceNav.map((item) => (
          <NavLink key={item.label} item={item} activeHash={activeHash} />
        ))}
      </div>

      <a className="sidebar-logout-btn" href="#">
        <i className="bi bi-box-arrow-right" aria-hidden="true"></i>
        <span>Sign Out</span>
      </a>
    </aside>
  );
}

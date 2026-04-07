import "./Sidebar.css";
import { useAccount } from "../context/AccountContext";

const primaryNav = [
  { label: "Home", icon: "bi-grid-1x2", href: "#" },
  { label: "Movies", icon: "bi-film", href: "#movies", matchPrefixes: ["movies"] }
];

const hallTypeNav = [
  { label: "Standard", icon: "bi-display", href: "#movies/standard", matchPrefixes: ["movies/standard"] },
  { label: "IMAX", icon: "bi-badge-4k", href: "#movies/imax", matchPrefixes: ["movies/imax"] },
  { label: "VIP", icon: "bi-star", href: "#movies/vip", matchPrefixes: ["movies/vip"] }
];

const accountNav = [
  {
    label: "Profile",
    icon: "bi-person-circle",
    href: "#profile",
    matchPrefixes: ["profile"]
  },
  {
    label: "My Tickets",
    icon: "bi-ticket-perforated",
    href: "#my-tickets",
    matchPrefixes: ["my-tickets", "ticket/"]
  }
];

const serviceNav = [
  { label: "Promotions", icon: "bi-gift", href: "#promotions-list", matchPrefixes: ["promotions-list"] },
  { label: "Add Ons", icon: "bi-cup-straw", href: "#addons-list", matchPrefixes: ["addons-list"] },
  { label: "Help Centre", icon: "bi-shield-lock", href: "#" }
];

const navSections = [
  { key: "main", title: "Main", items: primaryNav },
  { key: "account", title: "Account", items: accountNav },
  { key: "hall-type", title: "Hall Type", items: hallTypeNav }
];

function NavLink({ item, activeHash }) {
  const prefixes = Array.isArray(item.matchPrefixes) ? item.matchPrefixes : [];

  const isActive = item.href === "#"
    ? activeHash === ""
    : (
      item.href === `#${activeHash}`
      || prefixes.some((prefix) => activeHash.startsWith(prefix))
    );

  return (
    <a className={`sidebar-link${isActive ? " active" : ""}`} href={item.href}>
      <i className={`bi ${item.icon}`} aria-hidden="true"></i>
      <span>{item.label}</span>
    </a>
  );
}

function SidebarSection({ title, items, activeHash }) {
  return (
    <div className="sidebar-nav-group">
      <div className="sidebar-nav-label sidebar-nav-label-management">{title}</div>
      <div className="sidebar-nav-items" role="list">
        {items.map((item) => (
          <NavLink key={item.label} item={item} activeHash={activeHash} />
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({ menuOpen }) {
  const { isAuthenticated, logoutCustomer } = useAccount();
  const activeHash = (window.location.hash || "")
    .replace(/^#/, "")
    .replace(/^\/+/, "")
    .split("?")[0]
    .trim();

  return (
    <aside className={`client-sidebar${menuOpen ? " open" : ""}`}>
      <div className="sidebar-zone sidebar-zone-primary">
        <button className="sidebar-brand d-flex align-items-center gap-3 w-100 text-start" type="button">
          <img src="/CVLogo2.png" alt="CineVillage logo" className="sidebar-brand-logo flex-shrink-0" />
          <div className="sidebar-brand-copy d-flex flex-column justify-content-center">
            <strong className="sidebar-title fw-bold">CineVillage</strong>
            <p className="sidebar-subtitle">Customer Console</p>
          </div>
        </button>

        <div className="sidebar-sections-stack">
          {navSections.map((section) => (
            <SidebarSection
              key={section.key}
              title={section.title}
              items={section.items}
              activeHash={activeHash}
            />
          ))}
        </div>
      </div>

      <div className="sidebar-zone sidebar-zone-secondary">
        <SidebarSection title="Services" items={serviceNav} activeHash={activeHash} />

        <a
          className="sidebar-logout-btn"
          href="#login"
          onClick={(event) => {
            if (!isAuthenticated) return;
            event.preventDefault();
            void logoutCustomer();
            window.location.hash = "#login";
          }}
        >
          <i className="bi bi-box-arrow-right" aria-hidden="true"></i>
          <span>{isAuthenticated ? "Sign Out" : "Sign In"}</span>
        </a>
      </div>
    </aside>
  );
}

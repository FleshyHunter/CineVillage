const icons = {
  menu: (
    <path
      d="M4 7h16M4 12h16M4 17h16"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
    />
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" />
    </>
  ),
  film: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4" />
    </>
  ),
  spark: (
    <path d="M12 3l2.3 5.7L20 11l-5.7 2.3L12 19l-2.3-5.7L4 11l5.7-2.3L12 3z" />
  ),
  ticket: (
    <path d="M5 8.5A2.5 2.5 0 017.5 6H18a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H7.5A2.5 2.5 0 015 15.5V8.5zM10 8v8" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19a6.5 6.5 0 0113 0" />
    </>
  ),
  gift: (
    <>
      <path d="M4 10h16v10H4z" />
      <path d="M12 10v10M4 7.5h16V10H4z" />
      <path d="M12 7.5H9.2A2.2 2.2 0 119.2 3c1.8 0 2.8 2.1 2.8 4.5zM12 7.5h2.8A2.2 2.2 0 1014.8 3C13 3 12 5.1 12 7.5z" />
    </>
  ),
  cup: (
    <>
      <path d="M6 7h9v5.5A4.5 4.5 0 0110.5 17h0A4.5 4.5 0 016 12.5V7z" />
      <path d="M15 8h1.5A2.5 2.5 0 0119 10.5h0A2.5 2.5 0 0116.5 13H15" />
      <path d="M8 20h5" />
    </>
  ),
  shield: (
    <path d="M12 3l7 2.8v5.5c0 4.1-2.5 7.9-7 9.7-4.5-1.8-7-5.6-7-9.7V5.8L12 3zM9.4 12l1.7 1.7 3.8-4.2" />
  ),
  bell: (
    <>
      <path d="M7.5 9.5a4.5 4.5 0 119 0v2.1c0 .9.3 1.8.9 2.5l.7.9H5.9l.7-.9c.6-.7.9-1.6.9-2.5V9.5z" />
      <path d="M10 17a2 2 0 004 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="5.5" />
      <path d="M16 16l4 4" />
    </>
  )
};

export default function Icon({ name }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true">{icons[name]}</svg>;
}

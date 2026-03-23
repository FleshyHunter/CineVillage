import MovieCard from "../components/MovieCard";
import MovieRail from "../components/MovieRail";
import ShowcaseCard from "../components/ShowcaseCard";
import ViewportSection from "../components/ViewportSection";
import "./Home.css";

const showcaseContent = {
  primary: {
    title: "Project Hail Mary",
    label: "Filmed For IMAX",
    image: "/posters/1772217186311.png"
  },
  secondary: {
    title: "Premium Format",
    label: "Get Tickets",
    image: "/posters/1772115896382.png"
  },
  promoLeft: {
    title: "Dining Promos",
    label: "Because The Best Stories Begin Over Food",
    image: "/posters/1772112984533.png"
  },
  promoRight: {
    title: "Centro Opening Soon",
    label: "Opening Soon",
    image: "/posters/1772257424508.jpeg"
  }
};

const sections = [
  {
    title: "Now Showing",
    movies: [
      { title: "Dr. No", badge: "Restored", image: "/posters/1772107299702.png" },
      { title: "Hoppers", badge: "Family Pick", image: "/posters/1772206263926.png" },
      { title: "Double Happiness", badge: "Shaw Exclusive", image: "/posters/1772256439544.jpg" },
      { title: "How To Make A Killing", badge: "New Release", image: "/posters/1772256749457.jpeg" },
      { title: "Kong Tao", badge: "New Release", image: "/posters/1772465572293.jpeg" },
      { title: "Project Hail Mary", badge: "Also In IMAX", image: "/posters/1773146767583.png" },
      { title: "Midnight Signal", badge: "Hot Pick", image: "/posters/1773329715188.png" }
    ]
  },
  {
    title: "Advance Sales",
    movies: [
      { title: "BTS World Tour", badge: "Advance Sales", image: "/posters/1772256439544.jpg" },
      { title: "Power To The People", badge: "Advance Sales", image: "/posters/1772465572293.jpeg" },
      { title: "Encore Broadcast", badge: "Advance Sales", image: "/posters/1773146767583.png" },
      { title: "IMAX Fan Event", badge: "Advance Sales", image: "/posters/1773329715188.png" },
      { title: "Premiere Night", badge: "Advance Sales", image: "/posters/1772256749457.jpeg" },
      { title: "Galaxy Concert", badge: "Advance Sales", image: "/posters/1772107299702.png" },
      { title: "Midnight Session", badge: "Advance Sales", image: "/posters/1772206263926.png" }
    ]
  },
  {
    title: "Coming Soon",
    movies: [
      { title: "Centro", badge: "Opening Soon", image: "/posters/1772257424508.jpeg" },
      { title: "Quiet Rooms", badge: "Coming Soon", image: "/posters/1772256584619.jpeg" },
      { title: "Neon Arrival", badge: "Coming Soon", image: "/posters/1772465874144.jpeg" },
      { title: "Red Lantern", badge: "Coming Soon", image: "/posters/1772256749457.jpeg" },
      { title: "Blue Orbit", badge: "Coming Soon", image: "/posters/1773146767583.png" },
      { title: "Blackout", badge: "Coming Soon", image: "/posters/1772465572293.jpeg" },
      { title: "Aurora Line", badge: "Coming Soon", image: "/posters/1773329715188.png" }
    ]
  }
];

export default function Home() {
  return (
    <div className="home-page">
      <section className="home-showcase">
        <div className="showcase-primary-grid">
          <ShowcaseCard item={showcaseContent.primary} className="showcase-card showcase-card-main" />
          <ShowcaseCard item={showcaseContent.secondary} className="showcase-card showcase-card-side" />
        </div>

        <div className="showcase-secondary-grid">
          <ShowcaseCard item={showcaseContent.promoLeft} className="showcase-card showcase-card-strip" />
          <ShowcaseCard item={showcaseContent.promoRight} className="showcase-card showcase-card-promo" />
        </div>
      </section>

      {sections.map((section, index) => (
        <ViewportSection
          key={section.title}
          className="movie-rail-section fade-in-panel"
          style={{ "--fade-delay": `${0.14 + index * 0.1}s` }}
          estimatedHeight={395}
        >
          <div className="rail-heading">
            <h2>{section.title}</h2>
          </div>

          <MovieRail label={section.title}>
            {section.movies.map((movie) => (
              <MovieCard key={`${section.title}-${movie.title}`} movie={movie} />
            ))}
          </MovieRail>
        </ViewportSection>
      ))}
    </div>
  );
}

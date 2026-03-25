import "./MovieCard.css";

export default function MovieCard({ movie }) {
  const actionLabel = movie.badge === "Coming Soon" ? "MORE" : "BUY";
  const detailsHref = movie._id ? `#movie-details/${movie._id}` : "#movie-details";

  return (
    <article className="movie-card" role="listitem">
      <div className="movie-card-poster">
        <img src={movie.image} alt={movie.title} loading="lazy" />
        <span className="movie-card-badge">{movie.badge}</span>
        <div className="movie-card-hover">
          <div className="movie-card-hover-top">
            <h3>{movie.title}</h3>
            <div className="movie-card-hover-line" aria-hidden="true" />
            <p className="movie-card-hover-meta">
              <span>{movie.durationText}</span>
              <span>|</span>
              <span>{movie.ratingText}</span>
            </p>
            <p className="movie-card-hover-description">
              {movie.description || "Tickets available now at CineVillage."}
            </p>
          </div>
          <a href={detailsHref} className="movie-card-buy-btn">
            {actionLabel}
          </a>
        </div>
      </div>
    </article>
  );
}

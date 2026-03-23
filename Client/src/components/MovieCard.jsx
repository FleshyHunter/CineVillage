import "./MovieCard.css";

export default function MovieCard({ movie }) {
  return (
    <article className="movie-card" role="listitem">
      <div className="movie-card-poster">
        <img src={movie.image} alt={movie.title} loading="lazy" />
        <span className="movie-card-badge">{movie.badge}</span>
      </div>
      <div className="movie-card-copy">
        <h3>{movie.title}</h3>
      </div>
    </article>
  );
}

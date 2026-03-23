import "./ShowcaseCard.css";

export default function ShowcaseCard({ item, className }) {
  return (
    <article className={className}>
      <img src={item.image} alt={item.title} />
      <div className="showcase-card-overlay">
        <span>{item.label}</span>
        <h2>{item.title}</h2>
      </div>
    </article>
  );
}

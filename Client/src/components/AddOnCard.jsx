import { resolveMoviePictureUrl } from "../services/api";
import "./AddOnCard.css";

function formatCurrency(amount) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "SGD 0.00";

  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD"
  }).format(numeric);
}

export default function AddOnCard({ addOn, selectedQty = 0, onSelect }) {
  const addOnName = (addOn?.name || "Add-on").toString();
  const addOnPrice = Number(addOn?.price) || 0;
  const addOnImage = resolveMoviePictureUrl(addOn?.image || addOn?.pictureUrl || "");

  return (
    <article className="addon-card-shell" role="listitem">
      <button
        type="button"
        className="addon-card-btn"
        onClick={() => onSelect?.(addOn)}
        aria-label={`Select add-on ${addOnName}`}
      >
        <div className="addon-card-media">
          <img src={addOnImage} alt={addOnName} loading="lazy" />
          <span className="addon-card-price">{formatCurrency(addOnPrice)}</span>
          {selectedQty > 0 ? <span className="addon-card-qty">In Cart: {selectedQty}</span> : null}
        </div>
        <div className="addon-card-body">
          <h3>{addOnName}</h3>
        </div>
      </button>
    </article>
  );
}

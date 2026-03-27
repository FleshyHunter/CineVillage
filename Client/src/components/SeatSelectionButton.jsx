import "./SeatSelectionButton.css";

function joinClasses(...values) {
  return values.filter(Boolean).join(" ");
}

export default function SeatSelectionButton({
  type = "button",
  variant = "primary",
  size = "md",
  className = "",
  children,
  ...rest
}) {
  return (
    <button
      type={type}
      className={joinClasses(
        "seat-selection-btn",
        `seat-selection-btn-${variant}`,
        `seat-selection-btn-${size}`,
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

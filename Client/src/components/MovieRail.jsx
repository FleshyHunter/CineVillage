import { useRef } from "react";

export default function MovieRail({ children, label }) {
  const railRef = useRef(null);
  const dragStateRef = useRef({
    isDragging: false,
    startX: 0,
    startScrollLeft: 0
  });

  function handleWheel(event) {
    const rail = railRef.current;
    if (!rail) return;

    const hasOverflow = rail.scrollWidth > rail.clientWidth;
    if (!hasOverflow) return;

    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

    rail.scrollLeft += event.deltaY;
    event.preventDefault();
  }

  function handlePointerDown(event) {
    const rail = railRef.current;
    if (!rail) return;
    if (event.target.closest("a, button")) return;

    dragStateRef.current = {
      isDragging: true,
      startX: event.clientX,
      startScrollLeft: rail.scrollLeft
    };

    rail.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    const rail = railRef.current;
    const dragState = dragStateRef.current;

    if (!rail || !dragState.isDragging) return;

    const deltaX = event.clientX - dragState.startX;
    rail.scrollLeft = dragState.startScrollLeft - deltaX;
  }

  function handlePointerUp(event) {
    const rail = railRef.current;
    if (!rail) return;

    dragStateRef.current.isDragging = false;
    rail.releasePointerCapture?.(event.pointerId);
  }

  return (
    <div
      ref={railRef}
      className="movie-rail"
      role="list"
      aria-label={label}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {children}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

export default function ViewportSection({
  children,
  className = "",
  style,
  estimatedHeight = 0,
  rootMargin = "0px",
  threshold = 0
}) {
  const sectionRef = useRef(null);
  const contentRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  const [cachedHeight, setCachedHeight] = useState(estimatedHeight);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      {
        root: null,
        rootMargin,
        threshold
      }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [rootMargin, threshold]);

  useEffect(() => {
    if (!isVisible || !contentRef.current) return undefined;

    const updateHeight = () => {
      const rect = contentRef.current?.getBoundingClientRect();
      if (rect?.height) setCachedHeight(rect.height);
    };

    updateHeight();

    if (typeof ResizeObserver === "undefined") return undefined;

    const resizeObserver = new ResizeObserver(() => {
      updateHeight();
    });

    resizeObserver.observe(contentRef.current);
    return () => resizeObserver.disconnect();
  }, [isVisible]);

  return (
    <section ref={sectionRef} className={className} style={style}>
      {isVisible ? (
        <div ref={contentRef} className="viewport-section-content">
          {children}
        </div>
      ) : (
        <div
          className="viewport-section-placeholder"
          style={{ height: cachedHeight }}
          aria-hidden="true"
        />
      )}
    </section>
  );
}

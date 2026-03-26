import { useEffect, useState } from "react";
import ViewportSection from "../components/ViewportSection";
import {
  fetchMovieById,
  fetchMovies,
  resolveMoviePictureUrl
} from "../services/api";
import "./MovieDetails.css";

function formatDuration(duration) {
  const minutes = Number.parseInt(duration, 10);
  if (!Number.isFinite(minutes) || minutes <= 0) return "N/A";

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  if (!hours) return `${minutes} mins`;
  if (!remainder) return `${hours} hr`;
  return `${hours} hr ${remainder} mins`;
}

function formatReleaseDate(releaseDate) {
  if (!releaseDate) return "N/A";

  const parsed = new Date(releaseDate);
  if (Number.isNaN(parsed.getTime())) return "N/A";

  return parsed.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getAdvisoryText(movie) {
  const advisoryByAge = {
    G: "Suitable for General Audiences",
    PG: "Parental Guidance Advised",
    PG13: "Some Coarse Language",
    NC16: "Violence and Mature Themes",
    M18: "Mature Content",
    R21: "Restricted to Adults"
  };

  if (movie?.ageRestriction && advisoryByAge[movie.ageRestriction]) {
    return advisoryByAge[movie.ageRestriction];
  }

  return "Viewer discretion advised";
}

function splitTextLines(value) {
  return (value || "")
    .toString()
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildDateTab(date, today) {
  const isoDate = toIsoDate(date);
  const diffDays = Math.round((startOfDay(date) - startOfDay(today)) / 86_400_000);

  return {
    isoDate,
    dayNumber: date.toLocaleDateString("en-GB", { day: "2-digit" }),
    monthShort: date.toLocaleDateString("en-GB", { month: "short" }),
    relativeLabel:
      diffDays === 0
        ? "TODAY"
        : diffDays === 1
          ? "TOMORROW"
          : date.toLocaleDateString("en-GB", { weekday: "short" }).toUpperCase()
  };
}

function formatIsoDateLabel(isoDate) {
  if (!isoDate) return "";

  const parsed = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";

  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function buildShowtimeTypeGroups(day) {
  if (!day?.halls?.length) return [];

  const typeMap = new Map();

  day.halls.forEach((hall) => {
    (hall.hallTypeGroups || []).forEach((group) => {
      if (!typeMap.has(group.hallType)) {
        typeMap.set(group.hallType, []);
      }

      group.showtimes.forEach((showtime) => {
        typeMap.get(group.hallType).push({
          ...showtime,
          hallName: hall.hallName
        });
      });
    });
  });

  const preferredOrder = ["Standard", "IMAX", "VIP"];

  return [...typeMap.entries()]
    .map(([hallType, showtimes]) => ({
      hallType,
      showtimes: showtimes.sort((a, b) => {
        if (a.time === b.time) return a.hallName.localeCompare(b.hallName);
        return a.time.localeCompare(b.time);
      })
    }))
    .sort((a, b) => {
      const indexA = preferredOrder.indexOf(a.hallType);
      const indexB = preferredOrder.indexOf(b.hallType);
      const safeA = indexA === -1 ? preferredOrder.length : indexA;
      const safeB = indexB === -1 ? preferredOrder.length : indexB;
      if (safeA !== safeB) return safeA - safeB;
      return a.hallType.localeCompare(b.hallType);
    });
}

function getShowtimeTypeIcon(hallType) {
  if (hallType === "Standard") return "bi-display";
  if (hallType === "IMAX") return "bi-badge-4k";
  if (hallType === "VIP") return "bi-star";
  return "bi-grid-3x3-gap";
}

function getSeatPreviewAisleColumns(hall) {
  return new Set(
    (hall?.aisleColumns || [])
      .map((column) => Number.parseInt(column, 10))
      .filter((column) => Number.isInteger(column) && column >= 0)
  );
}

function shouldInsertWingLaneAfterColumn(column, columns, wingColumns, aisleColumns) {
  if (wingColumns <= 0 || wingColumns >= columns) return false;

  const leftBoundaryColumn = wingColumns - 1;
  const rightBoundaryColumn = columns - wingColumns - 1;
  const nextColumn = column + 1;

  if (column !== leftBoundaryColumn && column !== rightBoundaryColumn) return false;
  if (nextColumn >= columns) return false;
  if (aisleColumns.has(column) || aisleColumns.has(nextColumn)) return false;

  return true;
}

function buildSeatPreviewRows(hall) {
  const rows = Number.parseInt(hall?.rows, 10) || 0;
  const columns = Number.parseInt(hall?.columns, 10) || 0;
  const wingColumns = Number.parseInt(hall?.wingColumns, 10) || 0;
  const seatConfig = hall?.seatConfig || {};
  const aisleColumns = getSeatPreviewAisleColumns(hall);

  if (!rows || !columns) return [];

  return Array.from({ length: rows }, (_, rowIndex) => {
    const rowLabel = String.fromCharCode(65 + rowIndex);
    const cells = [];

    for (let col = 0; col < columns; col += 1) {
      if (aisleColumns.has(col)) {
        cells.push({
          key: `lane-${rowIndex}-${col}`,
          kind: "lane"
        });
      } else {
        const seatState = seatConfig[`${rowIndex}-${col}`] || "normal";

        cells.push({
          key: `seat-${rowIndex}-${col}`,
          kind: "seat",
          state: seatState
        });
      }

      if (shouldInsertWingLaneAfterColumn(col, columns, wingColumns, aisleColumns)) {
        cells.push({
          key: `wing-lane-${rowIndex}-${col}`,
          kind: "lane"
        });
      }
    }

    return {
      key: `row-${rowIndex}`,
      label: rowLabel,
      cells
    };
  });
}

export default function MovieDetails({ movieId = "" }) {
  const [movie, setMovie] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeShowtimeDate, setActiveShowtimeDate] = useState("");
  const [weekStartDate, setWeekStartDate] = useState(() => startOfDay(new Date()));
  const [selectedScreeningPreview, setSelectedScreeningPreview] = useState(null);
  const [seatPreviewLoading, setSeatPreviewLoading] = useState(false);
  const [seatPreviewError, setSeatPreviewError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadMovie() {
      try {
        setLoading(true);
        setError("");

        let selectedMovie = null;

        if (movieId) {
          selectedMovie = await fetchMovieById(movieId);
        } else {
          const items = await fetchMovies({ limit: 1 });
          const firstMovieId = items[0]?._id;
          selectedMovie = firstMovieId ? await fetchMovieById(firstMovieId) : null;
        }

        if (!isActive) return;

        if (!selectedMovie) {
          setError("No movie is available for preview.");
          setMovie(null);
          return;
        }

        setMovie(selectedMovie);
      } catch (loadError) {
        if (!isActive) return;
        setError(loadError.message || "Failed to load movie details");
        setMovie(null);
      } finally {
        if (isActive) setLoading(false);
      }
    }

    loadMovie();

    return () => {
      isActive = false;
    };
  }, [movieId]);

  useEffect(() => {
    const todayIso = toIsoDate(startOfDay(new Date()));
    const firstMovieDate = movie?.showtimes?.[0]?.isoDate || "";
    setActiveShowtimeDate(firstMovieDate || todayIso);
    setWeekStartDate(startOfDay(new Date()));
    setSelectedScreeningPreview(null);
    setSeatPreviewError("");
  }, [movie]);

  if (loading) {
    return (
      <section className="movie-details-status-panel">
        <p>Loading movie details...</p>
      </section>
    );
  }

  if (error || !movie) {
    return (
      <section className="movie-details-status-panel movie-details-status-panel-error">
        <p>{error || "Movie not found."}</p>
      </section>
    );
  }

  const posterUrl = resolveMoviePictureUrl(movie.pictureUrl);
  const advisoryText = getAdvisoryText(movie);
  const synopsisLines = splitTextLines(movie.description);
  const trailerEmbedUrl = (movie.trailer?.embedUrl || "").toString().trim();
  const trailerWatchUrl = (movie.trailer?.watchUrl || "").toString().trim();
  const showtimeDays = Array.isArray(movie.showtimes) ? movie.showtimes : [];
  const emptyShowtimeMessage = movie.status === "Coming Soon"
    ? "Upcoming screenings coming soon."
    : "No upcoming screenings are available for this movie yet.";
  const today = startOfDay(new Date());
  const minCalendarDate = toIsoDate(today);
  const maxCalendarDate = toIsoDate(addMonths(today, 3));
  const maxWeekStartDate = startOfDay(addDays(addMonths(today, 3), -7));
  const visibleDateTabs = Array.from({ length: 8 }, (_, index) =>
    buildDateTab(addDays(weekStartDate, index), today)
  );
  const activeShowtimeDay = showtimeDays.find((day) => day.isoDate === activeShowtimeDate) || null;
  const activeShowtimeTypeGroups = buildShowtimeTypeGroups(activeShowtimeDay);
  const canGoToPreviousWeek = weekStartDate > today;
  const canGoToNextWeek = weekStartDate < maxWeekStartDate;
  const activeVisibleDateTab = visibleDateTabs.find((day) => day.isoDate === activeShowtimeDate) || null;
  const selectedShowtimeDateLabel = activeShowtimeDay?.fullDate || activeVisibleDateTab?.fullDate || formatIsoDateLabel(activeShowtimeDate);

  function handleCalendarChange(event) {
    const pickedValue = (event.target.value || "").trim();
    if (!pickedValue) return;

    const pickedDate = startOfDay(new Date(`${pickedValue}T00:00:00`));
    setWeekStartDate(pickedDate);
    setActiveShowtimeDate(pickedValue);
  }

  function openCalendarPicker() {
    const picker = document.getElementById("movieShowtimesDatePicker");
    if (!picker) return;

    if (typeof picker.showPicker === "function") {
      picker.showPicker();
      return;
    }

    picker.focus();
    picker.click();
  }

  function shiftDateWindow(days) {
    const nextStart = startOfDay(addDays(weekStartDate, days));

    if (nextStart < today) {
      setWeekStartDate(today);
      setActiveShowtimeDate(toIsoDate(today));
      return;
    }

    if (nextStart > maxWeekStartDate) {
      setWeekStartDate(maxWeekStartDate);
      setActiveShowtimeDate(toIsoDate(maxWeekStartDate));
      return;
    }

    setWeekStartDate(nextStart);
    setActiveShowtimeDate(toIsoDate(nextStart));
  }

  function handleSelectShowtime(showtime) {
    if (!showtime?.screeningId) return;

    window.location.hash = `#seat-selection/${showtime.screeningId}`;
  }

  const selectedScreeningRows = buildSeatPreviewRows(selectedScreeningPreview?.hall);

  return (
    <section className="movie-details-page">
      <div className="movie-details-hero">
        <div
          className="movie-details-stage"
          style={{ "--movie-hero-image": `url("${posterUrl}")` }}
        >
          {trailerEmbedUrl ? (
            <div className="movie-details-stage-video-wrap" aria-hidden="true">
              <iframe
                className="movie-details-stage-video"
                src={trailerEmbedUrl}
                title={`${movie.name || "Movie"} trailer background`}
                allow="autoplay; encrypted-media; picture-in-picture"
                referrerPolicy="strict-origin-when-cross-origin"
                tabIndex="-1"
              />
            </div>
          ) : null}

          <div className="movie-details-stage-frame">
            <div className="movie-details-stage-poster">
              <img src={posterUrl} alt={movie.name || "Movie poster"} />
            </div>

            <div className="movie-details-stage-overlay">
              <div className="movie-details-stage-copy">
                <h1>{movie.name || "Untitled Movie"}</h1>

                <div className="movie-details-hero-meta">
                  <div className="movie-details-hero-meta-item">
                    <span className="movie-details-hero-label">Running Time</span>
                    <strong>{formatDuration(movie.duration)}</strong>
                  </div>

                  <div className="movie-details-hero-meta-item">
                    <span className="movie-details-hero-label">Rating</span>
                    <strong>{movie.ageRestriction || "NR"}</strong>
                  </div>

                  <div className="movie-details-hero-meta-item movie-details-hero-meta-item-wide">
                    <span className="movie-details-hero-label">Advice</span>
                    <strong>{advisoryText}</strong>
                  </div>
                </div>
              </div>

              <div className="movie-details-stage-controls" aria-hidden="true">
                <button type="button" className="movie-details-stage-icon">
                  <i className="bi bi-volume-mute" />
                </button>
                <button type="button" className="movie-details-stage-icon">
                  <i className="bi bi-arrows-fullscreen" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="movie-details-content">
        <div className="movie-details-main-copy">
          <div className="movie-details-row">
            <span className="movie-details-row-label">Synopsis</span>
            <div className="movie-details-row-body">
              {(synopsisLines.length ? synopsisLines : ["No synopsis available."]).map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <div className="movie-details-row">
            <span className="movie-details-row-label">Main Cast</span>
            <div className="movie-details-row-body">
              <p>{movie.cast || "N/A"}</p>
            </div>
          </div>

          <div className="movie-details-row">
            <span className="movie-details-row-label">Subtitles</span>
            <div className="movie-details-row-body">
              <p>{movie.subtitle || "N/A"}</p>
            </div>
          </div>
        </div>

        <aside className="movie-details-sidebar">
          <div className="movie-details-sidebar-grid">
            <div className="movie-details-side-item">
              <span className="movie-details-side-label">Director</span>
              <span className="movie-details-side-value">{movie.producer || "N/A"}</span>
            </div>

            <div className="movie-details-side-item">
              <span className="movie-details-side-label">Genre</span>
              <span className="movie-details-side-value">{movie.genre || "N/A"}</span>
            </div>

            <div className="movie-details-side-item">
              <span className="movie-details-side-label">Language</span>
              <span className="movie-details-side-value">{movie.language || "N/A"}</span>
            </div>

            <div className="movie-details-side-item">
              <span className="movie-details-side-label">Release Date</span>
              <span className="movie-details-side-value">{formatReleaseDate(movie.releaseDate)}</span>
            </div>

            <div className="movie-details-side-item">
              <span className="movie-details-side-label">Status</span>
              <span className="movie-details-side-value">{movie.status || "N/A"}</span>
            </div>
          </div>

          {trailerWatchUrl ? (
            <a
              href={trailerWatchUrl}
              target="_blank"
              rel="noreferrer"
              className="movie-details-trailer-btn"
            >
              Trailer
            </a>
          ) : (
            <button type="button" className="movie-details-trailer-btn" disabled>
              Trailer
            </button>
          )}
        </aside>
      </div>

      <ViewportSection
        className="movie-showtimes-section"
        estimatedHeight={430}
      >
        <div className="movie-showtimes-date-bar">
          <button
            type="button"
            className="movie-showtimes-calendar-tile"
            onClick={openCalendarPicker}
            aria-label="Choose screening date"
          >
            <i className="bi bi-calendar-event" />
            <input
              id="movieShowtimesDatePicker"
              type="date"
              className="movie-showtimes-date-picker"
              min={minCalendarDate}
              max={maxCalendarDate}
              value={activeShowtimeDate || minCalendarDate}
              onChange={handleCalendarChange}
            />
          </button>

          <div className="movie-showtimes-date-tabs" role="tablist" aria-label="Available screening dates">
            <button
              type="button"
              className="movie-showtimes-date-nav"
              aria-label="Show previous dates"
              onClick={() => shiftDateWindow(-7)}
              disabled={!canGoToPreviousWeek}
            >
              <i className="bi bi-chevron-left" />
            </button>

            {visibleDateTabs.map((day) => {
              const isActive = day.isoDate === activeShowtimeDate;

              return (
                <button
                  key={day.isoDate}
                  type="button"
                  className={`movie-showtimes-date-tab${isActive ? " is-active" : ""}`}
                  onClick={() => setActiveShowtimeDate(day.isoDate)}
                  role="tab"
                  aria-selected={isActive}
                >
                  <span>{`${day.dayNumber} ${day.monthShort}`}</span>
                  <strong>{day.relativeLabel}</strong>
                </button>
              );
            })}

            <button
              type="button"
              className="movie-showtimes-date-nav"
              aria-label="Show next dates"
              onClick={() => shiftDateWindow(7)}
              disabled={!canGoToNextWeek}
            >
              <i className="bi bi-chevron-right" />
            </button>
          </div>
        </div>

        {activeShowtimeDate ? (
          <div className="movie-showtimes-day-panel">
            <div className="movie-showtimes-day-header">
              <span className="movie-showtimes-day-title">Available Showtimes</span>
              <span className="movie-showtimes-day-date">{selectedShowtimeDateLabel}</span>
            </div>

            {activeShowtimeTypeGroups.length > 0 ? (
              <div className="movie-showtimes-hall-list">
                {activeShowtimeTypeGroups.map((group) => (
                  <section key={group.hallType} className="movie-showtimes-hall-card">
                    <div className="movie-showtimes-type-list">
                      <div className="movie-showtimes-type-group">
                        <span className="movie-showtimes-type-label">
                          <i className={`bi ${getShowtimeTypeIcon(group.hallType)}`} />
                          <span>{group.hallType}</span>
                        </span>

                        <div className="movie-showtimes-slot-grid">
                          {group.showtimes.map((showtime) => (
                            <button
                              key={showtime.screeningId}
                              type="button"
                              className={`movie-showtimes-slot${selectedScreeningPreview?.screeningId === showtime.screeningId ? " is-selected" : ""}`}
                              title={`View screening in ${showtime.hallName}`}
                              onClick={() => handleSelectShowtime(showtime)}
                            >
                              <strong>{showtime.time}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="movie-showtimes-empty-state">
                {emptyShowtimeMessage}
              </div>
            )}
          </div>
        ) : (
          <div className="movie-showtimes-empty-state">
            {emptyShowtimeMessage}
          </div>
        )}

        {seatPreviewLoading ? (
          <div className="movie-seat-preview-status">
            Loading seat preview...
          </div>
        ) : null}

        {!seatPreviewLoading && seatPreviewError ? (
          <div className="movie-seat-preview-status movie-seat-preview-status-error">
            {seatPreviewError}
          </div>
        ) : null}

        {!seatPreviewLoading && !seatPreviewError && selectedScreeningPreview ? (
          <div className="movie-seat-preview-panel">
            <div className="movie-seat-preview-header">
              <div>
                <span className="movie-seat-preview-kicker">Seat Preview</span>
                <h3>{selectedScreeningPreview.movie?.name || movie.name || "Movie"}</h3>
              </div>

              <div className="movie-seat-preview-meta">
                <span>
                  <i className="bi bi-clock" />
                  {selectedScreeningPreview.dateLabel} {selectedScreeningPreview.time}
                </span>
                <span>
                  <i className="bi bi-door-open" />
                  {selectedScreeningPreview.hall?.name || "Hall"}
                </span>
              </div>
            </div>

            <div className="movie-seat-preview-stage">
              <div className="movie-seat-preview-screen-wrap">
                <div className="movie-seat-preview-screen" />
                <span>Screen</span>
              </div>

              <div className="movie-seat-preview-grid">
                {selectedScreeningRows.map((row) => (
                  <div key={row.key} className="movie-seat-preview-row">
                    <span className="movie-seat-preview-row-label">{row.label}</span>

                    <div className="movie-seat-preview-row-cells">
                      {row.cells.map((cell) => (
                        cell.kind === "lane" ? (
                          <span key={cell.key} className="movie-seat-preview-lane" aria-hidden="true" />
                        ) : (
                          <span
                            key={cell.key}
                            className={`movie-seat-preview-seat movie-seat-preview-seat-${cell.state || "normal"}`}
                            aria-hidden="true"
                          />
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="movie-seat-preview-legend">
              <span><i className="movie-seat-preview-seat movie-seat-preview-seat-normal" />Available</span>
              <span><i className="movie-seat-preview-seat movie-seat-preview-seat-removed" />Unavailable</span>
              <span><i className="movie-seat-preview-seat movie-seat-preview-seat-wheelchair" />Wheelchair</span>
              <span><i className="movie-seat-preview-lane" />Aisle</span>
            </div>
          </div>
        ) : null}
      </ViewportSection>
    </section>
  );
}

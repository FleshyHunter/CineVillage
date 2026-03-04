const { getCollectionScreening, getCollectionMovie, getCollectionHall, initDBIfNecessary } = require("../config/database");
const { ObjectId } = require("mongodb");
const { isHallAvailableNow, doesScreeningOverlapMaintenance, getMaintenanceWindow } = require("../public/js/hallStatus");

// Utility: Round up time to next 15-minute interval
function roundUpTo15Min(date) {
  const minutes = date.getMinutes();
  const remainder = minutes % 15;
  if (remainder !== 0) {
    date.setMinutes(minutes + (15 - remainder));
  }
  date.setSeconds(0);
  date.setMilliseconds(0);
  return date;
}

// Utility: Calculate end time with movie duration + 15 min cleaning buffer
function calculateEndTime(startDateTime, durationMinutes) {
  // Normalize duration to a safe numeric minute value (handles string durations from DB)
  const parsedDuration = typeof durationMinutes === 'number'
    ? durationMinutes
    : parseInt(durationMinutes, 10);

  if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
    throw new Error(`Invalid movie duration: ${durationMinutes}`);
  }

  const endDateTime = new Date(startDateTime);
  endDateTime.setMinutes(endDateTime.getMinutes() + parsedDuration);
  
  // Round up to next 15-minute mark
  const roundedEnd = roundUpTo15Min(endDateTime);
  
  // Add 15-minute cleaning buffer
  roundedEnd.setMinutes(roundedEnd.getMinutes() + 15);
  
  return roundedEnd;
}

// Utility: Check if two time ranges overlap
function hasTimeConflict(start1, end1, start2, end2) {
  return (start1 < end2 && end1 > start2);
}

// Utility: Parse date + time from form reliably in local timezone.
// Supports YYYY-MM-DD (native date input) and DD/MM/YYYY (fallback text input).
function parseLocalDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) {
    return null;
  }

  let year, month, day;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    [year, month, day] = dateStr.split('-').map(Number);
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    const parts = dateStr.split('/').map(Number);
    day = parts[0];
    month = parts[1];
    year = parts[2];
  } else {
    return null;
  }

  const [hours, minutes] = timeStr.split(':').map(Number);
  const parsed = new Date(year, month - 1, day, hours, minutes, 0, 0);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

// Utility: Safely normalize unknown id shapes into ObjectId
function toObjectIdSafe(value) {
  if (!value) return null;
  if (value instanceof ObjectId) return value;
  if (typeof value === 'string') {
    return ObjectId.isValid(value) ? new ObjectId(value) : null;
  }
  if (typeof value === 'object' && value._id) {
    return toObjectIdSafe(value._id);
  }
  return null;
}

// Check for scheduling conflicts
async function checkSchedulingConflict(hallId, startDateTime, endDateTime, excludeScreeningId = null) {
  await initDBIfNecessary();
  const collectionScreening = getCollectionScreening();
  
  // Find all screenings for this hall on the same date (and possibly next day)
  const searchStart = new Date(startDateTime);
  searchStart.setHours(0, 0, 0, 0);
  
  const searchEnd = new Date(endDateTime);
  searchEnd.setHours(23, 59, 59, 999);
  
  const query = {
    hallId: new ObjectId(hallId),
    startDateTime: { $gte: searchStart, $lte: searchEnd }
  };
  
  if (excludeScreeningId) {
    query._id = { $ne: new ObjectId(excludeScreeningId) };
  }
  
  const existingScreenings = await collectionScreening.find(query).toArray();
  
  // Check for conflicts
  for (const screening of existingScreenings) {
    const existingStart = new Date(screening.startDateTime);
    const existingEnd = new Date(screening.endDateTime);
    
    if (hasTimeConflict(startDateTime, endDateTime, existingStart, existingEnd)) {
      return {
        hasConflict: true,
        conflictingScreening: screening
      };
    }
  }
  
  return { hasConflict: false };
}

async function createScreening(screeningData) {
  await initDBIfNecessary();
  screeningData.created = new Date();
  const collectionHall = getCollectionHall();

  // Convert IDs to ObjectId
  if (screeningData.movieId) {
    screeningData.movieId = new ObjectId(screeningData.movieId);
  }
  if (screeningData.hallId) {
    screeningData.hallId = new ObjectId(screeningData.hallId);
  }

  // Convert to proper types
  if (screeningData.price) screeningData.price = parseFloat(screeningData.price);
  
  // Combine date and time into startDateTime - use local timezone
  if (screeningData.date && screeningData.startTime) {
    screeningData.startDateTime = parseLocalDateTime(screeningData.date, screeningData.startTime);
    if (!screeningData.startDateTime) {
      throw new Error("Invalid date/time format. Please select a valid date and time.");
    }
  }

  // Fetch movie to get duration
  const collectionMovie = getCollectionMovie();
  const movie = await collectionMovie.findOne({ _id: screeningData.movieId });
  const hall = await collectionHall.findOne({ _id: screeningData.hallId });
  
  if (!movie) {
    throw new Error("Movie not found");
  }
  if (!hall) {
    throw new Error("Hall not found");
  }

  // Calculate end time with duration + buffer, rounded to 15-min
  screeningData.endDateTime = calculateEndTime(screeningData.startDateTime, movie.duration);

  // Auto-determine status based on time
  const now = new Date();
  if (now < screeningData.startDateTime) {
    screeningData.status = 'scheduled';
  } else if (now >= screeningData.startDateTime && now < screeningData.endDateTime) {
    screeningData.status = 'ongoing';
  } else {
    screeningData.status = 'completed';
  }

  // If this screening overlaps hall maintenance, mark as paused.
  if (doesScreeningOverlapMaintenance(hall, screeningData.startDateTime, screeningData.endDateTime)) {
    screeningData.status = 'paused';
  }

  // Hard-stop if hall maintenance overlaps the requested slot.
  const maintenanceWindow = getMaintenanceWindow(hall);
  if (hall.status === 'Under Maintenance') {
    if (!maintenanceWindow) {
      throw new Error(`Hall ${hall.name} is under maintenance. Choose another hall or time.`);
    }

    if (hasTimeConflict(
      screeningData.startDateTime,
      screeningData.endDateTime,
      maintenanceWindow.start,
      maintenanceWindow.end
    )) {
      throw new Error(`Hall ${hall.name} is under maintenance from ${maintenanceWindow.startDate} to ${maintenanceWindow.endDate}. Please pick another time or hall.`);
    }
  }

  // Check for scheduling conflicts
  const conflictCheck = await checkSchedulingConflict(
    screeningData.hallId,
    screeningData.startDateTime,
    screeningData.endDateTime
  );

  if (conflictCheck.hasConflict) {
    throw new Error("Time slot conflict: This hall is already booked for the selected time");
  }

  // Initialize empty bookedSeats object
  screeningData.bookedSeats = {};
  
  // Remove temporary fields used for form input
  delete screeningData.date;
  delete screeningData.startTime;
  
  console.log('Creating screening with data:', {
    movieId: screeningData.movieId,
    hallId: screeningData.hallId,
    startDateTime: screeningData.startDateTime,
    endDateTime: screeningData.endDateTime,
    price: screeningData.price,
    status: screeningData.status
  });
  
  const collectionScreening = getCollectionScreening();
  const result = await collectionScreening.insertOne(screeningData);
  console.log('Screening created with ID:', result.insertedId);
}

// Get all screenings (for screeningList.ejs)
// Auto-update screening statuses based on current time
async function updateScreeningStatuses() {
  await initDBIfNecessary();
  const collectionScreening = getCollectionScreening();
  const collectionHall = getCollectionHall();
  
  const now = new Date();
  console.log('=== AUTO-UPDATING SCREENING STATUSES ===');
  console.log('Current time:', now.toISOString());
  
  const allScreenings = await collectionScreening.find({}).toArray();
  const allHalls = await collectionHall.find({}).toArray();
  const hallMap = new Map(allHalls.map(h => [h._id.toString(), h]));
  
  for (let screening of allScreenings) {
    let newStatus = screening.status;
    
    const startTime = new Date(screening.startDateTime);
    const endTime = new Date(screening.endDateTime);
    const hall = screening.hallId ? hallMap.get(screening.hallId.toString()) : null;
    
    // Pause takes precedence if screening is inside hall maintenance window.
    if (hall && doesScreeningOverlapMaintenance(hall, startTime, endTime)) {
      newStatus = 'paused';
    } else {
      // Determine status based on current time
      if (now < startTime) {
        newStatus = 'scheduled';
      } else if (now >= startTime && now < endTime) {
        newStatus = 'ongoing';
      } else if (now >= endTime) {
        newStatus = 'completed';
      }
    }
    
    // Update if status has changed
    if (newStatus !== screening.status) {
      console.log(`Updating screening ${screening._id}: ${screening.status} → ${newStatus}`);
      console.log(`  Start: ${startTime.toISOString()}, End: ${endTime.toISOString()}`);
      await collectionScreening.updateOne(
        { _id: screening._id },
        { $set: { status: newStatus } }
      );
    }
  }
  
  console.log('=== STATUS UPDATE COMPLETE ===');
}

async function getAllScreenings(req, res) {
  await initDBIfNecessary();

  const collectionScreening = getCollectionScreening();
  const collectionMovie = getCollectionMovie();
  const collectionHall = getCollectionHall();
  
  // Auto-update statuses before fetching
  await updateScreeningStatuses();
  
  // Fetch all screenings
  const allScreenings = await collectionScreening.find({}).toArray();
  
  // Filter for active screenings (scheduled/ongoing) - for All, Movie, Hall, Date views
  const screenings = allScreenings.filter(s => ['scheduled', 'ongoing', 'paused'].includes(s.status));
  
  // Populate movie and hall details for active screenings
  for (let screening of screenings) {
    if (screening.movieId) {
      const movieId = toObjectIdSafe(screening.movieId);
      if (movieId) {
        screening.movieId = await collectionMovie.findOne({ _id: movieId });
      }
    }
    if (screening.hallId) {
      const hallId = toObjectIdSafe(screening.hallId);
      if (hallId) {
        screening.hallId = await collectionHall.findOne({ _id: hallId });
      }
    }
  }

  // Sort screenings by date (earliest to latest), then time, then hall name
  screenings.sort((a, b) => {
    // First sort by date/time
    const dateCompare = new Date(a.startDateTime) - new Date(b.startDateTime);
    if (dateCompare !== 0) return dateCompare;
    
    // If date/time are equal, sort by hall name
    const hallA = a.hallId?.name || '';
    const hallB = b.hallId?.name || '';
    return hallA.localeCompare(hallB);
  });

  // Get unique movies that have screenings
  const movieIds = [...new Set(screenings.map(s => s.movieId?._id?.toString()).filter(Boolean))];
  const moviesWithScreenings = await collectionMovie.find({
    _id: { $in: movieIds.map(id => new ObjectId(id)) }
  }).toArray();

  // Get ALL movies for Movie view filters (Now Showing / Coming Soon)
  const allMovies = await collectionMovie.find({ 
    status: { $in: ['Now Showing', 'Coming Soon'] }
  }).toArray();

  // Get unique halls that have screenings
  const hallIds = [...new Set(screenings.map(s => s.hallId?._id?.toString()).filter(Boolean))];
  const hallsWithScreenings = await collectionHall.find({
    _id: { $in: hallIds.map(id => new ObjectId(id)) }
  }).toArray();

  // Get query parameters
  const activeView = req.query.view || 'all';
  const queryDate = req.query.date;
  
  // Determine which date to use
  let selectedDate;
  let targetDate;
  
  if (queryDate) {
    selectedDate = queryDate;
    targetDate = new Date(queryDate);
  } else {
    selectedDate = new Date().toISOString().split('T')[0];
    targetDate = new Date();
  }
  
  // Set date range for the selected date
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  const dateScreenings = await collectionScreening.find({
    startDateTime: { $gte: startOfDay, $lte: endOfDay },
    status: { $in: ['scheduled', 'ongoing', 'paused'] }
  }).toArray();

  // Get movies for selected date
  const dateMovieIds = [...new Set(dateScreenings.map(s => s.movieId.toString()))];
  const dateMovies = await collectionMovie.find({
    _id: { $in: dateMovieIds.map(id => new ObjectId(id)) }
  }).toArray();

  // Get all halls
  const allHallsRaw = await collectionHall.find({}).toArray();
  const allHalls = allHallsRaw.filter(hall => isHallAvailableNow(hall));
  const hallMap = {};
  allHalls.forEach(h => {
    hallMap[h._id.toString()] = { name: h.name, type: h.type };
  });

  // Group date screenings by movie and hall type
  const dateMoviesWithScreenings = dateMovies.map(movie => {
    const movieScreenings = dateScreenings.filter(s => s.movieId.toString() === movie._id.toString());
    
    const byHallType = {};
    movieScreenings.forEach(screening => {
      const hallInfo = hallMap[screening.hallId.toString()];
      if (hallInfo) {
        if (!byHallType[hallInfo.type]) {
          byHallType[hallInfo.type] = [];
        }
        byHallType[hallInfo.type].push({
          time: screening.startDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
          hallName: hallInfo.name,
          screeningId: screening._id.toString()
        });
      }
    });
    
    Object.keys(byHallType).forEach(type => {
      byHallType[type].sort((a, b) => a.time.localeCompare(b.time));
    });
    
    return {
      ...movie,
      screeningsByHallType: byHallType
    };
  });

  // Get completed screenings based on time passed (same local Date handling as scheduling/status logic)
  const now = new Date();
  const pausedScreenings = allScreenings
    .filter(s => s.status === 'paused')
    .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

  const completedScreenings = allScreenings
    .filter(s => s.endDateTime && new Date(s.endDateTime) < now)
    .sort((a, b) => new Date(b.startDateTime) - new Date(a.startDateTime));

  // Ensure all screenings shown in Completed view are marked as completed
  for (const screening of completedScreenings) {
    if (screening.status !== 'completed') {
      await collectionScreening.updateOne(
        { _id: screening._id },
        { $set: { status: 'completed' } }
      );
    }
    screening.status = 'completed';
  }

  // Populate movie and hall details for completed screenings
  for (let screening of completedScreenings) {
    if (screening.movieId) {
      const movieId = toObjectIdSafe(screening.movieId);
      if (movieId) {
        screening.movieId = await collectionMovie.findOne({ _id: movieId });
      }
    }
    if (screening.hallId) {
      const hallId = toObjectIdSafe(screening.hallId);
      if (hallId) {
        screening.hallId = await collectionHall.findOne({ _id: hallId });
      }
    }
  }

  // Populate movie and hall details for paused screenings
  for (let screening of pausedScreenings) {
    if (screening.movieId) {
      const movieId = toObjectIdSafe(screening.movieId);
      if (movieId) {
        screening.movieId = await collectionMovie.findOne({ _id: movieId });
      }
    }
    if (screening.hallId) {
      const hallId = toObjectIdSafe(screening.hallId);
      if (hallId) {
        screening.hallId = await collectionHall.findOne({ _id: hallId });
      }
    }
  }

  res.render("screenings/screeningList", { 
    screenings, 
    movies: allMovies,  // All movies for Movie view with Now Showing/Coming Soon filters
    halls: hallsWithScreenings,
    dateMovies: dateMoviesWithScreenings,
    pausedScreenings,
    completedScreenings,
    selectedDate,
    activeView,
    title: 'Screening List' 
  });
}

// Get single screening by ID (for screeningDetails.ejs)
async function getScreeningById(screeningId) {
  await initDBIfNecessary();
  if (!screeningId) {
    return null;
  }

  const collectionScreening = getCollectionScreening();

  return collectionScreening.findOne({
    _id: ObjectId.createFromHexString(screeningId)
  });
}

async function updateScreening(id, screeningData) {
  await initDBIfNecessary();
  const collectionHall = getCollectionHall();

  // Convert IDs to ObjectId
  if (screeningData.movieId) {
    screeningData.movieId = new ObjectId(screeningData.movieId);
  }
  if (screeningData.hallId) {
    screeningData.hallId = new ObjectId(screeningData.hallId);
  }

  // Convert to proper types
  if (screeningData.price) screeningData.price = parseFloat(screeningData.price);
  
  // Combine date and time into startDateTime - use local timezone
  if (screeningData.date && screeningData.startTime) {
    screeningData.startDateTime = parseLocalDateTime(screeningData.date, screeningData.startTime);
    if (!screeningData.startDateTime) {
      throw new Error("Invalid date/time format. Please select a valid date and time.");
    }
    
    console.log('UPDATE - Parsed startDateTime:', {
      input: `${screeningData.date} ${screeningData.startTime}`,
      output: screeningData.startDateTime,
      iso: screeningData.startDateTime.toISOString()
    });
  }

  // Fetch movie to get duration
  const collectionMovie = getCollectionMovie();
  const movie = await collectionMovie.findOne({ _id: screeningData.movieId });
  const hall = await collectionHall.findOne({ _id: screeningData.hallId });
  
  if (!movie) {
    throw new Error("Movie not found");
  }
  if (!hall) {
    throw new Error("Hall not found");
  }

  // Calculate end time with duration + buffer, rounded to 15-min
  screeningData.endDateTime = calculateEndTime(screeningData.startDateTime, movie.duration);

  // Auto-determine status based on time
  const now = new Date();
  if (now < screeningData.startDateTime) {
    screeningData.status = 'scheduled';
  } else if (now >= screeningData.startDateTime && now < screeningData.endDateTime) {
    screeningData.status = 'ongoing';
  } else {
    screeningData.status = 'completed';
  }

  if (doesScreeningOverlapMaintenance(hall, screeningData.startDateTime, screeningData.endDateTime)) {
    screeningData.status = 'paused';
  }

  // Hard-stop if hall maintenance overlaps the requested slot.
  const maintenanceWindow = getMaintenanceWindow(hall);
  if (hall.status === 'Under Maintenance') {
    if (!maintenanceWindow) {
      throw new Error(`Hall ${hall.name} is under maintenance. Choose another hall or time.`);
    }

    if (hasTimeConflict(
      screeningData.startDateTime,
      screeningData.endDateTime,
      maintenanceWindow.start,
      maintenanceWindow.end
    )) {
      throw new Error(`Hall ${hall.name} is under maintenance from ${maintenanceWindow.startDate} to ${maintenanceWindow.endDate}. Please pick another time or hall.`);
    }
  }

  // Check for scheduling conflicts (excluding current screening)
  const conflictCheck = await checkSchedulingConflict(
    screeningData.hallId,
    screeningData.startDateTime,
    screeningData.endDateTime,
    id  // Exclude current screening from conflict check
  );

  if (conflictCheck.hasConflict) {
    throw new Error("Time slot conflict: This hall is already booked for the selected time");
  }

  // Remove temporary fields used for form input
  delete screeningData.date;
  delete screeningData.startTime;

  const collectionScreening = getCollectionScreening();

  await collectionScreening.updateOne(
    { _id: new ObjectId(id) },
    { $set: screeningData }
  );
}

async function deleteScreening(id) {
  await initDBIfNecessary();
  if (!ObjectId.isValid(id)) throw new Error("Invalid screening ID");

  const collectionScreening = getCollectionScreening();
  await collectionScreening.deleteOne({ _id: new ObjectId(id) });
}

// Pause all screenings in a hall that overlap its maintenance window
async function pauseScreeningsForHallMaintenance(hall) {
  await initDBIfNecessary();
  const window = getMaintenanceWindow(hall);
  if (!window) return;

  const collectionScreening = getCollectionScreening();
  await collectionScreening.updateMany(
    {
      hallId: new ObjectId(hall._id),
      startDateTime: { $lte: window.end },
      endDateTime: { $gte: window.start },
      status: { $in: ['scheduled', 'ongoing'] }
    },
    { $set: { status: 'paused' } }
  );
}

// Get hall schedule for a specific date (for timeline visualization)
async function getHallSchedule(hallId, date) {
  await initDBIfNecessary();
  
  const collectionScreening = getCollectionScreening();
  const collectionMovie = getCollectionMovie();
  
  // Parse the date string (YYYY-MM-DD) - add T00:00:00 to avoid timezone issues
  const targetDate = new Date(date + 'T00:00:00');
  const dayStart = new Date(targetDate);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(targetDate);
  dayEnd.setHours(23, 59, 59, 999);
  
  // Include next day until 12:00 (for 3rd row)
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(nextDayStart.getDate() + 1);
  
  const nextDayNoon = new Date(nextDayStart);
  nextDayNoon.setHours(11, 59, 59, 999);
  
  console.log('Fetching schedule for:', {
    hallId,
    date,
    dayStart,
    dayEnd,
    nextDayStart,
    nextDayNoon
  });
  
  // Find all screenings for this hall that overlap with the displayed timeline
  // Timeline shows: [dayStart to nextDayNoon] (selected date + next morning)
  // A screening overlaps if: it starts before timeline ends AND ends after timeline starts
  const screenings = await collectionScreening.find({
    hallId: new ObjectId(hallId),
    startDateTime: { $lt: nextDayNoon },      // Starts before end of timeline
    endDateTime: { $gt: dayStart }            // Ends after start of timeline
  }).toArray();
  
  console.log(`Found ${screenings.length} screenings for this hall and date`);
  screenings.forEach(s => {
    console.log('  - Screening:', {
      id: s._id,
      movieId: s.movieId,
      startDateTime: s.startDateTime,
      endDateTime: s.endDateTime
    });
  });
  
  // Build timeline blocks
  const timelineBlocks = [];
  
  for (const screening of screenings) {
    const movieId = toObjectIdSafe(screening.movieId);
    if (!movieId) continue;
    const movie = await collectionMovie.findOne({ _id: movieId });
    
    const startDateTime = new Date(screening.startDateTime);
    const endDateTime = new Date(screening.endDateTime);
    
    // Calculate slot numbers (0-143)
    // 0-47: Current day 00:00-11:45
    // 48-95: Current day 12:00-23:45
    // 96-143: Next day 00:00-11:45
    const startSlot = calculateTimeSlot(startDateTime, dayStart);
    const endSlot = calculateTimeSlot(endDateTime, dayStart);
    
    // Only include if the screening has at least some overlap with visible timeline (slots 0-143)
    if (endSlot > 0 && startSlot < 144) {
      timelineBlocks.push({
        screeningId: screening._id.toString(),
        movieName: movie ? movie.name : 'Unknown',
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
        displayStart: formatTime(startDateTime),
        displayEnd: formatTime(endDateTime),
        startSlot: Math.max(0, startSlot),     // Clamp to visible range
        endSlot: Math.min(144, endSlot),       // Clamp to visible range
        price: screening.price,
        status: screening.status
      });
    }
  }
  
  return timelineBlocks;
}

// Helper: Calculate which 15-min slot a time falls into (0-143)
// 0-47: Day 1 (00:00-11:45), 48-95: Day 1 (12:00-23:45), 96-143: Day 2 (00:00-11:45)
function calculateTimeSlot(dateTime, dayStart) {
  const diffMs = dateTime - dayStart;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const slot = Math.floor(diffMinutes / 15);
  return Math.max(0, Math.min(slot, 143)); // Clamp to 0-143
}

// Helper: Format time as HH:MM
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// View by Hall - Get all halls for listing
async function getHallsForScreenings(req, res) {
  try {
    await initDBIfNecessary();
    const collectionHall = getCollectionHall();
    const hallsRaw = await collectionHall.find({}).toArray();
    const halls = hallsRaw.filter(hall => isHallAvailableNow(hall));
    res.render("screenings/viewByHall", { halls, title: 'View by Hall' });
  } catch (error) {
    console.error('Error fetching halls:', error);
    res.status(500).send("Error fetching halls");
  }
}

// View by Hall - Get individual hall schedule
async function getHallSchedulePage(req, res) {
  try {
    await initDBIfNecessary();
    const collectionHall = getCollectionHall();
    const hall = await collectionHall.findOne({ _id: new ObjectId(req.params.hallId) });
    const requestedDate = req.query.date;
    const selectedDate = (typeof requestedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate))
      ? requestedDate
      : new Date().toISOString().split('T')[0];
    
    if (!hall) {
      return res.status(404).send("Hall not found");
    }
    
    res.render("screenings/viewByHallSchedule", { hall, selectedDate, title: `${hall.name} Schedule` });
  } catch (error) {
    console.error('Error fetching hall:', error);
    res.status(500).send("Error fetching hall");
  }
}

// View by Movie - Get individual movie screenings grouped by date
async function getMovieScreenings(req, res) {
  try {
    await initDBIfNecessary();
    
    // Auto-update statuses before fetching
    await updateScreeningStatuses();
    
    const collectionMovie = getCollectionMovie();
    const collectionScreening = getCollectionScreening();
    const collectionHall = getCollectionHall();
    
    const movie = await collectionMovie.findOne({ _id: new ObjectId(req.params.movieId) });
    if (!movie) {
      return res.status(404).send("Movie not found");
    }
    
    console.log(`=== FETCHING SCREENINGS FOR MOVIE: ${movie.name} ===`);
    console.log(`Movie ID: ${req.params.movieId}`);
    
    // Get all screenings for this movie
    const screenings = await collectionScreening.find({
      movieId: new ObjectId(req.params.movieId),
      status: { $in: ['scheduled', 'ongoing', 'paused'] }
    }).sort({ startDateTime: 1 }).toArray();
    
    console.log(`Found ${screenings.length} screenings with status scheduled/ongoing`);
    
    // Debug: Check all screenings for this movie regardless of status
    const allMovieScreenings = await collectionScreening.find({
      movieId: new ObjectId(req.params.movieId)
    }).toArray();
    console.log(`Total screenings for this movie (all statuses): ${allMovieScreenings.length}`);
    allMovieScreenings.forEach(s => {
      console.log(`  - Screening ${s._id}: status=${s.status}, start=${s.startDateTime}`);
    });
    
    // Get hall names
    const hallIds = [...new Set(screenings.map(s => s.hallId.toString()))];
    const halls = await collectionHall.find({
      _id: { $in: hallIds.map(id => new ObjectId(id)) }
    }).toArray();
    
    const hallMap = {};
    halls.forEach(h => {
      hallMap[h._id.toString()] = h.name;
    });
    
    // Group screenings by date
    const groupedByDate = {};
    screenings.forEach(screening => {
      const dateKey = screening.startDateTime.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
      
      if (!groupedByDate[dateKey]) {
        groupedByDate[dateKey] = [];
      }
      
      groupedByDate[dateKey].push({
        time: screening.startDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
        hallName: hallMap[screening.hallId.toString()] || 'Unknown Hall',
        screeningId: screening._id,
        status: screening.status || 'scheduled'
      });
    });
    
    res.render("screenings/viewByMovieSchedule", { 
      movie, 
      screeningsByDate: groupedByDate,
      title: `${movie.name} - Screenings` 
    });
  } catch (error) {
    console.error('Error fetching movie screenings:', error);
    res.status(500).send("Error fetching screenings");
  }
}

module.exports = {
  createScreening,
  getAllScreenings,
  getScreeningById,
  updateScreening,
  deleteScreening,
  pauseScreeningsForHallMaintenance,
  getHallSchedule,
  getHallSchedulePage,
  getMovieScreenings,
  updateScreeningStatuses,
}

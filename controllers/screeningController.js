const { getCollectionScreening, getCollectionMovie, getCollectionHall, initDBIfNecessary } = require("../config/database");
const { ObjectId } = require("mongodb");

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
  const endDateTime = new Date(startDateTime);
  endDateTime.setMinutes(endDateTime.getMinutes() + durationMinutes);
  
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

  // Convert IDs to ObjectId
  if (screeningData.movieId) {
    screeningData.movieId = new ObjectId(screeningData.movieId);
  }
  if (screeningData.hallId) {
    screeningData.hallId = new ObjectId(screeningData.hallId);
  }

  // Convert to proper types
  if (screeningData.price) screeningData.price = parseFloat(screeningData.price);
  
  // Combine date and time into startDateTime
  if (screeningData.date && screeningData.startTime) {
    const dateStr = screeningData.date;
    const timeStr = screeningData.startTime;
    screeningData.startDateTime = new Date(`${dateStr}T${timeStr}:00`);
  }

  // Fetch movie to get duration
  const collectionMovie = getCollectionMovie();
  const movie = await collectionMovie.findOne({ _id: screeningData.movieId });
  
  if (!movie) {
    throw new Error("Movie not found");
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
  
  const now = new Date();
  console.log('=== AUTO-UPDATING SCREENING STATUSES ===');
  console.log('Current time:', now.toISOString());
  
  const allScreenings = await collectionScreening.find({}).toArray();
  
  for (let screening of allScreenings) {
    let newStatus = screening.status;
    
    const startTime = new Date(screening.startDateTime);
    const endTime = new Date(screening.endDateTime);
    
    // Determine status based on current time
    if (now < startTime) {
      newStatus = 'scheduled';
    } else if (now >= startTime && now < endTime) {
      newStatus = 'ongoing';
    } else if (now >= endTime) {
      newStatus = 'completed';
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
  const screenings = allScreenings.filter(s => s.status === 'scheduled' || s.status === 'ongoing');
  
  // Populate movie and hall details for active screenings
  for (let screening of screenings) {
    if (screening.movieId) {
      screening.movieId = await collectionMovie.findOne({ _id: new ObjectId(screening.movieId) });
    }
    if (screening.hallId) {
      screening.hallId = await collectionHall.findOne({ _id: new ObjectId(screening.hallId) });
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
    status: { $in: ['scheduled', 'ongoing'] }
  }).toArray();

  // Get movies for selected date
  const dateMovieIds = [...new Set(dateScreenings.map(s => s.movieId.toString()))];
  const dateMovies = await collectionMovie.find({
    _id: { $in: dateMovieIds.map(id => new ObjectId(id)) }
  }).toArray();

  // Get all halls
  const allHalls = await collectionHall.find({ status: 'Available' }).toArray();
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
          hallName: hallInfo.name
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

  // Get completed screenings (sorted by most recent first)
  const completedScreenings = await collectionScreening.find({
    status: 'completed'
  }).sort({ startDateTime: -1 }).toArray();

  // Populate movie and hall details for completed screenings
  for (let screening of completedScreenings) {
    if (screening.movieId) {
      screening.movieId = await collectionMovie.findOne({ _id: new ObjectId(screening.movieId) });
    }
    if (screening.hallId) {
      screening.hallId = await collectionHall.findOne({ _id: new ObjectId(screening.hallId) });
    }
  }

  res.render("screenings/screeningList", { 
    screenings, 
    movies: allMovies,  // All movies for Movie view with Now Showing/Coming Soon filters
    halls: hallsWithScreenings,
    dateMovies: dateMoviesWithScreenings,
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
    const dateStr = screeningData.date;
    const timeStr = screeningData.startTime;
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    screeningData.startDateTime = new Date(year, month - 1, day, hours, minutes, 0);
    
    console.log('UPDATE - Parsed startDateTime:', {
      input: `${dateStr} ${timeStr}`,
      output: screeningData.startDateTime,
      iso: screeningData.startDateTime.toISOString()
    });
  }

  // Fetch movie to get duration
  const collectionMovie = getCollectionMovie();
  const movie = await collectionMovie.findOne({ _id: screeningData.movieId });
  
  if (!movie) {
    throw new Error("Movie not found");
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
  
  // Find all screenings for this hall that overlap with the target date range
  const screenings = await collectionScreening.find({
    hallId: new ObjectId(hallId),
    $or: [
      // Screenings that start on the target date
      { startDateTime: { $gte: dayStart, $lte: dayEnd } },
      // Screenings from target date that bleed into next day
      { 
        startDateTime: { $gte: dayStart, $lte: dayEnd },
        endDateTime: { $gte: nextDayStart, $lte: nextDayNoon }
      },
      // Screenings that start on next day morning
      { startDateTime: { $gte: nextDayStart, $lte: nextDayNoon } }
    ]
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
    const movie = await collectionMovie.findOne({ _id: new ObjectId(screening.movieId) });
    
    const startDateTime = new Date(screening.startDateTime);
    const endDateTime = new Date(screening.endDateTime);
    
    // Calculate slot numbers (0-143)
    // 0-47: Current day 00:00-11:45
    // 48-95: Current day 12:00-23:45
    // 96-143: Next day 00:00-11:45
    const startSlot = calculateTimeSlot(startDateTime, dayStart);
    const endSlot = calculateTimeSlot(endDateTime, dayStart);
    
    timelineBlocks.push({
      screeningId: screening._id,
      movieName: movie ? movie.name : 'Unknown',
      startDateTime: startDateTime.toISOString(),
      endDateTime: endDateTime.toISOString(),
      displayStart: formatTime(startDateTime),
      displayEnd: formatTime(endDateTime),
      startSlot,
      endSlot,
      price: screening.price,
      status: screening.status
    });
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
    const halls = await collectionHall.find({ status: 'Available' }).toArray();
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
    
    if (!hall) {
      return res.status(404).send("Hall not found");
    }
    
    res.render("screenings/viewByHallSchedule", { hall, title: `${hall.name} Schedule` });
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
      status: { $in: ['scheduled', 'ongoing'] }
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
        screeningId: screening._id
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

// View by Date - Get all movies with screenings for selected date
async function getScreeningsByDate(req, res) {
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];
    
    await initDBIfNecessary();
    
    // Auto-update statuses before fetching
    await updateScreeningStatuses();
    
    const collectionScreening = getCollectionScreening();
    const collectionMovie = getCollectionMovie();
    const collectionHall = getCollectionHall();
    
    // Parse selected date
    const [year, month, day] = selectedDate.split('-').map(Number);
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0);
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59);
    
    // Get all screenings for this date
    const screenings = await collectionScreening.find({
      startDateTime: { $gte: startOfDay, $lte: endOfDay },
      status: { $in: ['scheduled', 'ongoing'] }
    }).toArray();
    
    // Get unique movie IDs
    const movieIds = [...new Set(screenings.map(s => s.movieId.toString()))];
    const movies = await collectionMovie.find({
      _id: { $in: movieIds.map(id => new ObjectId(id)) }
    }).toArray();
    
    // Get all halls
    const halls = await collectionHall.find({ status: 'Available' }).toArray();
    const hallMap = {};
    halls.forEach(h => {
      hallMap[h._id.toString()] = { name: h.name, type: h.type };
    });
    
    // Group screenings by movie and hall type
    const moviesWithScreenings = movies.map(movie => {
      const movieScreenings = screenings.filter(s => s.movieId.toString() === movie._id.toString());
      
      // Group by hall type
      const byHallType = {};
      movieScreenings.forEach(screening => {
        const hallInfo = hallMap[screening.hallId.toString()];
        if (hallInfo) {
          if (!byHallType[hallInfo.type]) {
            byHallType[hallInfo.type] = [];
          }
          byHallType[hallInfo.type].push({
            time: screening.startDateTime.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }),
            hallName: hallInfo.name
          });
        }
      });
      
      // Sort times for each hall type
      Object.keys(byHallType).forEach(type => {
        byHallType[type].sort((a, b) => a.time.localeCompare(b.time));
      });
      
      return {
        ...movie,
        screeningsByHallType: byHallType
      };
    });
    
    res.render("screenings/viewByDate", { 
      movies: moviesWithScreenings,
      selectedDate,
      title: 'View by Date'
    });
  } catch (error) {
    console.error('Error fetching screenings by date:', error);
    res.status(500).send("Error fetching screenings");
  }
}

module.exports = {
  createScreening,
  getAllScreenings,
  getScreeningById,
  updateScreening,
  deleteScreening,
  getHallSchedule,
  getHallsForScreenings,
  getHallSchedulePage,
  getMovieScreenings,
  getScreeningsByDate,
  updateScreeningStatuses,
}

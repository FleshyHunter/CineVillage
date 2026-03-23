function formatLocalDateYYYYMMDD(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getEffectiveHallStatus(hall, now = new Date()) {
  if (!hall) return 'Unknown';

  const baseStatus = hall.status || 'Available';
  if (baseStatus !== 'Under Maintenance') {
    return baseStatus;
  }

  const startDate = (hall.maintenanceStartDate || '').toString().trim();
  const endDate = (hall.maintenanceEndDate || '').toString().trim();

  // If date range is incomplete, keep explicit maintenance status.
  if (!startDate || !endDate) {
    return 'Under Maintenance';
  }

  const today = formatLocalDateYYYYMMDD(now);
  const isInMaintenanceWindow = today >= startDate && today <= endDate;
  return isInMaintenanceWindow ? 'Under Maintenance' : 'Available';
}

function isHallAvailableNow(hall, now = new Date()) {
  return getEffectiveHallStatus(hall, now) === 'Available';
}

function getMaintenanceWindow(hall) {
  if (!hall || hall.status !== 'Under Maintenance') return null;
  const startDate = (hall.maintenanceStartDate || '').toString().trim();
  const endDate = (hall.maintenanceEndDate || '').toString().trim();
  if (!startDate || !endDate) return null;

  const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

  const start = new Date(startYear, startMonth - 1, startDay, 0, 0, 0, 0);
  const end = new Date(endYear, endMonth - 1, endDay, 23, 59, 59, 999);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end, startDate, endDate };
}

function doesScreeningOverlapMaintenance(hall, screeningStart, screeningEnd) {
  const window = getMaintenanceWindow(hall);
  if (!window || !screeningStart || !screeningEnd) return false;
  return screeningStart <= window.end && screeningEnd >= window.start;
}

module.exports = {
  formatLocalDateYYYYMMDD,
  getEffectiveHallStatus,
  isHallAvailableNow,
  getMaintenanceWindow,
  doesScreeningOverlapMaintenance
};

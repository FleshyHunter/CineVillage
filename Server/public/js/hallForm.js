// Hall Form Seat Layout Builder
let currentEditMode = 'normal';
let seatData = {};

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeHallForm();
});

function initializeHallForm() {
  // Button handlers
  document.getElementById('normalBtn').addEventListener('click', () => setEditMode('normal'));
  document.getElementById('removeBtn').addEventListener('click', () => setEditMode('removed'));
  document.getElementById('wheelchairBtn').addEventListener('click', () => setEditMode('wheelchair'));

  // Regenerate seats when layout inputs change
  document.getElementById('rows').addEventListener('input', generateSeats);
  document.getElementById('columns').addEventListener('input', generateSeats);
  document.getElementById('wingColumns').addEventListener('input', generateSeats);

  // Maintenance duration toggle based on status
  const statusSelect = document.getElementById('status');
  const maintenanceStartInput = document.getElementById('maintenanceStartDate');
  const maintenanceEndInput = document.getElementById('maintenanceEndDate');

  if (maintenanceStartInput && maintenanceEndInput) {
    maintenanceStartInput.addEventListener('change', syncMaintenanceDateBounds);
    maintenanceEndInput.addEventListener('change', syncMaintenanceDateBounds);
    maintenanceStartInput.addEventListener('change', updateHallStatusDisplay);
    maintenanceEndInput.addEventListener('change', updateHallStatusDisplay);
    maintenanceStartInput.addEventListener('change', () => validateMaintenanceRange(false));
    maintenanceEndInput.addEventListener('change', () => validateMaintenanceRange(false));
    maintenanceStartInput.addEventListener('input', () => validateMaintenanceRange(false));
    maintenanceEndInput.addEventListener('input', () => validateMaintenanceRange(false));
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', syncMaintenanceDurationState);
    statusSelect.addEventListener('change', syncMaintenanceDateBounds);
    statusSelect.addEventListener('change', updateHallStatusDisplay);
    statusSelect.addEventListener('change', () => validateMaintenanceRange(false));
    syncMaintenanceDurationState();
    syncMaintenanceDateBounds();
    updateHallStatusDisplay();
    validateMaintenanceRange(false);
  }

  // Save seat configuration before form submit
  document.querySelector('form').addEventListener('submit', (e) => {
    if (!validateMaintenanceRange(true)) {
      e.preventDefault();
      return;
    }

    syncMaintenanceDurationState();
    const rows = Math.min((parseInt(document.getElementById('rows').value, 10) || 0), 20);
    const columns = Math.min((parseInt(document.getElementById('columns').value, 10) || 0), 17);
    sanitizeSeatData(rows, columns);
    document.getElementById('seatConfig').value = JSON.stringify(seatData);
  });

  generateSeats();
}

function syncMaintenanceDurationState() {
  const statusSelect = document.getElementById('status');
  const startInput = document.getElementById('maintenanceStartDate');
  const endInput = document.getElementById('maintenanceEndDate');

  if (!statusSelect || !startInput || !endInput) return;

  const isUnderMaintenance = statusSelect.value === 'Under Maintenance';

  if (isUnderMaintenance) {
    startInput.disabled = false;
    endInput.disabled = false;
    startInput.required = true;
    endInput.required = true;
    startInput.classList.remove('maintenance-duration-inactive');
    endInput.classList.remove('maintenance-duration-inactive');
  } else {
    startInput.required = false;
    endInput.required = false;
    startInput.value = '';
    endInput.value = '';
    startInput.disabled = true;
    endInput.disabled = true;
    startInput.classList.add('maintenance-duration-inactive');
    endInput.classList.add('maintenance-duration-inactive');
  }
}

function syncMaintenanceDateBounds() {
  const startInput = document.getElementById('maintenanceStartDate');
  const endInput = document.getElementById('maintenanceEndDate');
  if (!startInput || !endInput) return;
  // Do not set endInput.min dynamically because some browsers
  // aggressively reset partially typed date values.
  endInput.removeAttribute('min');
}

function validateMaintenanceRange(showMessage = false) {
  const statusSelect = document.getElementById('status');
  const startInput = document.getElementById('maintenanceStartDate');
  const endInput = document.getElementById('maintenanceEndDate');
  if (!statusSelect || !startInput || !endInput) return true;

  endInput.setCustomValidity('');

  if (statusSelect.value !== 'Under Maintenance') {
    return true;
  }

  if (!startInput.value || !endInput.value) {
    return true;
  }

  if (endInput.value < startInput.value) {
    const message = 'End date cannot be earlier than start date.';
    endInput.setCustomValidity(message);
    if (showMessage && typeof endInput.reportValidity === 'function') {
      endInput.reportValidity();
    }
    return false;
  }

  return true;
}

function formatDateShort(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [yyyy, mm, dd] = dateStr.split('-');
  return `${dd}/${mm}/${yyyy.slice(2)}`;
}

function updateHallStatusDisplay() {
  const statusSelect = document.getElementById('status');
  const startInput = document.getElementById('maintenanceStartDate');
  const endInput = document.getElementById('maintenanceEndDate');
  const statusDisplay = document.getElementById('statusDisplayText');
  if (!statusSelect || !startInput || !endInput || !statusDisplay) return;

  if (statusSelect.value !== 'Under Maintenance') {
    statusDisplay.textContent = 'Available';
    return;
  }

  const start = formatDateShort(startInput.value);
  const end = formatDateShort(endInput.value);
  if (start && end) {
    statusDisplay.textContent = `Under Maintenance (${start} - ${end})`;
  } else {
    statusDisplay.textContent = 'Under Maintenance';
  }
}

function setEditMode(mode) {
  currentEditMode = mode;
  document.querySelectorAll('.seat-edit-btn').forEach(btn => btn.classList.remove('active'));

  const btnIdMap = {
    normal: 'normalBtn',
    removed: 'removeBtn',
    wheelchair: 'wheelchairBtn'
  };

  const activeButton = document.getElementById(btnIdMap[mode]);
  if (activeButton) activeButton.classList.add('active');
}

function sanitizeSeatData(rows, columns) {
  const sanitized = {};

  Object.entries(seatData).forEach(([key, value]) => {
    const [rowText, colText] = key.split('-');
    const row = Number.parseInt(rowText, 10);
    const col = Number.parseInt(colText, 10);

    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    if (row < 0 || row >= rows || col < 0 || col >= columns) return;

    sanitized[key] = value;
  });

  seatData = sanitized;
}

function shouldInsertWingLaneAfterColumn(column, columns, wingColumns) {
  if (wingColumns <= 0 || wingColumns >= columns) return false;

  const leftBoundaryColumn = wingColumns - 1;
  const rightBoundaryColumn = columns - wingColumns - 1;
  const nextColumn = column + 1;

  if (column !== leftBoundaryColumn && column !== rightBoundaryColumn) {
    return false;
  }

  if (nextColumn >= columns) return false;

  return true;
}

function createLaneElement() {
  const lane = document.createElement('div');
  lane.className = 'seat-lane';
  return lane;
}

function generateSeats() {
  const rows = Math.min((parseInt(document.getElementById('rows').value, 10) || 0), 20);
  const columns = Math.min((parseInt(document.getElementById('columns').value, 10) || 0), 17);
  const wingColumns = parseInt(document.getElementById('wingColumns').value, 10) || 0;

  sanitizeSeatData(rows, columns);

  if (rows === 0 || columns === 0) {
    document.getElementById('seatGrid').innerHTML = '<p style="color: var(--text-muted); text-align: center;">Enter rows and columns to see layout preview</p>';
    updateCapacity();
    return;
  }

  const seatGrid = document.getElementById('seatGrid');
  seatGrid.innerHTML = '';

  for (let row = 0; row < rows; row += 1) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'seat-row';

    const rowLabel = document.createElement('div');
    rowLabel.className = 'seat-row-label';
    rowLabel.textContent = String.fromCharCode(65 + row);
    rowDiv.appendChild(rowLabel);

    for (let col = 0; col < columns; col += 1) {
      rowDiv.appendChild(createSeat(row, col));

      if (shouldInsertWingLaneAfterColumn(col, columns, wingColumns)) {
        rowDiv.appendChild(createLaneElement());
      }
    }

    seatGrid.appendChild(rowDiv);
  }

  updateCapacity();
}

function createSeat(row, col) {
  const seat = document.createElement('div');
  seat.className = 'seat';
  seat.dataset.row = row;
  seat.dataset.col = col;

  const seatKey = `${row}-${col}`;
  const seatState = seatData[seatKey] || 'normal';

  if (seatState === 'removed') {
    seat.classList.add('removed');
    seat.textContent = '✕';
  } else if (seatState === 'wheelchair') {
    seat.classList.add('wheelchair');
    seat.textContent = 'W';
  }

  seat.addEventListener('click', () => {
    const key = `${row}-${col}`;
    const currentState = seatData[key] || 'normal';

    if (currentState === currentEditMode) {
      seatData[key] = 'normal';
      seat.className = 'seat';
      seat.textContent = '';
    } else {
      seatData[key] = currentEditMode;
      seat.className = 'seat';

      if (currentEditMode === 'removed') {
        seat.classList.add('removed');
        seat.textContent = '✕';
      } else if (currentEditMode === 'wheelchair') {
        seat.classList.add('wheelchair');
        seat.textContent = 'W';
      } else {
        seat.textContent = '';
      }
    }

    updateCapacity();
  });

  return seat;
}

function updateCapacity() {
  const rows = parseInt(document.getElementById('rows').value, 10) || 0;
  const columns = parseInt(document.getElementById('columns').value, 10) || 0;
  const totalSeats = rows * columns;

  let removedCount = 0;
  Object.values(seatData).forEach((state) => {
    if (state === 'removed') removedCount += 1;
  });

  const capacity = totalSeats - removedCount;
  document.getElementById('capacity').value = Math.max(capacity, 0);
}

// Function to load existing seat data when editing
function loadSeatData(data) {
  seatData = data || {};
  setTimeout(generateSeats, 100);
}

// Export for use in EJS templates
if (typeof window !== 'undefined') {
  window.loadSeatData = loadSeatData;
}

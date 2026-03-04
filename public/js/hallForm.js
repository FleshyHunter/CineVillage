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
  }

  if (statusSelect) {
    statusSelect.addEventListener('change', syncMaintenanceDurationState);
    statusSelect.addEventListener('change', syncMaintenanceDateBounds);
    statusSelect.addEventListener('change', updateHallStatusDisplay);
    syncMaintenanceDurationState();
    syncMaintenanceDateBounds();
    updateHallStatusDisplay();
  }

  // Save seat configuration before form submit
  document.querySelector('form').addEventListener('submit', (e) => {
    syncMaintenanceDurationState();
    document.getElementById('seatConfig').value = JSON.stringify(seatData);
  });
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

  if (startInput.value) {
    endInput.min = startInput.value;
    if (endInput.value && endInput.value < startInput.value) {
      endInput.value = startInput.value;
    }
  } else {
    endInput.min = '';
  }
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
  const btnId = mode === 'normal' ? 'normalBtn' : mode === 'removed' ? 'removeBtn' : 'wheelchairBtn';
  document.getElementById(btnId).classList.add('active');
}

function generateSeats() {
  const rows = Math.min((parseInt(document.getElementById('rows').value) || 0), 20);
  const columns = Math.min((parseInt(document.getElementById('columns').value) || 0), 17);
  const wingColumns = parseInt(document.getElementById('wingColumns').value) || 0;



  if (rows === 0 || columns === 0) {
    document.getElementById('seatGrid').innerHTML = '<p style="color: var(--text-muted); text-align: center;">Enter rows and columns to see layout preview</p>';
    return;
  }

  

  const seatGrid = document.getElementById('seatGrid');
  seatGrid.innerHTML = '';

  for (let row = 0; row < rows; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'seat-row';

    // Row label (A, B, C, etc.)
    const rowLabel = document.createElement('div');
    rowLabel.className = 'seat-row-label';
    rowLabel.textContent = String.fromCharCode(65 + row);
    rowDiv.appendChild(rowLabel);

    let colIndex = 0;

    // Left wing
    for (let i = 0; i < wingColumns && i < columns; i++) {
      const seat = createSeat(row, colIndex);
      rowDiv.appendChild(seat);
      colIndex++;
    }

    // Left lane (if we have wing columns)
    if (wingColumns > 0 && wingColumns < columns) {
      const lane = document.createElement('div');
      lane.className = 'seat-lane';
      rowDiv.appendChild(lane);
    }

    // Middle section
    const middleCols = columns - (wingColumns * 2);
    for (let i = 0; i < middleCols && colIndex < columns; i++) {
      const seat = createSeat(row, colIndex);
      rowDiv.appendChild(seat);
      colIndex++;
    }

    // Right lane (if we have wing columns and right wing exists)
    if (wingColumns > 0 && columns > wingColumns && colIndex < columns) {
      const lane = document.createElement('div');
      lane.className = 'seat-lane';
      rowDiv.appendChild(lane);
    }

    // Right wing
    while (colIndex < columns) {
      const seat = createSeat(row, colIndex);
      rowDiv.appendChild(seat);
      colIndex++;
    }

    seatGrid.appendChild(rowDiv);
  }

  // Update capacity
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

    // If clicking with same mode, toggle back to normal
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
  const rows = parseInt(document.getElementById('rows').value) || 0;
  const columns = parseInt(document.getElementById('columns').value) || 0;
  const totalSeats = rows * columns;
  
  let removedCount = 0;
  Object.values(seatData).forEach(state => {
    if (state === 'removed') removedCount++;
  });

  const capacity = totalSeats - removedCount;
  document.getElementById('capacity').value = capacity;
}

// Function to load existing seat data when editing
function loadSeatData(data) {
  if (data) {
    seatData = data;
    setTimeout(generateSeats, 100);
  }
}

// Export for use in EJS templates
if (typeof window !== 'undefined') {
  window.loadSeatData = loadSeatData;
}

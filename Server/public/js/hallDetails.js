// Hall Details Seat Layout Display
let hallData = {
  rows: 0,
  columns: 0,
  wingColumns: 0,
  seatConfig: {}
};

function setHallData(rows, columns, wingColumns, seatConfig) {
  hallData = {
    rows: rows || 0,
    columns: columns || 0,
    wingColumns: wingColumns || 0,
    seatConfig: seatConfig || {}
  };

  generateSeatsDisplay();
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

function generateSeatsDisplay() {
  if (hallData.rows === 0 || hallData.columns === 0) {
    document.getElementById('seatGridDetail').innerHTML = '<p style="color: var(--text-muted); text-align: center;">No seat layout configured</p>';
    return;
  }

  const seatGrid = document.getElementById('seatGridDetail');
  seatGrid.innerHTML = '';

  for (let row = 0; row < hallData.rows; row += 1) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'seat-row';

    const rowLabel = document.createElement('div');
    rowLabel.className = 'seat-row-label';
    rowLabel.textContent = String.fromCharCode(65 + row);
    rowDiv.appendChild(rowLabel);

    for (let col = 0; col < hallData.columns; col += 1) {
      rowDiv.appendChild(createSeatDisplay(row, col));

      if (shouldInsertWingLaneAfterColumn(col, hallData.columns, hallData.wingColumns)) {
        rowDiv.appendChild(createLaneElement());
      }
    }

    seatGrid.appendChild(rowDiv);
  }
}

function createSeatDisplay(row, col) {
  const seat = document.createElement('div');
  seat.className = 'seat';

  const seatKey = `${row}-${col}`;
  const seatState = hallData.seatConfig[seatKey] || 'normal';

  if (seatState === 'removed') {
    seat.classList.add('removed');
    seat.textContent = '✕';
  } else if (seatState === 'wheelchair') {
    seat.classList.add('wheelchair');
    seat.textContent = 'W';
  }

  return seat;
}

// Export for use in EJS templates
if (typeof window !== 'undefined') {
  window.setHallData = setHallData;
  window.generateSeatsDisplay = generateSeatsDisplay;
}

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
  
  // Regenerate display after setting data
  generateSeatsDisplay();
}

function generateSeatsDisplay() {
  if (hallData.rows === 0 || hallData.columns === 0) {
    document.getElementById('seatGridDetail').innerHTML = '<p style="color: var(--text-muted); text-align: center;">No seat layout configured</p>';
    return;
  }

  const seatGrid = document.getElementById('seatGridDetail');
  seatGrid.innerHTML = '';

  for (let row = 0; row < hallData.rows; row++) {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'seat-row';

    // Row label
    const rowLabel = document.createElement('div');
    rowLabel.className = 'seat-row-label';
    rowLabel.textContent = String.fromCharCode(65 + row);
    rowDiv.appendChild(rowLabel);

    let colIndex = 0;

    // Left wing
    for (let i = 0; i < hallData.wingColumns && i < hallData.columns; i++) {
      const seat = createSeatDisplay(row, colIndex);
      rowDiv.appendChild(seat);
      colIndex++;
    }

    // Left lane
    if (hallData.wingColumns > 0 && hallData.wingColumns < hallData.columns) {
      const lane = document.createElement('div');
      lane.className = 'seat-lane';
      rowDiv.appendChild(lane);
    }

    // Middle section
    const middleCols = hallData.columns - (hallData.wingColumns * 2);
    for (let i = 0; i < middleCols && colIndex < hallData.columns; i++) {
      const seat = createSeatDisplay(row, colIndex);
      rowDiv.appendChild(seat);
      colIndex++;
    }

    // Right lane
    if (hallData.wingColumns > 0 && hallData.columns > hallData.wingColumns && colIndex < hallData.columns) {
      const lane = document.createElement('div');
      lane.className = 'seat-lane';
      rowDiv.appendChild(lane);
    }

    // Right wing
    while (colIndex < hallData.columns) {
      const seat = createSeatDisplay(row, colIndex);
      rowDiv.appendChild(seat);
      colIndex++;
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

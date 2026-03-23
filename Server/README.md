# CineVillage 
CineVillage is a cinema management system that helps staff manage movies, halls, screenings, and daily operations in one platform. This project show cases CineVillage's Admin Management System

## Setup Instructions
### 1. Clone this repository
Clone this repository to a folder of your choice.

```bash
git clone https://github.com/FleshyHunter/CineVillage
```

### 2. Running the Application
(a) Install all required dependencies:
```
npm install
```

(b) Add `.env` file
```
OMDB_KEY=YOUR_OMDB_API_KEY

SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your_email@gmail.com
SMTP_PASS=YOUR_16_CHARACTER_APP_PASSWORD

SMTP_FROM="YourAppName <your_email@gmail.com>"
```
(c) Database Configuration
- Database Type: MongoDB (Localhost)
- Database Name: assignment1

(d) Default Accounts' Information

- Admin Email: admin@gmail.com
- Admin Password: admin

- Manager / Staff Email: [TO BE CREATED BY ADMIN]
- Manager / Staff Password: personnel

(e) Launch App and navigate to the link in the output
```
npm run server
```
- Output should be `http:localhost:3000`

## Overview
---------------------------
Global UI
---------------------------

Sidebar + Header
- Sidebar provides quick navigation buttons.
- Access to buttons is restricted based on user roles.
- Profile picture and account name are displayed at the top right.
- Clicking the profile icon allows users to view their profile.


---------------------------
Dashboard
---------------------------

Movie Container
Displays the number of movies categorized as:
- Now Showing
- Coming Soon
- Discontinued

Hall Container
Displays the number of halls categorized as:
- Active
- Under Maintenance

Screening Container
Displays the number of screenings categorized as:
- Shown Today
- Completed Today

New Movies
- Displays the 5 most recently added movies.
- Clicking the movie card opens detailed movie information.
- Includes "View All Movies" and "Create Movie" shortcuts.

Upcoming Screenings
- Displays screenings sorted chronologically.
- Excludes screenings that have already passed.
- Includes "View All Screenings" and "Create Screening" shortcuts.
- Pagination of 10 rows per page.


---------------------------
Profile
---------------------------

- Users can view their profile information including profile picture.
- Users may edit personal information except for their assigned role.
- Password change occurs only if both password fields match and are not empty.


---------------------------
Movies
---------------------------

Filtering
Movies can be filtered by:
- All
- Now Showing
- Coming Soon
- Discontinued

Additional filters include:
- Hall
- Date
- Chronological order
- Alphabetical order
- Search bar

Movie Display
Movies are displayed as cards containing:
- Movie image
- Name
- Duration
- Release date
- Category tag
- Rating recommendation (e.g. R21)

Movie Details
- Clicking a movie card displays detailed movie information.
- Movies can be edited using a pre-populated form.
- Movies cannot be deleted if screenings exist.


Add Movie
- Allows photo upload.
- If no photo is uploaded, a default movie image is used.


---------------------------
Halls
---------------------------

Filtering
Halls can be filtered by:
- All
- Standard
- IMAX
- VIP
- Maintenance

Additional filters:
- Capacity
- Date
- Alphabetical order
- Search bar

Hall Display
Halls are shown as cards containing:
- Preset image
- Name
- Capacity
- Availability tag
- Wheelchair accessibility tag

Hall Rules
- Halls cannot be deleted if screenings exist.
- Halls placed under maintenance automatically pause screenings during that period.


Add Hall
- Maintenance duration can only be entered if the hall status is "Under Maintenance".
- Halls can still be used for screenings outside the maintenance period.
- Maintenance period is treated as:
  Date A 00:00 → Date B 23:59.

Seat Layout Builder
Users may configure:
- Rows
- Columns
- Wing columns (for aisle creation)

Seat types:
- Normal seat
- Removed seat
- Wheelchair seat

A live preview of the seating layout is displayed.


---------------------------
Screenings
---------------------------

Create Screening Shortcut available in all filters.

Filters
- All
- Movie
- Hall
- Date
- Paused
- Completed

All
- Filter by date, hall, chronological order, and search.
- Screenings listed with detailed view option.

Movie
- Movies filtered by:
  Now Showing
  Coming Soon
  Alphabetical order
- Clicking a movie displays all screenings for that movie.

Hall
- Filter halls by type and capacity.
- Selecting a hall allows viewing screenings by date.

Date
- Displays screenings by selected date.
- Includes previous day / next day navigation.

Paused
- Displays screenings paused due to maintenance.

Completed
- Displays screenings that have already finished.


Create Screening

Schedule Preview
- After selecting a hall and date, a timeline preview is generated.

Colour indicators:
- Green = Available
- Red = Existing screening
- Blue = Current screening preview

If scheduling conflicts occur:
- System prevents screening creation.

Screening Time Logic
End Time = Start Time + Movie Duration + 15 minutes cleaning time

The result is rounded up to the next 15-minute interval.

Client-side JavaScript is used for preview rendering.


---------------------------
Personnel Management
---------------------------

Personnel List
- View all personnel.
- Filter by:
  All
  Manager
  Staff
- Additional alphabetical filtering and search.

Only Admin users can modify:
- Personnel roles
- Personnel status


Create Personnel
- Form to create personnel accounts.
- Role and status assigned during creation.


---------------------------
History
---------------------------

Logs database actions performed by personnel.

Recorded details:
- User performing the action
- Action type
- Date and time

Filters include:
- Role (Manager / Staff)
- Entity type (Movie / Hall / Screening)


---------------------------
Authentication
---------------------------

Session-based role management.

Role Permissions

Admin
- Full system access.

Manager
- Full access except personnel management.

Staff
- View movie and hall information only.
- Full access to screening creation and management.

Security
- Passwords are hashed.
- Reset password functionality via email reset link.


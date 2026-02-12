# Trello Power-Ups

A collection of custom Trello Power-Ups designed to enhance workflow management and productivity.

## Overview

This repository contains three Trello Power-Ups that integrate with your Trello boards to provide additional functionality:

1. **Time in List** - Tracks how long cards spend in each list with business time calculations

2. **Start Case** - Automates case initiation by moving cards, assigning members, and setting due dates

3. **List Report** - Generates a CSV report for a selected list with member-level metrics and optional cycle time (current work → released)

## Power-Ups

### Time in List

Tracks and displays the time cards spend in each list, excluding weekends and company holidays.

#### Features

- **Time Tracking**: Automatically tracks time spent in each list
- **Business Time Calculation**: Excludes weekends and US federal holidays
- **Pause/Resume Functionality**: Manually pause and resume time tracking
- **Auto-pause on list move**: Automatically pause the timer when a card is moved to configured lists, and resume when moved to another list
- **Visual Progress Bars**: Shows relative time spent in each list
- **Card Badges**: Displays current list time directly on cards
- **Detailed History**: View complete movement history with time breakdowns

#### Configuring auto-pause

You can choose which lists automatically pause the timer when a card is moved to them (e.g. "Blocked", "On hold"). Configuration is per board and is done in the Power-Up settings:

1. On your Trello board, open **Power-Ups** in the board menu.
2. Find **Time in List** under enabled Power-Ups and open its **Settings** (gear/cog icon).
3. In the settings page, use the **Auto-pause lists** section:
   - Check the box next to each list that should trigger auto-pause when a card is moved into it.
   - Leave unchecked any list where the timer should keep running.
4. Click **Save**.

After saving, moving a card **into** one of the selected lists will pause the timer automatically. Moving the card **out** of that list will resume the timer (only if it was auto-paused; manual pauses are not auto-resumed).

#### Usage

1. Enable the Power-Up on your board
2. Authorize the Power-Up to access your Trello data
   - **If you previously authorized this Power up**
   - Go to your profile, Settings, scroll down until you see **applications**, search for "Time in list TT" and revoke the permissions
   - Then go to the power ups in your board, go to enabled, search for Time In List TT, click settings and then "Remove personal settings""
   - Reload the page and click authorize button in the power up 
3. View time tracking:
   - **Card Badge**: Shows time in current list on card front
   - **Card Back Section**: Click "Time in List" to see detailed history
   - **Card Buttons**: Use pause/resume buttons to control tracking

#### Business Time Rules

- Only counts weekdays (Monday-Friday)
- Excludes US federal holidays:
  - New Year's Day (Jan 1)
  - Martin Luther King, Jr. Day (3rd Monday in Jan)
  - Memorial Day (Last Monday in May)
  - Independence Day (Jul 4)
  - Labor Day (1st Monday in Sep)
  - Thanksgiving Day (4th Thursday in Nov)
  - Christmas Day (Dec 25)
  - New Year's Eve (Dec 31)

### Start Case

Automates the workflow of starting a new case by moving cards to development, assigning team members, and calculating due dates.

#### Features

- **Automatic List Movement**: Moves card to "IN DEVELOPMENT" list
- **Member Assignment**: Assigns the current member to the card
- **Business Day Due Dates**: Calculates due dates based on "Days to Release" custom field
- **One-Click Workflow**: Single button executes entire workflow

#### Usage

1. Enable the Power-Up on your board
2. Authorize the Power-Up to access your Trello data
3. Create a "Days to Release" custom field on your board
4. Set the "Days to Release" value on cards
5. Click "Start Case" button on any card

#### Requirements

- Board must have a list named "IN DEVELOPMENT"
- Board must have a custom field named "Days to Release" (number type)

### List Report

Generates a CSV report for a selected list with one row per member (plus "Unassigned" and a TOTALS row). Columns include Size breakdown, Days to Release breakdown, On Time, Past Due, Total Cards, and optionally **Avg days (current → released)**.

#### Features

- **Board-level report**: Select any list on the board and download a CSV.
- **Per-member metrics**: Size and Days to Release breakdowns, on-time vs past-due counts, total cards.
- **Avg days (current → released)**: When configured in settings, shows the average number of days (rounded to nearest integer) that cards took to move from the current work list to the released list.

#### Configuring the report (Settings)

1. On your Trello board, open **Power-Ups** in the board menu.
2. Find **List Report** under enabled Power-Ups and open its **Settings** (gear icon).
3. **Current work list**: Choose the list that represents work in progress (e.g. "IN DEVELOPMENT"). Used to compute how long cards take from this list until release.
4. **Released list**: Choose the list that represents released/done work (e.g. "ON MAIN").
5. Click **Save**.

If either list is not set, the report still runs but the "Avg days (current → released)" column is omitted from the CSV.

#### Avg days (current → released) column

When both lists are configured in settings, the CSV includes an extra column with the average number of days (rounded to nearest integer) that cards took to move from the current work list to the released list, per member. Members with no cards that completed that path show a blank cell. The TOTALS row shows the overall average across all such cards.

#### Optional board custom fields

The report can show breakdowns by **Size** and **Days to Release** if the board has custom fields with those names (case-insensitive).

#### Usage

1. Enable the Power-Up on your board.
2. Authorize the Power-Up to access your Trello data.
3. (Optional) Configure **Current work list** and **Released list** in Settings for the cycle-time column.
4. Click the board button **Generate List Report**, select a list, and download the CSV.

## Installation

### Prerequisites

- Trello account with board access
- Permission to add Power-Ups to your board

### Setup

1. Go to your Trello board
2. Click "Power-Ups" in the board menu
3. Click "Add Power-Ups"
4. Search for the Power-Up name or add custom Power-Up
5. Enable the Power-Up
6. Authorize when prompted

### Hosting

These Power-Ups are hosted via GitHub Pages:

```
https://turbotenant.github.io/trello-powerups/time-in-list/
https://turbotenant.github.io/trello-powerups/start-case/
https://turbotenant.github.io/trello-powerups/list-report/
```

## Project Structure

```
trello-powerups/
├── shared/                      # Shared utilities
│   ├── auth-helpers.js         # Authorization helpers
│   ├── date-helpers.js         # Business time calculations
│   └── trello-api.js           # Shared Trello API helpers
├── time-in-list/               # Time in List Power-Up
│   ├── authorize.html          # Authorization page
│   ├── constants.js            # App configuration
│   ├── index.html              # Main UI
│   ├── power-up.js             # Power-Up logic
│   ├── settings.html           # Auto-pause lists configuration
│   └── style.css               # Styles
├── start-case/                 # Start Case Power-Up
│   ├── authorize.html          # Authorization page
│   ├── constants.js            # App configuration
│   ├── index.html              # Main page
│   └── power-up.js             # Power-Up logic
└── list-report/                # List Report Power-Up
    ├── authorize.html          # Authorization page
    ├── constants.js            # App configuration
    ├── index.html              # Connector entry
    ├── list-report-api.js      # Trello API and board storage
    ├── list-report-helpers.js  # Card/date and custom field helpers
    ├── list-report-report.js   # Aggregation, CSV generation, report flow
    ├── list-selection.html     # List picker popup
    ├── power-up.js             # Power-Up logic
    └── settings.html           # Board settings (current work / released list)
```

## Technical Details

### Shared Utilities

#### Authorization (`shared/auth-helpers.js`)

- `getAuthToken(t)`: Retrieves stored authorization token
- `handleAuthorization(t, authBtn, onSuccess)`: Manages OAuth flow
- `showAuthorizePopup(t, event)`: Displays authorization popup

#### Date Helpers (`shared/date-helpers.js`)

- `calculateBusinessMinutes(startDate, endDate)`: Calculates business time between dates
- `addBusinessDays(startDate, daysToAdd)`: Adds business days to a date
- `getHolidaysForYear(year)`: Generates holiday dates for a year
- `isBusinessDay(date, holidaysByYear)`: Checks if date is a business day

#### Trello API (`shared/trello-api.js`)

- `fetchBoardLists(boardId, token)`: Fetches all lists for a board
- `fetchCardActions(cardId, token, filter)`: Fetches card actions (e.g. list movements, createCard)

### List Report Module Structure

The List Report Power-Up is split into API, helpers, and report modules:

#### List Report API (`list-report/list-report-api.js`)

- Board storage for current work list and released list IDs
- Batched card fetching with rate limiting
- Trello API calls for cards, custom fields, and member data

#### List Report Helpers (`list-report/list-report-helpers.js`)

- `getCardCreationDate(cardId)`: Extracts creation timestamp from Trello card ID
- `getListMovementsChronological(actions, cardId)`: Returns list movements in chronological order
- Card completion date and cycle-time calculations
- Custom field value extraction (Size, Days to Release)

#### List Report Report (`list-report/list-report-report.js`)

- Member-level aggregation (sizes, days to release, on-time, past-due)
- CSV generation and download
- Report flow orchestration

### Dependencies

- [Trello Power-Up Client Library](https://trello.com/power-ups/admin)
- [Day.js](https://day.js.org/) - Date manipulation library

### Storage

All Power-Ups use Trello's storage API:

- **Organization/Board Level**: Authorization tokens
- **Card Level**: Pause/resume events (Time in List only)
- **Board Level (List Report)**: Current work list ID and released list ID (private storage, set in Settings)

## Development

### Local Testing

1. Clone the repository:

```bash
git clone https://github.com/turbotenant/trello-powerups.git
cd trello-powerups
```

2. Serve files locally using any HTTP server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx http-server
```

3. Update the Power-Up URLs in Trello Power-Up settings to point to your local server

### Modifying Holiday Rules

To customize holidays in `shared/date-helpers.js`:

```javascript
const HOLIDAY_RULES = {
  fixed: [
    { month: 0, day: 1, name: "New Year's Day" },
    // Add more fixed holidays
  ],
  floating: [
    { month: 0, dayOfWeek: 1, week: 3, name: "Martin Luther King, Jr. Day" },
    // Add more floating holidays
  ],
};
```

### Adding New Power-Ups

1. Create a new directory in the root
2. Include `power-up.js`, `constants.js`, and HTML files
3. Initialize with `TrelloPowerUp.initialize()`
4. Register callbacks for Trello capabilities

## Capabilities Used

### Time in List

- `on-enable`: Initial authorization
- `card-back-section`: Detailed time display
- `card-badges`: Current list time badge
- `card-buttons`: Pause/resume controls
- `card-detail-badges`: Detailed badges with controls

### Start Case

- `on-enable`: Initial authorization
- `card-buttons`: Start case button

### List Report

- `on-enable`: Initial authorization
- `board-buttons`: Generate List Report button
- `show-settings`: Board settings (current work list, released list)

## Security

- Authorization tokens are stored securely using Trello's private storage
- Tokens have configurable expiration (currently set to "never")
- All API calls use HTTPS
- OAuth scope limited to `read,write` permissions

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Troubleshooting

### Authorization Issues

- Clear browser cache and re-authorize
- Check if token is still valid in Trello settings
- Ensure Power-Up has correct permissions

### Time Tracking Not Working

- Verify card has movement history
- Check browser console for errors
- Ensure authorization is complete

### Start Case Button Not Working

- Verify "IN DEVELOPMENT" list exists on board
- Check "Days to Release" custom field is configured
- Ensure field has a numeric value set

## Contributing

When contributing to this project, please follow the company coding standards outlined in the workspace rules.

### Key Standards

- Use camelCase for variables and functions
- Use PascalCase for classes and constructors
- Add JSDoc comments for functions
- Keep functions focused and single-purpose
- Test thoroughly before committing

## License

Internal use only - TurboTenant

## Support

For issues or questions, contact the development team or create an issue in the repository.

## Changelog

### Version 1.0.0

- Initial release of Time in List Power-Up
- Initial release of Start Case Power-Up
- Business time calculation with holiday support
- Pause/resume functionality
- Automated case workflow


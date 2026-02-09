List Report Power-Up Implementation Plan

Overview

Create a new Trello Power-Up called "List Report" that generates CSV reports with aggregated statistics for cards in a selected list. The power-up will use a board-level button to trigger list selection and report generation.

File Structure

Following the start-case power-up structure:





list-report/ directory





index.html - Main Power-Up initialization page



power-up.js - Main Power-Up logic and CSV generation



constants.js - App configuration (APP_KEY, APP_NAME)



authorize.html - Authorization page (reuse pattern from start-case)

Implementation Details

1. Power-Up Capabilities





board-buttons: Add a "Generate List Report" button at board level



on-enable: Handle initial authorization check

2. Core Functionality

List Selection Popup





When board button is clicked, show a popup with:





Dropdown/select to choose a list from the board



"Generate Report" button



Uses t.popup() with a custom HTML page or modal

Data Collection

For the selected list, fetch:





All cards in the list via /boards/{boardId}/lists/{listId}/cards



For each card:





Members: Get assigned members via idMembers field (array of member IDs)



Member Names: Fetch member details via /members/{memberId} to get full names for CSV



Custom Fields: 





Fetch card custom field items via /cards/{cardId}/customFieldItems



Extract "Days to Release" custom field value (number)



Extract "Size" custom field value (text/option)



Due Date: Get due field from card (ISO date string or null)



List Entry Date: 





Fetch card actions via /cards/{cardId}/actions?filter=updateCard:idList,createCard



Find when card was moved to the selected list (similar to buildCardHistory in time-in-list)



Use the most recent entry into the selected list (or card creation date if never moved)

On-Time vs Past Due Calculation





Compare card's list entry date with card's due date



On Time: Card was moved to list before or on the due date



Past Due: Card was moved to list after the due date



Handle cases where due date is null (exclude from on-time/past-due counts)

Aggregation Logic

Step 1: Collect all unique values





Scan all cards to find all unique Size values



Scan all cards to find all unique Days to Release values



These will become dynamic column headers

Step 2: Build member data structure





Create a map/object keyed by member ID



For each member, initialize counters:





Size counters: { "Small": 0, "Medium": 0, ... }



Days to Release counters: { "5": 0, "10": 0, ... }



onTime: 0



pastDue: 0



total: 0

Step 3: Process each card





For each card:





Get list entry date and due date



Determine on-time status (if due date exists)



For each member assigned to the card:





Increment member's total counter



If card has Size value, increment that member's Size counter



If card has Days to Release value, increment that member's Days to Release counter



If card has due date:





If on time: increment member's onTime counter



If past due: increment member's pastDue counter



If card has no members, add to "Unassigned" member

Step 4: Generate CSV rows





Convert member data structure to CSV rows



Each row represents one member with all their aggregated metrics

3. CSV Generation

CSV Format (Member-Centric with Dynamic Columns)

The CSV will have one row per member with dynamic columns based on the data:

Header Row Structure:





Member - Member name



Dynamic columns for each unique Size value found (e.g., Size Small, Size Medium, Size Large)



Dynamic columns for each unique Days to Release value found (e.g., Days to Release 5, Days to Release 10)



On Time - Count of cards moved before/on due date



Past Due - Count of cards moved after due date



Total Cards - Total cards assigned to member

Example CSV:

Member,Size Small,Size Medium,Size Large,Days to Release 5,Days to Release 10,On Time,Past Due,Total Cards
John Doe,2,3,1,4,2,5,1,6
Jane Smith,1,2,0,2,1,2,1,3
Unassigned,0,1,0,1,0,1,0,1

Implementation Notes:





First pass: Collect all unique Size and Days to Release values across all cards



Build dynamic header with these values



For each member (including "Unassigned" for cards with no members):





Count cards by size



Count cards by days to release



Count on-time cards



Count past-due cards



Calculate total cards

CSV Download





Generate CSV string using aggregated data



Use browser download API (Blob + URL.createObjectURL)



Trigger download with filename like list-report-{listName}-{timestamp}.csv

4. Implementation Files

list-report/power-up.js





generateReportCallback: Main callback for board button



selectListAndGenerate: Show list selection popup



fetchListCards: Get all cards in selected list



getCardListEntryDate: Get when card entered the selected list (using card actions)



aggregateCardData: Process cards and generate aggregated statistics



generateCSV: Convert aggregated data to CSV format



downloadCSV: Trigger CSV download



TrelloPowerUp.initialize with board-buttons and on-enable capabilities

list-report/constants.js





APP_KEY: Trello API key (same as other power-ups)



APP_NAME: "List Report"

list-report/index.html





Load Trello Power-Up library



Load dayjs (for date comparisons)



Load shared auth-helpers



Load constants



Load power-up.js

list-report/authorize.html





Reuse pattern from start-case/authorize.html



Update title and text for "List Report"

5. Key API Calls Needed





GET /boards/{boardId}/lists - Get all lists



GET /lists/{listId}/cards - Get cards in list



GET /cards/{cardId}/customFieldItems - Get custom field values



GET /boards/{boardId}/customFields - Get custom field definitions



GET /cards/{cardId}/actions?filter=updateCard:idList,createCard - Get card movement history



GET /members/{memberId} - Get member details (for names)

6. Error Handling





Handle missing authorization (show authorize popup)



Handle missing custom fields gracefully (show in CSV as "N/A" or empty)



Handle cards without due dates (exclude from on-time/past-due)



Handle API errors with user-friendly messages

7. User Experience Flow





User clicks "Generate List Report" button on board



Popup appears with list selection dropdown



User selects a list and clicks "Generate Report"



Power-up fetches all card data (show loading indicator)



CSV is automatically downloaded



Success message shown

Dependencies





Trello Power-Up Client Library (via CDN)



dayjs (for date comparisons)



Shared utilities: shared/auth-helpers.js, shared/date-helpers.js (if needed for date formatting)

Notes





Member-centric structure: CSV has one row per member with all their metrics



Multiple members: Cards with multiple members appear in each member's row (each member gets full credit)



Unassigned cards: Cards with no members get a row labeled "Unassigned"



Dynamic columns: Size and Days to Release columns are dynamically generated based on values found in the data



Missing custom fields: Cards without Size or Days to Release values are counted but don't contribute to those specific columns



Null due dates: Cards without due dates are excluded from on-time/past-due counts but still counted in total and other metrics



Column ordering: Fixed columns (Member, On Time, Past Due, Total Cards) come first/last, dynamic columns (Size, Days to Release) in between


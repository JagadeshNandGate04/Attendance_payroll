# nandgate-human-resource-backend

## Short-notice and half-day leave

Apply the `add_leave_period` migration before using this feature. Employees
submit leave through `POST /api/v1/leave/me/apply` with `from_date`, `to_date`,
and `reason`. An optional `leave_period` defaults to `FULL_DAY`; use `MORNING`
or `AFTERNOON` for a half-day on a single working date:

```json
{
  "from_date": "2026-11-25",
  "to_date": "2026-11-25",
  "leave_period": "MORNING",
  "reason": "Emergency appointment"
}
```

Half-day requests reserve and consume 0.5 leave day and count as 0.5 toward
the monthly limit. Requests for the same date cannot overlap. Approval still
requires an admin decision and existing balance, holiday and payroll-lock
checks apply. The selected period is informational: applications do not
require punches, and the normal late-arrival rule remains in effect.
On approval, attendance uses actual punches: at least the configured
`half_day_hours` results in `HALF_DAY` with zero LOP, fewer hours in `ABSENT`
with 1 LOP, and incomplete punches in `INSUFFICIENT` with 0.5 LOP and a
regularization flag. Future dates without a summary are calculated when
attendance is processed, not as an advance absence. Attendance totals include
0.5 leave for a processed half-day alongside its worked/absent status.

All active admins receive a `LEAVE_REQUEST` notification with employee,
dates, period and duration. If the leave starts today or tomorrow in
`TIMEZONE` (default `Asia/Kolkata`), `data.priority` is `HIGH` and the title
is "Priority Leave Request"; otherwise it is `NORMAL`. Unread high-priority
notifications appear first in the existing notification list and pending push
jobs are prioritized. Push delivery still depends on registered device tokens
and the notification worker. Reading a notification does not approve or
reject a leave request.

Run the integration test with
`TEST_DATABASE_URL=postgresql://... node --test tests/shortNoticeLeave.test.js`.
It creates and removes a uniquely named schema in the supplied test database.

## Employee-specific workday swaps

An administrator can assign selected active employees a shutdown workday and a
replacement day that is normally configured as a weekly off day. The shutdown
date is recorded as a holiday for those employees only. Attendance on their
replacement date is calculated as a regular scheduled workday: working it
avoids LOP, while missing it receives the normal absence/LOP calculation.
Employees not included in the swap keep the existing attendance and payroll
rules. Payroll consumes the recomputed daily summaries, so no separate payroll
adjustment is needed.

These admin endpoints are under `/api/v1/settings`:

- `GET /getWorkdaySwaps?year=2026` lists swaps by shutdown year.
- `POST /createWorkdaySwap` creates a group for the supplied employees:

  ```json
  {
    "shutdown_date": "2026-11-18",
    "replacement_date": "2026-11-21",
    "user_ids": [12, 13],
    "reason": "Wednesday shutdown; Saturday replacement shift"
  }
  ```

- `DELETE /deleteWorkdaySwap/:id` removes a swap group and recalculates both
  dates for its employees.

The replacement date must be a configured weekly off day, the shutdown date
must be a normally scheduled workday, and neither date may be a configured
public holiday. Creation and deletion are blocked if either date belongs to a
locked attendance month. Apply the `workday_swaps` migration before using these
endpoints.

## Employee designations

Administrators can manage designation options under `/api/v1/settings`:

- `GET /getDesignations` lists available designations for employee create/edit
  forms.
- `POST /createDesignation` adds an option:

  ```json
  {
    "name": "Senior QA/QC Engineer"
  }
  ```

Designation names are trimmed, must be unique (case-insensitively), and may be
up to 80 characters. The migration seeds the list with existing employee
designations so current values remain available in the dropdown. Apply the
`create_designations` migration before using these endpoints.

## Employee dashboard

After an employee logs in, dashboard data is available from the authenticated
endpoint `GET /api/v1/employees/me/dashboard`. It returns the employee's
username, today's first punch-in time and attendance status, the current
month's calendar with attendance and relevant holiday, leave, and
compensation-workday events, the month-to-date LOP total, and leave balance.
It also includes the 20 most recent admin announcements addressed to that
employee. The employee identity is taken from the access token; the request
does not accept an employee ID.

The employee calendar is also available independently at
`GET /api/v1/employees/me/calendar`. It defaults to the current month and
accepts optional `month` and `year` query parameters together, for example
`GET /api/v1/employees/me/calendar?month=11&year=2026`. Each day includes that
employee's attendance and events for common or employee-specific holidays,
approved or pending leave, and compensation holidays/workdays. Compensation
workday events include whether attendance shows work and the attendance status.
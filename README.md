# nandgate-human-resource-backend

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
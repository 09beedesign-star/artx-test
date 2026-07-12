# Account List Layout

## Goal

Balance the account management table after adding the registration-time column. Account names must not consume unused horizontal space, and the registration time must remain readable to seconds.

## Layout

- Use an explicit table column layout rather than browser auto sizing.
- Give the account identity column a bounded 18rem width with truncation for long names and email addresses.
- Give registration time an 11rem fixed column and retain `YYYY/MM/DD HH:mm:ss` without wrapping.
- Keep compact fixed widths for plan, role, credit balance, cumulative payment, and status.
- Let recent activity and its actions consume the remaining width.
- Preserve horizontal scrolling on narrow screens.

## Verification

- Add a focused source-level regression test for the column layout classes.
- Run the relevant admin page tests, type checking, and the production build.
- Publish to `https://admin.artxsd.com/` and verify its deployed commit and health endpoint.

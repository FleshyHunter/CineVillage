# DB validation

## Current risk
- Frontend dropdown options are not security controls.
- A user can edit HTML in DevTools and submit unexpected values (for example, a new `hall type`).
- Current hall create/update flow accepts `req.body` and can persist tampered values if backend does not explicitly reject them.

## What to enforce
1. Server-side whitelist validation for `hall type` (allow only expected values).
2. Reject invalid input with a `400` response (or form error), do not save.
3. MongoDB schema validation (`$jsonSchema` with `enum`) as a second layer.

## Rule of thumb
- Client-side validation = user experience.
- Backend + database validation = security and data integrity.

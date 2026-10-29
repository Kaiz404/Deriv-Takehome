# Data Retention and Deletion

## What we retain

Customer records you store through the API are retained for as long as your account is active. API request logs are retained for 90 days. Aggregated usage metrics are retained for 13 months for billing purposes.

## Deletion requests

You can delete a customer record with `DELETE /v1/customers/{id}`. On Free and Pro plans, the record is removed from the live database immediately but is fully purged from all systems, including backups, within 30 days.

Immediate permanent deletion, including removal from backups, is only available on the Enterprise plan by adding the `purge=true` query parameter. Purge requests on other plans are rejected with HTTP 403.

## Account closure

When an account is closed, all customer data is deleted within 30 days. Backups are rotated every 35 days, so residual copies in backups are gone no later than 35 days after closure.

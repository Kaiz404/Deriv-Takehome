# Webhooks

Webhooks notify your server when events happen in your Nimbus account, such as `job.completed`, `job.failed`, and `customer.deleted`.

## Signature verification

Every webhook request includes a `Nimbus-Signature` header containing an HMAC-SHA256 signature of the raw request body, computed with your endpoint's signing secret. Verify the signature before trusting the payload. Requests also carry a `Nimbus-Timestamp` header; reject any delivery whose timestamp is more than 5 minutes old to prevent replay attacks.

## Delivery and retries

Your endpoint must respond with a 2xx status code within 10 seconds. Any other response, or a timeout, counts as a failed delivery. Failed deliveries are retried up to 8 times with exponential backoff over a period of 24 hours. After the final retry fails, the event is marked as failed and the endpoint is disabled if it has failed every delivery for 3 consecutive days.

## Delivery logs

Webhook delivery logs, including request payloads, response codes, and timing, are retained for 30 days and can be viewed in the dashboard. Failed events can be replayed manually from the dashboard while their log entry still exists.

# Notification Real-Time Events

Namespace: `/notifications`

Authentication:
- Pass `userId` in the Socket.IO auth payload: `io('/notifications', { auth: { userId } })`
- Fallback supported through SSE endpoint: `GET /notifications/stream/:userId`

Subscription Events (client -> server):
- `notifications.subscribeProject` body: `{ "projectId": "<project-id>" }`
- `notifications.unsubscribeProject` body: `{ "projectId": "<project-id>" }`
- `notifications.joinAnnouncements` body: `{}`

Server Events:
- `connected` payload: `{ userId, reconnectHint }`
- `notification.created` payload: `{ id, type, title, message, data, createdAt }`
- `project.contribution` payload: project contribution broadcast payload
- `project.milestone` payload: milestone status update payload
- `project.deadline` payload: deadline alert payload
- `user.reputation` payload: reputation update payload
- `system.announcement` payload: global system message payload

Rate Limiting:
- 120 subscription events per minute per socket

Retry + Delivery Notes:
- Notification dispatch attempts are tracked in `notification_outbox`
- Failed deliveries are retried by cron job (1 minute interval)
- Admin endpoints:
  - `GET /notifications/admin/failed`
  - `POST /notifications/admin/retry`

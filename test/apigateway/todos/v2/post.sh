#!/bin/bash
curl -X POST https://1bwzek411a.execute-api.us-east-2.amazonaws.com/dev/todos/v2 \
  -H "Authorization: <id_token>" \
  -H "Content-Type: application/json" \
  -d '{"task": "TEST: Do Something.", "details": "This was sent to API Gateway from curl.", "status": "TODO", "dueDate": "2025-11-30"}'
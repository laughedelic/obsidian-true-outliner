---
status: active
team: [ "[[Maya Lindqvist]]", "[[Priya Nair]]" ]
tags: [project, work]
---

# Aurora Dashboard

Redesign of the alarm dashboard for industrial monitoring customers. Q3 goal: cut mean time-to-acknowledge by 30%.

## Current sprint

The severity-first layout is the bet. Everything else serves it.

- [x] pair with [[Priya Nair]] on session recordings
- [x] severity-first prototype
- [ ] touch fallback for timestamp-on-hover
- [ ] PII review of alarm-name field ![[2026-07-10#^legal-followup]]

## Layout decision record

| Option | Time-to-ack (study) | Verdict |
| --- | --- | --- |
| timestamp-first (current) | 11.2s | baseline |
| severity-first | 6.8s | ✅ adopted |
| grouped-by-source | 9.1s | rejected |

## Technical notes

The severity sort must be stable or rows jump under the cursor:

```ts
alarms.sort((a, b) =>
  b.severity - a.severity || a.firstSeen - b.firstSeen
);
```

##### Edge case: acknowledged-but-recurring

Deep-filed note (skipped heading levels on purpose): an alarm that re-fires within
its acknowledgement window should keep its row position, not re-sort.

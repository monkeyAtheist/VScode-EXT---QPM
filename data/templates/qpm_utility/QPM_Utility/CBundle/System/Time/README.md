# QPM C Time & Scheduler bundle

Cross-platform time utilities for Windows and POSIX with a small, dependency-free C API.

## What it provides

- High-resolution monotonic time in ns/us/ms.
- Unix epoch time in seconds/ms/us/ns.
- Local and UTC calendar values (`QpmDateTime`).
- Duration decomposition into days/hours/minutes/seconds/ms/us/ns.
- Duration formatting: `HH:MM:SS`, `HH:MM:SS.mmm`, compact and verbose forms.
- Portable sleeps in ns/us/ms/seconds.
- Stopwatch with start/stop/restart/lap and direct elapsed values in us/ms/s/min/h.
- Drift-resistant periodic loop timer.
- Deadline/timeout helper with remaining-time queries.
- Callback scheduler for one-shot, periodic and **bounded (interval + timeout)** jobs.
- Blocking `QpmTime_DelayWithCallbackMs` with interim callbacks and early-stop support.

## Elapsed time

```c
QpmStopwatch sw = {0};
QpmStopwatch_Start(&sw);

/* work */

double seconds = QpmStopwatch_ElapsedSeconds(&sw);
double minutes = QpmStopwatch_ElapsedMinutes(&sw);
double hours   = QpmStopwatch_ElapsedHours(&sw);

QpmTimeParts parts;
QpmStopwatch_ElapsedParts(&sw, &parts);

char text[64];
QpmStopwatch_Format(&sw, QPM_DURATION_HMS_MS, text, sizeof(text));
/* e.g. 01:42:08.532 */
```

## Current date/time

```c
QpmDateTime now;
QpmTime_NowLocal(&now);
printf("%04d-%02d-%02d %02d:%02d:%02d.%03d\n",
       now.year, now.month, now.day,
       now.hour, now.minute, now.second, now.millisecond);
```

## Deadline

```c
QpmDeadline timeout;
QpmDeadline_AfterMs(&timeout, 500);

while (!QpmDeadline_IsExpired(&timeout)) {
    /* wait for an event */
}
```

## Scheduled callbacks

The C scheduler deliberately does **not** create a hidden worker thread. Callbacks execute on the thread that calls `QpmScheduler_Poll()` / `QpmScheduler_WaitAndPoll()`. This is useful in deterministic test benches, acquisition loops and UI/event loops.

```c
static void OnTimer(QpmTimerId id,
                    uint64_t scheduledNs,
                    uint64_t firedNs,
                    uint64_t invocation,
                    void *userData)
{
    (void)id;
    (void)scheduledNs;
    (void)firedNs;
    (void)userData;
    printf("tick %llu\n", (unsigned long long)invocation);
}

QpmScheduler scheduler;
QpmScheduler_Init(&scheduler);

QpmScheduler_ScheduleAfterMs(&scheduler, 250, OnTimer, NULL);
QpmTimerId periodic = QpmScheduler_ScheduleEveryMs(
    &scheduler, 2000, 2000, OnTimer, NULL);

while (running) {
    QpmScheduler_WaitAndPoll(&scheduler, 100, 0);
}

QpmScheduler_Cancel(&scheduler, periodic);
QpmScheduler_Free(&scheduler);
```

`ScheduleAtEpochMs()` can be used for a wall-clock trigger. Internally it converts the requested epoch time to a monotonic deadline at scheduling time, so later wall-clock adjustments do not cause timer drift.

## Precision

High-resolution clocks measure time accurately, but callback/sleep scheduling latency is still limited by the operating system scheduler and current system load.

## Interval until timeout (new in 0.2.108)

Blocking, no hidden thread:

```c
static int OnInterval(QpmTimerId id, uint64_t elapsedMs,
                      uint64_t count, void *userData) {
    (void)id; (void)count; (void)userData;
    printf("elapsed = %llu ms\n", (unsigned long long)elapsedMs);
    return 0; /* nonzero: stop early */
}
int result = QpmTime_DelayWithCallbackMs(5000, 250, OnInterval, NULL);
/* result: 0 timeout, 1 early stop, negative error */
```

Non-blocking, with a finish callback:

```c
static void OnFinish(QpmTimerId id, QpmIntervalEndReason reason,
                     uint64_t elapsedMs, uint64_t calls, void *context) {
    (void)id; (void)elapsedMs; (void)calls; (void)context;
    printf("finished: %s\n", reason == QPM_INTERVAL_TIMEOUT ? "timeout" : "stopped");
}
QpmScheduler scheduler;
QpmScheduler_Init(&scheduler);
QpmTimerId id = QpmScheduler_ScheduleForMs(&scheduler, 5000, 250,
                                           OnInterval, OnFinish, NULL);
while (QpmScheduler_IsScheduled(&scheduler, id))
    QpmScheduler_WaitAndPoll(&scheduler, 100, 0);
QpmScheduler_Free(&scheduler);
```

**Semantics:** the first call is scheduled at `start + interval`; callback invocations
occur strictly before `start + timeout`. On a coincident deadline, timeout wins.
Callbacks delayed by OS scheduling are not replayed in a burst. A callback that
returns nonzero stops immediately and delivers `QPM_INTERVAL_STOPPED` to onFinish.
`Cancel`, `Clear` and `Free` are silent; they do not call `onFinish`. A timeout
of zero results in immediate completion upon polling and no tick. C scheduler
callbacks run on the thread that calls `Poll`, not a hidden worker. Neither
`WaitAndPoll` nor a blocking delay supplies hard-real-time guarantees.
Do not call `QpmScheduler_Free` from inside a callback.

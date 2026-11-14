/** @file qpm_time.h @brief Cross-platform clocks, elapsed-time helpers, deadlines and callback scheduling. */
#ifndef QPM_TIME_H
#define QPM_TIME_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmTimeParts {
    uint64_t days;
    uint32_t hours;
    uint32_t minutes;
    uint32_t seconds;
    uint32_t milliseconds;
    uint32_t microseconds;
    uint32_t nanoseconds;
} QpmTimeParts;

typedef struct QpmDateTime {
    int year;
    int month;
    int day;
    int hour;
    int minute;
    int second;
    int millisecond;
    int weekday;   /* 0 = Sunday */
    int yearday;   /* 0..365 */
    uint64_t epochMs;
} QpmDateTime;

typedef enum QpmDurationFormat {
    QPM_DURATION_HMS = 0,
    QPM_DURATION_HMS_MS,
    QPM_DURATION_DAYS_HMS_MS,
    QPM_DURATION_COMPACT,
    QPM_DURATION_VERBOSE
} QpmDurationFormat;

typedef struct QpmStopwatch {
    uint64_t startNs;
    uint64_t elapsedNs;
    int running;
} QpmStopwatch;

typedef struct QpmPeriodicTimer {
    uint64_t periodNs;
    uint64_t nextDeadlineNs;
    int started;
} QpmPeriodicTimer;

typedef struct QpmDeadline {
    uint64_t deadlineNs;
    int active;
} QpmDeadline;

typedef uint64_t QpmTimerId;

typedef void (*QpmTimerCallback)(
    QpmTimerId timerId,
    uint64_t scheduledNs,
    uint64_t firedNs,
    uint64_t invocation,
    void *userData);

/* Return 0 to keep polling, non-zero to stop before the timeout. */
typedef int (*QpmIntervalCallback)(QpmTimerId timerId, uint64_t elapsedMs,
                                   uint64_t invocation, void *userData);
typedef enum QpmIntervalEndReason {
    QPM_INTERVAL_TIMEOUT = 0,
    QPM_INTERVAL_STOPPED = 1
} QpmIntervalEndReason;
typedef void (*QpmIntervalFinishCallback)(QpmTimerId timerId,
                                         QpmIntervalEndReason reason,
                                         uint64_t elapsedMs,
                                         uint64_t invocationCount,
                                         void *userData);

typedef struct QpmScheduledTimer {
    QpmTimerId id;
    uint64_t deadlineNs;
    uint64_t periodNs;
    uint64_t invocation;
    QpmTimerCallback callback;
    QpmIntervalCallback intervalCallback;
    QpmIntervalFinishCallback finishCallback;
    uint64_t intervalStartNs;
    uint64_t timeoutNs;
    void *userData;
    int active;
} QpmScheduledTimer;

typedef struct QpmScheduler {
    QpmScheduledTimer *timers;
    size_t count;
    size_t capacity;
    QpmTimerId nextId;
} QpmScheduler;

/* Clocks */
uint64_t QpmTime_MonotonicNs(void);
uint64_t QpmTime_MonotonicUs(void);
uint64_t QpmTime_MonotonicMs(void);
uint64_t QpmTime_EpochNs(void);
uint64_t QpmTime_EpochUs(void);
uint64_t QpmTime_EpochMs(void);
uint64_t QpmTime_EpochSeconds(void);

/* Numeric conversion helpers */
double QpmTime_NsToMicroseconds(uint64_t ns);
double QpmTime_NsToMilliseconds(uint64_t ns);
double QpmTime_NsToSeconds(uint64_t ns);
double QpmTime_NsToMinutes(uint64_t ns);
double QpmTime_NsToHours(uint64_t ns);
double QpmTime_NsToDays(uint64_t ns);

/* Calendar / text */
int QpmTime_NowLocal(QpmDateTime *out);
int QpmTime_NowUtc(QpmDateTime *out);
int QpmTime_FromEpochMsLocal(uint64_t epochMs, QpmDateTime *out);
int QpmTime_FromEpochMsUtc(uint64_t epochMs, QpmDateTime *out);
int QpmTime_FormatLocal(char *buffer, size_t bufferSize, const char *format);
int QpmTime_FormatUtc(char *buffer, size_t bufferSize, const char *format);
void QpmTime_DecomposeNs(uint64_t ns, QpmTimeParts *out);
int QpmTime_FormatDurationNs(uint64_t ns, QpmDurationFormat format, char *buffer, size_t bufferSize);

/* Sleep */
int QpmTime_SleepNs(uint64_t ns);
int QpmTime_SleepUs(uint64_t us);
int QpmTime_SleepMs(uint64_t ms);
int QpmTime_SleepSeconds(double seconds);

/* Stopwatch */
void QpmStopwatch_Reset(QpmStopwatch *sw);
void QpmStopwatch_Start(QpmStopwatch *sw);
void QpmStopwatch_Restart(QpmStopwatch *sw);
void QpmStopwatch_Stop(QpmStopwatch *sw);
uint64_t QpmStopwatch_LapNs(QpmStopwatch *sw);
uint64_t QpmStopwatch_ElapsedNs(const QpmStopwatch *sw);
uint64_t QpmStopwatch_ElapsedUs(const QpmStopwatch *sw);
double QpmStopwatch_ElapsedMs(const QpmStopwatch *sw);
double QpmStopwatch_ElapsedSeconds(const QpmStopwatch *sw);
double QpmStopwatch_ElapsedMinutes(const QpmStopwatch *sw);
double QpmStopwatch_ElapsedHours(const QpmStopwatch *sw);
void QpmStopwatch_ElapsedParts(const QpmStopwatch *sw, QpmTimeParts *out);
int QpmStopwatch_Format(const QpmStopwatch *sw, QpmDurationFormat format, char *buffer, size_t bufferSize);

/* Drift-resistant periodic loop timer */
int QpmPeriodicTimer_Init(QpmPeriodicTimer *timer, uint64_t periodUs);
int QpmPeriodicTimer_InitMs(QpmPeriodicTimer *timer, uint64_t periodMs);
void QpmPeriodicTimer_Reset(QpmPeriodicTimer *timer);
uint64_t QpmPeriodicTimer_RemainingNs(const QpmPeriodicTimer *timer);
int QpmPeriodicTimer_WaitNext(QpmPeriodicTimer *timer, int *overrun);

/* Deadline / timeout helper */
void QpmDeadline_Clear(QpmDeadline *deadline);
int QpmDeadline_AfterNs(QpmDeadline *deadline, uint64_t delayNs);
int QpmDeadline_AfterMs(QpmDeadline *deadline, uint64_t delayMs);
int QpmDeadline_AfterSeconds(QpmDeadline *deadline, double delaySeconds);
int QpmDeadline_AtMonotonicNs(QpmDeadline *deadline, uint64_t monotonicNs);
int QpmDeadline_IsExpired(const QpmDeadline *deadline);
uint64_t QpmDeadline_RemainingNs(const QpmDeadline *deadline);
uint64_t QpmDeadline_RemainingMs(const QpmDeadline *deadline);
double QpmDeadline_RemainingSeconds(const QpmDeadline *deadline);

/* Blocking relative delay: callback every intervalMs strictly BEFORE timeoutMs.
 * Callback: 0 = continue, non-zero = stop early. Returns 0 = timed out,
 * 1 = stopped by callback, negative = invalid input/clock/sleep failure.
 * No callback if timeout is 0 or interval >= timeout; no background thread.
 * Missed intervals are SKIPPED, never replayed in a burst.
 */
int QpmTime_DelayWithCallbackMs(uint64_t timeoutMs, uint64_t intervalMs,
                                QpmIntervalCallback callback, void *userData);

/* Callback scheduler. Poll() executes callbacks on the caller thread. */
void QpmScheduler_Init(QpmScheduler *scheduler);
void QpmScheduler_Free(QpmScheduler *scheduler);
void QpmScheduler_Clear(QpmScheduler *scheduler);
size_t QpmScheduler_Count(const QpmScheduler *scheduler);
QpmTimerId QpmScheduler_ScheduleAfterNs(QpmScheduler *scheduler, uint64_t delayNs, QpmTimerCallback callback, void *userData);
QpmTimerId QpmScheduler_ScheduleAfterMs(QpmScheduler *scheduler, uint64_t delayMs, QpmTimerCallback callback, void *userData);
QpmTimerId QpmScheduler_ScheduleAtMonotonicNs(QpmScheduler *scheduler, uint64_t deadlineNs, QpmTimerCallback callback, void *userData);
QpmTimerId QpmScheduler_ScheduleAtEpochMs(QpmScheduler *scheduler, uint64_t epochMs, QpmTimerCallback callback, void *userData);
QpmTimerId QpmScheduler_ScheduleEveryNs(QpmScheduler *scheduler, uint64_t periodNs, uint64_t firstDelayNs, QpmTimerCallback callback, void *userData);
QpmTimerId QpmScheduler_ScheduleEveryMs(QpmScheduler *scheduler, uint64_t periodMs, uint64_t firstDelayMs, QpmTimerCallback callback, void *userData);
/* Non-blocking interval/timeout job. First tick at start+intervalMs.
 * onFinish is called once on timeout or callback-requested stop, on Poll thread.
 * A cancellation/clear/free is silent (no onFinish callback).
 * If interval and timeout coincide, timeout has precedence; no final tick.
 * Both durations are measured with the monotonic clock. Invalid params => 0.
 */
QpmTimerId QpmScheduler_ScheduleForMs(QpmScheduler *scheduler,
                                      uint64_t timeoutMs, uint64_t intervalMs,
                                      QpmIntervalCallback callback,
                                      QpmIntervalFinishCallback onFinish,
                                      void *userData);
int QpmScheduler_Cancel(QpmScheduler *scheduler, QpmTimerId timerId);
int QpmScheduler_IsScheduled(const QpmScheduler *scheduler, QpmTimerId timerId);
uint64_t QpmScheduler_TimeUntilNextNs(const QpmScheduler *scheduler);
int QpmScheduler_Poll(QpmScheduler *scheduler, size_t maxCallbacks);
int QpmScheduler_WaitAndPoll(QpmScheduler *scheduler, uint64_t maxSleepMs, size_t maxCallbacks);

#ifdef __cplusplus
}
#endif
#endif

#if !defined(_WIN32) && !defined(_POSIX_C_SOURCE)
#define _POSIX_C_SOURCE 200809L
#endif

#include "qpm_time.h"

#include <limits.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#if defined(_WIN32)
#include <windows.h>
#else
#include <errno.h>
#endif

#define QPM_NS_PER_US 1000ULL
#define QPM_NS_PER_MS 1000000ULL
#define QPM_NS_PER_SEC 1000000000ULL
#define QPM_NS_PER_MIN (60ULL * QPM_NS_PER_SEC)
#define QPM_NS_PER_HOUR (60ULL * QPM_NS_PER_MIN)
#define QPM_NS_PER_DAY (24ULL * QPM_NS_PER_HOUR)

static int qpm_mul_u64(uint64_t a, uint64_t b, uint64_t *out) {
    if (!out || (a != 0U && b > UINT64_MAX / a)) return -1;
    *out = a * b;
    return 0;
}

uint64_t QpmTime_MonotonicNs(void) {
#if defined(_WIN32)
    LARGE_INTEGER counter;
    LARGE_INTEGER freq;
    if (!QueryPerformanceCounter(&counter) || !QueryPerformanceFrequency(&freq) || freq.QuadPart <= 0) return 0;
    return (uint64_t)((counter.QuadPart / freq.QuadPart) * 1000000000ULL +
                      ((counter.QuadPart % freq.QuadPart) * 1000000000ULL) / freq.QuadPart);
#else
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * QPM_NS_PER_SEC + (uint64_t)ts.tv_nsec;
#endif
}

uint64_t QpmTime_MonotonicUs(void) { return QpmTime_MonotonicNs() / QPM_NS_PER_US; }
uint64_t QpmTime_MonotonicMs(void) { return QpmTime_MonotonicNs() / QPM_NS_PER_MS; }

uint64_t QpmTime_EpochNs(void) {
#if defined(_WIN32)
    FILETIME ft;
    ULARGE_INTEGER value;
    GetSystemTimeAsFileTime(&ft);
    value.LowPart = ft.dwLowDateTime;
    value.HighPart = ft.dwHighDateTime;
    if (value.QuadPart < 116444736000000000ULL) return 0;
    return (value.QuadPart - 116444736000000000ULL) * 100ULL;
#else
    struct timespec ts;
    if (clock_gettime(CLOCK_REALTIME, &ts) != 0) return 0;
    return (uint64_t)ts.tv_sec * QPM_NS_PER_SEC + (uint64_t)ts.tv_nsec;
#endif
}

uint64_t QpmTime_EpochUs(void) { return QpmTime_EpochNs() / QPM_NS_PER_US; }
uint64_t QpmTime_EpochMs(void) { return QpmTime_EpochNs() / QPM_NS_PER_MS; }
uint64_t QpmTime_EpochSeconds(void) { return QpmTime_EpochNs() / QPM_NS_PER_SEC; }

double QpmTime_NsToMicroseconds(uint64_t ns) { return (double)ns / 1000.0; }
double QpmTime_NsToMilliseconds(uint64_t ns) { return (double)ns / 1000000.0; }
double QpmTime_NsToSeconds(uint64_t ns) { return (double)ns / 1000000000.0; }
double QpmTime_NsToMinutes(uint64_t ns) { return QpmTime_NsToSeconds(ns) / 60.0; }
double QpmTime_NsToHours(uint64_t ns) { return QpmTime_NsToMinutes(ns) / 60.0; }
double QpmTime_NsToDays(uint64_t ns) { return QpmTime_NsToHours(ns) / 24.0; }

static int qpm_tm_from_time(time_t value, int utc, struct tm *out) {
    if (!out) return -1;
#if defined(_WIN32)
    return (utc ? gmtime_s(out, &value) : localtime_s(out, &value)) == 0 ? 0 : -1;
#else
    return (utc ? gmtime_r(&value, out) : localtime_r(&value, out)) != NULL ? 0 : -1;
#endif
}

static int qpm_datetime_from_epoch(uint64_t epochMs, int utc, QpmDateTime *out) {
    time_t seconds;
    struct tm tmValue;
    if (!out) return -1;
    if (epochMs / 1000ULL > (uint64_t)LLONG_MAX) return -2;
    seconds = (time_t)(epochMs / 1000ULL);
    if (qpm_tm_from_time(seconds, utc, &tmValue) != 0) return -3;
    out->year = tmValue.tm_year + 1900;
    out->month = tmValue.tm_mon + 1;
    out->day = tmValue.tm_mday;
    out->hour = tmValue.tm_hour;
    out->minute = tmValue.tm_min;
    out->second = tmValue.tm_sec;
    out->millisecond = (int)(epochMs % 1000ULL);
    out->weekday = tmValue.tm_wday;
    out->yearday = tmValue.tm_yday;
    out->epochMs = epochMs;
    return 0;
}

int QpmTime_NowLocal(QpmDateTime *out) { return qpm_datetime_from_epoch(QpmTime_EpochMs(), 0, out); }
int QpmTime_NowUtc(QpmDateTime *out) { return qpm_datetime_from_epoch(QpmTime_EpochMs(), 1, out); }
int QpmTime_FromEpochMsLocal(uint64_t epochMs, QpmDateTime *out) { return qpm_datetime_from_epoch(epochMs, 0, out); }
int QpmTime_FromEpochMsUtc(uint64_t epochMs, QpmDateTime *out) { return qpm_datetime_from_epoch(epochMs, 1, out); }

static int qpm_format_clock(char *buffer, size_t size, const char *format, int utc) {
    time_t now;
    struct tm tmValue;
    if (!buffer || size == 0U) return -1;
    if (!format) format = "%Y-%m-%d %H:%M:%S";
    now = time(NULL);
    if (qpm_tm_from_time(now, utc, &tmValue) != 0) return -2;
    return strftime(buffer, size, format, &tmValue) != 0U ? 0 : -3;
}

int QpmTime_FormatLocal(char *buffer, size_t size, const char *format) { return qpm_format_clock(buffer, size, format, 0); }
int QpmTime_FormatUtc(char *buffer, size_t size, const char *format) { return qpm_format_clock(buffer, size, format, 1); }

void QpmTime_DecomposeNs(uint64_t ns, QpmTimeParts *out) {
    if (!out) return;
    out->days = ns / QPM_NS_PER_DAY;
    ns %= QPM_NS_PER_DAY;
    out->hours = (uint32_t)(ns / QPM_NS_PER_HOUR);
    ns %= QPM_NS_PER_HOUR;
    out->minutes = (uint32_t)(ns / QPM_NS_PER_MIN);
    ns %= QPM_NS_PER_MIN;
    out->seconds = (uint32_t)(ns / QPM_NS_PER_SEC);
    ns %= QPM_NS_PER_SEC;
    out->milliseconds = (uint32_t)(ns / QPM_NS_PER_MS);
    ns %= QPM_NS_PER_MS;
    out->microseconds = (uint32_t)(ns / QPM_NS_PER_US);
    out->nanoseconds = (uint32_t)(ns % QPM_NS_PER_US);
}

int QpmTime_FormatDurationNs(uint64_t ns, QpmDurationFormat format, char *buffer, size_t bufferSize) {
    QpmTimeParts p;
    int written;
    if (!buffer || bufferSize == 0U) return -1;
    QpmTime_DecomposeNs(ns, &p);
    switch (format) {
        case QPM_DURATION_HMS:
            written = snprintf(buffer, bufferSize, "%02llu:%02u:%02u",
                (unsigned long long)(p.days * 24ULL + p.hours), p.minutes, p.seconds);
            break;
        case QPM_DURATION_HMS_MS:
            written = snprintf(buffer, bufferSize, "%02llu:%02u:%02u.%03u",
                (unsigned long long)(p.days * 24ULL + p.hours), p.minutes, p.seconds, p.milliseconds);
            break;
        case QPM_DURATION_DAYS_HMS_MS:
            written = snprintf(buffer, bufferSize, "%llud %02u:%02u:%02u.%03u",
                (unsigned long long)p.days, p.hours, p.minutes, p.seconds, p.milliseconds);
            break;
        case QPM_DURATION_COMPACT:
            if (p.days > 0U) {
                written = snprintf(buffer, bufferSize, "%llud %uh %umin %us %ums",
                    (unsigned long long)p.days, p.hours, p.minutes, p.seconds, p.milliseconds);
            } else if (p.hours > 0U) {
                written = snprintf(buffer, bufferSize, "%uh %umin %us %ums", p.hours, p.minutes, p.seconds, p.milliseconds);
            } else if (p.minutes > 0U) {
                written = snprintf(buffer, bufferSize, "%umin %us %ums", p.minutes, p.seconds, p.milliseconds);
            } else {
                written = snprintf(buffer, bufferSize, "%us %ums", p.seconds, p.milliseconds);
            }
            break;
        case QPM_DURATION_VERBOSE:
            written = snprintf(buffer, bufferSize,
                "%llu days, %u hours, %u minutes, %u seconds, %u ms, %u us, %u ns",
                (unsigned long long)p.days, p.hours, p.minutes, p.seconds,
                p.milliseconds, p.microseconds, p.nanoseconds);
            break;
        default:
            return -2;
    }
    if (written < 0) return -3;
    return (size_t)written < bufferSize ? 0 : -4;
}

int QpmTime_SleepNs(uint64_t ns) {
#if defined(_WIN32)
    HANDLE timer;
    LARGE_INTEGER due;
    if (ns == 0U) return 0;
    timer = CreateWaitableTimerW(NULL, TRUE, NULL);
    if (!timer) return -1;
    /* ceil(ns/100) without overflowing ns+99; LARGE_INTEGER is signed. */
    due.QuadPart = -(LONGLONG)(ns / 100ULL + (ns % 100ULL != 0U));
    if (!SetWaitableTimer(timer, &due, 0, NULL, NULL, FALSE)) { CloseHandle(timer); return -1; }
    if (WaitForSingleObject(timer, INFINITE) != WAIT_OBJECT_0) { CloseHandle(timer); return -1; }
    CloseHandle(timer);
    return 0;
#else
    struct timespec req;
    struct timespec rem;
    req.tv_sec = (time_t)(ns / QPM_NS_PER_SEC);
    req.tv_nsec = (long)(ns % QPM_NS_PER_SEC);
    while (nanosleep(&req, &rem) != 0) {
        if (errno != EINTR) return -1;
        req = rem;
    }
    return 0;
#endif
}

int QpmTime_SleepUs(uint64_t us) {
    uint64_t ns;
    return qpm_mul_u64(us, QPM_NS_PER_US, &ns) == 0 ? QpmTime_SleepNs(ns) : -1;
}

int QpmTime_SleepMs(uint64_t ms) {
    uint64_t ns;
    return qpm_mul_u64(ms, QPM_NS_PER_MS, &ns) == 0 ? QpmTime_SleepNs(ns) : -1;
}

int QpmTime_SleepSeconds(double seconds) {
    if (!isfinite(seconds) || seconds < 0.0 ||
        (long double)seconds * 1000000000.0L > (long double)UINT64_MAX) return -1;
    return QpmTime_SleepNs((uint64_t)((long double)seconds * 1000000000.0L));
}

void QpmStopwatch_Reset(QpmStopwatch *sw) {
    if (sw) { sw->startNs = 0U; sw->elapsedNs = 0U; sw->running = 0; }
}

void QpmStopwatch_Start(QpmStopwatch *sw) {
    if (sw && !sw->running) { sw->startNs = QpmTime_MonotonicNs(); sw->running = 1; }
}

void QpmStopwatch_Restart(QpmStopwatch *sw) {
    if (sw) { sw->elapsedNs = 0U; sw->startNs = QpmTime_MonotonicNs(); sw->running = 1; }
}

void QpmStopwatch_Stop(QpmStopwatch *sw) {
    uint64_t now;
    if (sw && sw->running) {
        now = QpmTime_MonotonicNs();
        if (now >= sw->startNs) sw->elapsedNs += now - sw->startNs;
        sw->running = 0;
    }
}

uint64_t QpmStopwatch_LapNs(QpmStopwatch *sw) {
    uint64_t now;
    uint64_t lap;
    if (!sw || !sw->running) return 0U;
    now = QpmTime_MonotonicNs();
    lap = now >= sw->startNs ? now - sw->startNs : 0U;
    sw->elapsedNs += lap;
    sw->startNs = now;
    return lap;
}

uint64_t QpmStopwatch_ElapsedNs(const QpmStopwatch *sw) {
    uint64_t now;
    if (!sw) return 0U;
    if (!sw->running) return sw->elapsedNs;
    now = QpmTime_MonotonicNs();
    return sw->elapsedNs + (now >= sw->startNs ? now - sw->startNs : 0U);
}

uint64_t QpmStopwatch_ElapsedUs(const QpmStopwatch *sw) { return QpmStopwatch_ElapsedNs(sw) / QPM_NS_PER_US; }
double QpmStopwatch_ElapsedMs(const QpmStopwatch *sw) { return QpmTime_NsToMilliseconds(QpmStopwatch_ElapsedNs(sw)); }
double QpmStopwatch_ElapsedSeconds(const QpmStopwatch *sw) { return QpmTime_NsToSeconds(QpmStopwatch_ElapsedNs(sw)); }
double QpmStopwatch_ElapsedMinutes(const QpmStopwatch *sw) { return QpmTime_NsToMinutes(QpmStopwatch_ElapsedNs(sw)); }
double QpmStopwatch_ElapsedHours(const QpmStopwatch *sw) { return QpmTime_NsToHours(QpmStopwatch_ElapsedNs(sw)); }
void QpmStopwatch_ElapsedParts(const QpmStopwatch *sw, QpmTimeParts *out) { QpmTime_DecomposeNs(QpmStopwatch_ElapsedNs(sw), out); }
int QpmStopwatch_Format(const QpmStopwatch *sw, QpmDurationFormat format, char *buffer, size_t bufferSize) {
    return QpmTime_FormatDurationNs(QpmStopwatch_ElapsedNs(sw), format, buffer, bufferSize);
}

int QpmPeriodicTimer_Init(QpmPeriodicTimer *timer, uint64_t periodUs) {
    uint64_t periodNs;
    if (!timer || periodUs == 0U || qpm_mul_u64(periodUs, QPM_NS_PER_US, &periodNs) != 0) return -1;
    timer->periodNs = periodNs;
    timer->nextDeadlineNs = 0U;
    timer->started = 0;
    return 0;
}

int QpmPeriodicTimer_InitMs(QpmPeriodicTimer *timer, uint64_t periodMs) {
    uint64_t us;
    if (qpm_mul_u64(periodMs, 1000ULL, &us) != 0) return -1;
    return QpmPeriodicTimer_Init(timer, us);
}

void QpmPeriodicTimer_Reset(QpmPeriodicTimer *timer) {
    if (timer) { timer->nextDeadlineNs = 0U; timer->started = 0; }
}

uint64_t QpmPeriodicTimer_RemainingNs(const QpmPeriodicTimer *timer) {
    uint64_t now;
    if (!timer || !timer->started) return 0U;
    now = QpmTime_MonotonicNs();
    return timer->nextDeadlineNs > now ? timer->nextDeadlineNs - now : 0U;
}

int QpmPeriodicTimer_WaitNext(QpmPeriodicTimer *timer, int *overrun) {
    uint64_t now;
    uint64_t late;
    if (!timer || timer->periodNs == 0U) return -1;
    now = QpmTime_MonotonicNs();
    if (!timer->started) {
        if (UINT64_MAX - now < timer->periodNs) return -3;
        timer->nextDeadlineNs = now + timer->periodNs;
        timer->started = 1;
    }
    if (now < timer->nextDeadlineNs) {
        if (QpmTime_SleepNs(timer->nextDeadlineNs - now) != 0) return -2;
        now = QpmTime_MonotonicNs();
    }
    late = now > timer->nextDeadlineNs ? now - timer->nextDeadlineNs : 0U;
    {
        uint64_t missed = late / timer->periodNs;
        uint64_t advance = missed + 1U;
        if (overrun) *overrun = missed > (uint64_t)INT_MAX ? INT_MAX : (int)missed;
        if (advance > (UINT64_MAX - timer->nextDeadlineNs) / timer->periodNs) {
            timer->started = 0;
            return -3;
        }
        timer->nextDeadlineNs += advance * timer->periodNs;
    }
    return 0;
}

void QpmDeadline_Clear(QpmDeadline *deadline) {
    if (deadline) { deadline->deadlineNs = 0U; deadline->active = 0; }
}

int QpmDeadline_AfterNs(QpmDeadline *deadline, uint64_t delayNs) {
    uint64_t now;
    if (!deadline) return -1;
    now = QpmTime_MonotonicNs();
    if (UINT64_MAX - now < delayNs) return -2;
    deadline->deadlineNs = now + delayNs;
    deadline->active = 1;
    return 0;
}

int QpmDeadline_AfterMs(QpmDeadline *deadline, uint64_t delayMs) {
    uint64_t ns;
    return qpm_mul_u64(delayMs, QPM_NS_PER_MS, &ns) == 0 ? QpmDeadline_AfterNs(deadline, ns) : -1;
}

int QpmDeadline_AfterSeconds(QpmDeadline *deadline, double delaySeconds) {
    if (!isfinite(delaySeconds) || delaySeconds < 0.0 ||
        (long double)delaySeconds * 1000000000.0L > (long double)UINT64_MAX) return -1;
    return QpmDeadline_AfterNs(deadline, (uint64_t)((long double)delaySeconds * 1000000000.0L));
}

int QpmDeadline_AtMonotonicNs(QpmDeadline *deadline, uint64_t monotonicNs) {
    if (!deadline) return -1;
    deadline->deadlineNs = monotonicNs;
    deadline->active = 1;
    return 0;
}

int QpmDeadline_IsExpired(const QpmDeadline *deadline) {
    return deadline && deadline->active ? QpmTime_MonotonicNs() >= deadline->deadlineNs : 0;
}

uint64_t QpmDeadline_RemainingNs(const QpmDeadline *deadline) {
    uint64_t now;
    if (!deadline || !deadline->active) return 0U;
    now = QpmTime_MonotonicNs();
    return deadline->deadlineNs > now ? deadline->deadlineNs - now : 0U;
}

uint64_t QpmDeadline_RemainingMs(const QpmDeadline *deadline) { return QpmDeadline_RemainingNs(deadline) / QPM_NS_PER_MS; }
double QpmDeadline_RemainingSeconds(const QpmDeadline *deadline) { return QpmTime_NsToSeconds(QpmDeadline_RemainingNs(deadline)); }

void QpmScheduler_Init(QpmScheduler *scheduler) {
    if (scheduler) {
        scheduler->timers = NULL;
        scheduler->count = 0U;
        scheduler->capacity = 0U;
        scheduler->nextId = 1U;
    }
}

void QpmScheduler_Free(QpmScheduler *scheduler) {
    if (!scheduler) return;
    free(scheduler->timers);
    QpmScheduler_Init(scheduler);
}

void QpmScheduler_Clear(QpmScheduler *scheduler) {
    if (!scheduler) return;
    scheduler->count = 0U;
}

size_t QpmScheduler_Count(const QpmScheduler *scheduler) {
    size_t i;
    size_t active = 0U;
    if (!scheduler) return 0U;
    for (i = 0U; i < scheduler->count; ++i) if (scheduler->timers[i].active) ++active;
    return active;
}

static int qpm_scheduler_reserve(QpmScheduler *scheduler, size_t needed) {
    QpmScheduledTimer *next;
    size_t capacity;
    if (needed <= scheduler->capacity) return 0;
    capacity = scheduler->capacity == 0U ? 8U : scheduler->capacity;
    while (capacity < needed) {
        if (capacity > SIZE_MAX / 2U) return -1;
        capacity *= 2U;
    }
    next = (QpmScheduledTimer *)realloc(scheduler->timers, capacity * sizeof(*next));
    if (!next) return -1;
    scheduler->timers = next;
    scheduler->capacity = capacity;
    return 0;
}

static QpmTimerId qpm_scheduler_add(QpmScheduler *scheduler, uint64_t deadlineNs, uint64_t periodNs, QpmTimerCallback callback, void *userData) {
    QpmScheduledTimer *timer;
    size_t i;
    if (!scheduler || !callback) return 0U;
    for (i = 0U; i < scheduler->count; ++i) {
        if (!scheduler->timers[i].active) break;
    }
    if (i == scheduler->count) {
        if (qpm_scheduler_reserve(scheduler, scheduler->count + 1U) != 0) return 0U;
        ++scheduler->count;
    }
    timer = &scheduler->timers[i];
    memset(timer, 0, sizeof(*timer));
    timer->id = scheduler->nextId++;
    if (scheduler->nextId == 0U) scheduler->nextId = 1U;
    timer->deadlineNs = deadlineNs;
    timer->periodNs = periodNs;
    timer->callback = callback;
    timer->userData = userData;
    timer->active = 1;
    return timer->id;
}

QpmTimerId QpmScheduler_ScheduleAfterNs(QpmScheduler *scheduler, uint64_t delayNs, QpmTimerCallback callback, void *userData) {
    uint64_t now = QpmTime_MonotonicNs();
    if (UINT64_MAX - now < delayNs) return 0U;
    return qpm_scheduler_add(scheduler, now + delayNs, 0U, callback, userData);
}

QpmTimerId QpmScheduler_ScheduleAfterMs(QpmScheduler *scheduler, uint64_t delayMs, QpmTimerCallback callback, void *userData) {
    uint64_t ns;
    if (qpm_mul_u64(delayMs, QPM_NS_PER_MS, &ns) != 0) return 0U;
    return QpmScheduler_ScheduleAfterNs(scheduler, ns, callback, userData);
}

QpmTimerId QpmScheduler_ScheduleAtMonotonicNs(QpmScheduler *scheduler, uint64_t deadlineNs, QpmTimerCallback callback, void *userData) {
    return qpm_scheduler_add(scheduler, deadlineNs, 0U, callback, userData);
}

QpmTimerId QpmScheduler_ScheduleAtEpochMs(QpmScheduler *scheduler, uint64_t epochMs, QpmTimerCallback callback, void *userData) {
    uint64_t nowEpoch = QpmTime_EpochMs();
    uint64_t nowMono = QpmTime_MonotonicNs();
    uint64_t deltaMs;
    uint64_t deltaNs;
    if (epochMs <= nowEpoch) return qpm_scheduler_add(scheduler, nowMono, 0U, callback, userData);
    deltaMs = epochMs - nowEpoch;
    if (qpm_mul_u64(deltaMs, QPM_NS_PER_MS, &deltaNs) != 0 || UINT64_MAX - nowMono < deltaNs) return 0U;
    return qpm_scheduler_add(scheduler, nowMono + deltaNs, 0U, callback, userData);
}

QpmTimerId QpmScheduler_ScheduleEveryNs(QpmScheduler *scheduler, uint64_t periodNs, uint64_t firstDelayNs, QpmTimerCallback callback, void *userData) {
    uint64_t now;
    if (periodNs == 0U) return 0U;
    now = QpmTime_MonotonicNs();
    if (firstDelayNs == 0U) firstDelayNs = periodNs;
    if (UINT64_MAX - now < firstDelayNs) return 0U;
    return qpm_scheduler_add(scheduler, now + firstDelayNs, periodNs, callback, userData);
}

QpmTimerId QpmScheduler_ScheduleEveryMs(QpmScheduler *scheduler, uint64_t periodMs, uint64_t firstDelayMs, QpmTimerCallback callback, void *userData) {
    uint64_t periodNs;
    uint64_t firstNs;
    if (qpm_mul_u64(periodMs, QPM_NS_PER_MS, &periodNs) != 0) return 0U;
    if (firstDelayMs == 0U) firstNs = 0U;
    else if (qpm_mul_u64(firstDelayMs, QPM_NS_PER_MS, &firstNs) != 0) return 0U;
    else { /* firstNs already set */ }
    return QpmScheduler_ScheduleEveryNs(scheduler, periodNs, firstNs, callback, userData);
}

int QpmScheduler_Cancel(QpmScheduler *scheduler, QpmTimerId timerId) {
    size_t i;
    if (!scheduler || timerId == 0U) return -1;
    for (i = 0U; i < scheduler->count; ++i) {
        if (scheduler->timers[i].active && scheduler->timers[i].id == timerId) {
            scheduler->timers[i].active = 0;
            return 0;
        }
    }
    return 1;
}

int QpmScheduler_IsScheduled(const QpmScheduler *scheduler, QpmTimerId timerId) {
    size_t i;
    if (!scheduler || timerId == 0U) return 0;
    for (i = 0U; i < scheduler->count; ++i) {
        if (scheduler->timers[i].active && scheduler->timers[i].id == timerId) return 1;
    }
    return 0;
}

uint64_t QpmScheduler_TimeUntilNextNs(const QpmScheduler *scheduler) {
    size_t i;
    uint64_t now;
    uint64_t best = UINT64_MAX;
    if (!scheduler) return UINT64_MAX;
    now = QpmTime_MonotonicNs();
    for (i = 0U; i < scheduler->count; ++i) {
        const QpmScheduledTimer *timer = &scheduler->timers[i];
        uint64_t remaining;
        if (!timer->active) continue;
        if (timer->deadlineNs <= now) return 0U;
        remaining = timer->deadlineNs - now;
        if (remaining < best) best = remaining;
    }
    return best;
}

/* Advance to the first future tick in O(1), even after suspend/resume. */
static int qpm_timer_advance(QpmScheduledTimer *timer, uint64_t now) {
    uint64_t count;
    if (timer->periodNs == 0U || now < timer->deadlineNs) return -1;
    count = (now - timer->deadlineNs) / timer->periodNs + 1U;
    if (count > (UINT64_MAX - timer->deadlineNs) / timer->periodNs) {
        timer->active = 0;
        return -1;
    }
    timer->deadlineNs += count * timer->periodNs;
    return 0;
}

/* A synchronous delay with interim callbacks. Never spin or replay missed ticks. */
int QpmTime_DelayWithCallbackMs(uint64_t timeoutMs, uint64_t intervalMs,
                                QpmIntervalCallback callback, void *userData) {
    uint64_t start, end, next, timeoutNs, intervalNs, count = 0;
    if (!callback || intervalMs == 0U ||
        qpm_mul_u64(timeoutMs, QPM_NS_PER_MS, &timeoutNs) != 0 ||
        qpm_mul_u64(intervalMs, QPM_NS_PER_MS, &intervalNs) != 0) return -1;
    start = QpmTime_MonotonicNs();
    if (!start || UINT64_MAX - start < timeoutNs) return -2;
    end = start + timeoutNs;
    next = (intervalNs >= timeoutNs) ? end : start + intervalNs;
    for (;;) {
        uint64_t now = QpmTime_MonotonicNs();
        uint64_t target;
        if (!now) return -2;
        if (now >= end) return 0;
        target = next < end ? next : end;
        if (now < target) {
            if (QpmTime_SleepNs(target - now) != 0) return -3;
            continue;
        }
        /* The target was the deadline, not an interval tick. */
        if (next >= end) return 0;
        ++count;
        if (callback(0U, (now - start) / QPM_NS_PER_MS, count, userData) != 0) return 1;
        {
            uint64_t after = QpmTime_MonotonicNs();
            uint64_t ticks;
            if (!after) return -2;
            ticks = after >= next ? (after - next) / intervalNs + 1U : 1U;
            if (ticks > (UINT64_MAX - next) / intervalNs) next = end;
            else next += ticks * intervalNs;
        }
    }
}

static void qpm_scheduler_placeholder(QpmTimerId id, uint64_t scheduledNs,
                                     uint64_t firedNs, uint64_t invocation,
                                     void *userData) {
    (void)id; (void)scheduledNs; (void)firedNs; (void)invocation; (void)userData;
}

QpmTimerId QpmScheduler_ScheduleForMs(QpmScheduler *scheduler,
                                      uint64_t timeoutMs, uint64_t intervalMs,
                                      QpmIntervalCallback callback,
                                      QpmIntervalFinishCallback onFinish,
                                      void *userData) {
    uint64_t now, timeoutNs, intervalNs, end, first;
    QpmTimerId id;
    size_t i;
    if (!scheduler || !callback || intervalMs == 0U ||
        qpm_mul_u64(timeoutMs, QPM_NS_PER_MS, &timeoutNs) != 0 ||
        qpm_mul_u64(intervalMs, QPM_NS_PER_MS, &intervalNs) != 0) return 0U;
    now = QpmTime_MonotonicNs();
    if (!now || UINT64_MAX - now < timeoutNs) return 0U;
    end = now + timeoutNs;
    first = intervalNs < timeoutNs ? now + intervalNs : end;
    id = qpm_scheduler_add(scheduler, first, intervalNs, qpm_scheduler_placeholder, userData);
    if (!id) return 0U;
    for (i = 0U; i < scheduler->count; ++i) {
        QpmScheduledTimer *timer = &scheduler->timers[i];
        if (timer->active && timer->id == id) {
            timer->intervalStartNs = now;
            timer->timeoutNs = end;
            timer->intervalCallback = callback;
            timer->finishCallback = onFinish;
            break;
        }
    }
    return id;
}

int QpmScheduler_Poll(QpmScheduler *scheduler, size_t maxCallbacks) {
    size_t firedCount = 0U;
    if (!scheduler) return -1;
    for (;;) {
        size_t i, dueIndex = SIZE_MAX;
        uint64_t now = QpmTime_MonotonicNs();
        uint64_t earliest = UINT64_MAX;
        QpmScheduledTimer event;
        QpmIntervalEndReason reason = QPM_INTERVAL_TIMEOUT;
        int finish = 0;
        if (!now) return -2;
        for (i = 0U; i < scheduler->count; ++i) {
            const QpmScheduledTimer *timer = &scheduler->timers[i];
            if (!timer->active || timer->deadlineNs > now) continue;
            if (timer->deadlineNs < earliest) { earliest = timer->deadlineNs; dueIndex = i; }
        }
        if (dueIndex == SIZE_MAX) break;
        event = scheduler->timers[dueIndex];
        if (event.intervalCallback && now >= event.timeoutNs) {
            scheduler->timers[dueIndex].active = 0;
            finish = 1;
        } else {
            ++scheduler->timers[dueIndex].invocation;
            event.invocation = scheduler->timers[dueIndex].invocation;
            if (event.periodNs == 0U) scheduler->timers[dueIndex].active = 0;
            else {
                qpm_timer_advance(&scheduler->timers[dueIndex], now);
                if (event.intervalCallback && scheduler->timers[dueIndex].active &&
                    scheduler->timers[dueIndex].deadlineNs > event.timeoutNs)
                    scheduler->timers[dueIndex].deadlineNs = event.timeoutNs;
            }
        }
        if (finish) {
            if (event.finishCallback)
                event.finishCallback(event.id, reason,
                    (now - event.intervalStartNs) / QPM_NS_PER_MS,
                    event.invocation, event.userData);
        } else if (event.intervalCallback) {
            int stop = event.intervalCallback(event.id,
                (now - event.intervalStartNs) / QPM_NS_PER_MS,
                event.invocation, event.userData);
            if (stop == 0) {
                uint64_t after = QpmTime_MonotonicNs();
                for (i = 0U; i < scheduler->count; ++i) {
                    QpmScheduledTimer *timer = &scheduler->timers[i];
                    if (timer->active && timer->id == event.id) {
                        if (after >= timer->deadlineNs) qpm_timer_advance(timer, after);
                        if (timer->active && timer->deadlineNs > event.timeoutNs)
                            timer->deadlineNs = event.timeoutNs;
                        break;
                    }
                }
            } else {
                for (i = 0U; i < scheduler->count; ++i) {
                    QpmScheduledTimer *timer = &scheduler->timers[i];
                    if (timer->active && timer->id == event.id) {
                        timer->active = 0;
                        reason = QPM_INTERVAL_STOPPED;
                        if (event.finishCallback)
                            event.finishCallback(event.id, reason,
                                (QpmTime_MonotonicNs() - event.intervalStartNs) / QPM_NS_PER_MS,
                                event.invocation, event.userData);
                        break;
                    }
                }
            }
        } else {
            event.callback(event.id, event.deadlineNs, now, event.invocation, event.userData);
        }
        ++firedCount;
        if (maxCallbacks != 0U && firedCount >= maxCallbacks) break;
    }
    return firedCount > (size_t)INT_MAX ? INT_MAX : (int)firedCount;
}

int QpmScheduler_WaitAndPoll(QpmScheduler *scheduler, uint64_t maxSleepMs, size_t maxCallbacks) {
    uint64_t waitNs;
    uint64_t maxNs;
    if (!scheduler) return -1;
    waitNs = QpmScheduler_TimeUntilNextNs(scheduler);
    if (qpm_mul_u64(maxSleepMs, QPM_NS_PER_MS, &maxNs) != 0) maxNs = UINT64_MAX;
    if (waitNs == UINT64_MAX || waitNs > maxNs) waitNs = maxNs;
    if (waitNs > 0U && waitNs != UINT64_MAX && QpmTime_SleepNs(waitNs) != 0) return -2;
    return QpmScheduler_Poll(scheduler, maxCallbacks);
}

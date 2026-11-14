#ifndef QPM_RETRY_H
#define QPM_RETRY_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int (*QpmRetryOperation)(void *context, int attemptIndex);
typedef void (*QpmRetrySleepFn)(void *context, uint32_t delayMs);
typedef int (*QpmRetryShouldRetryFn)(void *context, int operationResult, int attemptIndex);

typedef enum QpmRetryBackoff
{
    QPM_RETRY_BACKOFF_FIXED = 0,
    QPM_RETRY_BACKOFF_LINEAR,
    QPM_RETRY_BACKOFF_EXPONENTIAL
} QpmRetryBackoff;

typedef struct QpmRetryPolicy
{
    int maxAttempts;
    uint32_t initialDelayMs;
    uint32_t maxDelayMs;
    QpmRetryBackoff backoff;
    uint32_t jitterMs;
} QpmRetryPolicy;

typedef struct QpmRetryResult
{
    int result;
    int attempts;
    uint32_t totalDelayMs;
} QpmRetryResult;

void QpmRetry_DefaultPolicy(QpmRetryPolicy *policy);
uint32_t QpmRetry_ComputeDelay(const QpmRetryPolicy *policy, int failedAttemptIndex);
QpmRetryResult QpmRetry_Run(const QpmRetryPolicy *policy,
                            QpmRetryOperation operation,
                            void *operationContext,
                            QpmRetryShouldRetryFn shouldRetry,
                            void *retryContext,
                            QpmRetrySleepFn sleepFn,
                            void *sleepContext);

#ifdef __cplusplus
}
#endif
#endif

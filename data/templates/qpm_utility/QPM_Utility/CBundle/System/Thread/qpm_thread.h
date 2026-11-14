/** @file qpm_thread.h @brief Cross-platform threads, mutexes and condition variables. */
#ifndef QPM_THREAD_H
#define QPM_THREAD_H
#include <stdint.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <pthread.h>
#endif
#ifdef __cplusplus
extern "C" {
#endif

typedef int (*QpmThreadFunction)(void *userData);

typedef struct QpmThread {
#ifdef _WIN32
    HANDLE handle;
    DWORD id;
#else
    pthread_t handle;
#endif
    int valid;
} QpmThread;

typedef struct QpmMutex {
#ifdef _WIN32
    CRITICAL_SECTION native;
#else
    pthread_mutex_t native;
#endif
    int initialized;
} QpmMutex;

typedef struct QpmCondition {
#ifdef _WIN32
    CONDITION_VARIABLE native;
#else
    pthread_cond_t native;
#endif
    int initialized;
} QpmCondition;

void QpmThread_Init(QpmThread *thread);
int QpmThread_Create(QpmThread *thread, QpmThreadFunction function, void *userData);
int QpmThread_Join(QpmThread *thread, int *result);
int QpmThread_Detach(QpmThread *thread);
uint64_t QpmThread_CurrentId(void);
void QpmThread_Yield(void);

int QpmMutex_Init(QpmMutex *mutex);
void QpmMutex_Destroy(QpmMutex *mutex);
int QpmMutex_Lock(QpmMutex *mutex);
int QpmMutex_TryLock(QpmMutex *mutex);
int QpmMutex_Unlock(QpmMutex *mutex);

int QpmCondition_Init(QpmCondition *condition);
void QpmCondition_Destroy(QpmCondition *condition);
int QpmCondition_Wait(QpmCondition *condition, QpmMutex *mutex);
int QpmCondition_TimedWait(QpmCondition *condition, QpmMutex *mutex, uint32_t timeoutMs);
int QpmCondition_Signal(QpmCondition *condition);
int QpmCondition_Broadcast(QpmCondition *condition);

#ifdef __cplusplus
}
#endif
#endif

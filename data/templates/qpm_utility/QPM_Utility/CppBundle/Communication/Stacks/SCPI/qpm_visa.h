#ifndef QPM_VISA_H
#define QPM_VISA_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmVisaRuntime { intptr_t library; uint32_t resourceManager; void *functions[9]; } QpmVisaRuntime;
typedef struct QpmVisaSession { QpmVisaRuntime *runtime; uint32_t handle; } QpmVisaSession;
typedef struct QpmVisaResource { char name[256]; } QpmVisaResource;

void QpmVisa_RuntimeInit(QpmVisaRuntime *runtime);
int QpmVisa_Load(QpmVisaRuntime *runtime);
int QpmVisa_LoadLibrary(QpmVisaRuntime *runtime, const char *libraryPath);
void QpmVisa_Unload(QpmVisaRuntime *runtime);
int QpmVisa_IsLoaded(const QpmVisaRuntime *runtime);
int QpmVisa_FindResources(QpmVisaRuntime *runtime, const char *expression, QpmVisaResource *resources, size_t capacity, size_t *count);
void QpmVisa_SessionInit(QpmVisaSession *session);
int QpmVisa_Open(QpmVisaRuntime *runtime, QpmVisaSession *session, const char *resource, int timeoutMs);
void QpmVisa_Close(QpmVisaSession *session);
int QpmVisa_SetTimeout(QpmVisaSession *session, int timeoutMs);
int QpmVisa_SetTermination(QpmVisaSession *session, int enabled, unsigned char terminator);
int QpmVisa_Write(QpmVisaSession *session, const void *data, size_t size);
int QpmVisa_Read(QpmVisaSession *session, void *data, size_t size, int timeoutMs);
int QpmVisa_Query(QpmVisaSession *session, const void *txData, size_t txSize, void *rxData, size_t rxSize, int timeoutMs);
int QpmVisa_StatusDescription(QpmVisaRuntime *runtime, int32_t status, char *buffer, size_t bufferSize);
const char *QpmVisa_LastErrorText(void);
#ifdef __cplusplus
}
#endif
#endif

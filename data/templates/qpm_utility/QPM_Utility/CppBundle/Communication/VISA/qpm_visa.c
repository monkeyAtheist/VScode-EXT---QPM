#include "qpm_visa.h"

#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
#include <windows.h>
#define QPM_VISA_CALL __stdcall
#else
#define QPM_VISA_CALL
#endif

typedef int32_t QpmViStatus;
typedef uint32_t QpmViObject, QpmViSession, QpmViFindList;
typedef QpmViStatus (QPM_VISA_CALL *FnOpenDefaultRM)(QpmViSession *);
typedef QpmViStatus (QPM_VISA_CALL *FnFindRsrc)(QpmViSession, const char *, QpmViFindList *, uint32_t *, char *);
typedef QpmViStatus (QPM_VISA_CALL *FnFindNext)(QpmViFindList, char *);
typedef QpmViStatus (QPM_VISA_CALL *FnOpen)(QpmViSession, const char *, uint32_t, uint32_t, QpmViSession *);
typedef QpmViStatus (QPM_VISA_CALL *FnClose)(QpmViObject);
typedef QpmViStatus (QPM_VISA_CALL *FnWrite)(QpmViSession, const unsigned char *, uint32_t, uint32_t *);
typedef QpmViStatus (QPM_VISA_CALL *FnRead)(QpmViSession, unsigned char *, uint32_t, uint32_t *);
typedef QpmViStatus (QPM_VISA_CALL *FnSetAttribute)(QpmViObject, uint32_t, uintptr_t);
typedef QpmViStatus (QPM_VISA_CALL *FnStatusDesc)(QpmViObject, QpmViStatus, char *);

enum { F_RM, F_FIND, F_NEXT, F_OPEN, F_CLOSE, F_WRITE, F_READ, F_ATTR, F_DESC };
enum { A_TMO = 0x3FFF001Au, A_TERM = 0x3FFF0018u, A_TERM_EN = 0x3FFF0038u };

static char g_error[256];

static void QpmVisa_SetError(const char *text)
{
    snprintf(g_error, sizeof(g_error), "%s", text ? text : "VISA error");
}

const char *QpmVisa_LastErrorText(void)
{
    return g_error;
}

void QpmVisa_RuntimeInit(QpmVisaRuntime *runtime)
{
    if (runtime) memset(runtime, 0, sizeof(*runtime));
}

void QpmVisa_SessionInit(QpmVisaSession *session)
{
    if (session) memset(session, 0, sizeof(*session));
}

int QpmVisa_LoadLibrary(QpmVisaRuntime *runtime, const char *path)
{
#if defined(_WIN32)
    HMODULE library;
    QpmViSession resourceManager = 0;
    QpmViStatus status;

    if (!runtime || !path || !*path) return -1;
    QpmVisa_Unload(runtime);

    library = LoadLibraryA(path);
    if (!library)
    {
        QpmVisa_SetError("Unable to load VISA runtime DLL");
        return -2;
    }

#define LOAD_VISA_EXPORT(index, name) \
    do { \
        runtime->functions[index] = (void *)GetProcAddress(library, name); \
        if (!runtime->functions[index]) { \
            FreeLibrary(library); \
            QpmVisa_RuntimeInit(runtime); \
            QpmVisa_SetError("VISA runtime missing required exports"); \
            return -3; \
        } \
    } while (0)

    LOAD_VISA_EXPORT(F_RM, "viOpenDefaultRM");
    LOAD_VISA_EXPORT(F_FIND, "viFindRsrc");
    LOAD_VISA_EXPORT(F_NEXT, "viFindNext");
    LOAD_VISA_EXPORT(F_OPEN, "viOpen");
    LOAD_VISA_EXPORT(F_CLOSE, "viClose");
    LOAD_VISA_EXPORT(F_WRITE, "viWrite");
    LOAD_VISA_EXPORT(F_READ, "viRead");
    LOAD_VISA_EXPORT(F_ATTR, "viSetAttribute");
    LOAD_VISA_EXPORT(F_DESC, "viStatusDesc");
#undef LOAD_VISA_EXPORT

    runtime->library = (intptr_t)library;
    status = ((FnOpenDefaultRM)runtime->functions[F_RM])(&resourceManager);
    if (status < 0)
    {
        QpmVisa_SetError("viOpenDefaultRM failed");
        QpmVisa_Unload(runtime);
        return -4;
    }

    runtime->resourceManager = resourceManager;
    return 0;
#else
    (void)runtime;
    (void)path;
    QpmVisa_SetError("This compact VISA loader currently targets Windows VISA DLLs");
    return -2;
#endif
}

int QpmVisa_Load(QpmVisaRuntime *runtime)
{
#if defined(_WIN32)
#if defined(_WIN64)
    if (QpmVisa_LoadLibrary(runtime, "visa64.dll") == 0) return 0;
    return QpmVisa_LoadLibrary(runtime, "visa32.dll");
#else
    if (QpmVisa_LoadLibrary(runtime, "visa32.dll") == 0) return 0;
    return QpmVisa_LoadLibrary(runtime, "visa64.dll");
#endif
#else
    (void)runtime;
    QpmVisa_SetError("VISA runtime discovery currently targets Windows");
    return -2;
#endif
}

void QpmVisa_Unload(QpmVisaRuntime *runtime)
{
    if (!runtime) return;
#if defined(_WIN32)
    if (runtime->resourceManager && runtime->functions[F_CLOSE])
        ((FnClose)runtime->functions[F_CLOSE])(runtime->resourceManager);
    if (runtime->library)
        FreeLibrary((HMODULE)runtime->library);
#endif
    QpmVisa_RuntimeInit(runtime);
}

int QpmVisa_IsLoaded(const QpmVisaRuntime *runtime)
{
    return runtime && runtime->library && runtime->resourceManager;
}

int QpmVisa_FindResources(QpmVisaRuntime *runtime, const char *expression, QpmVisaResource *out, size_t capacity, size_t *count)
{
    QpmViFindList findList = 0;
    uint32_t total = 0;
    uint32_t i;
    char name[256];
    size_t written = 0;
    QpmViStatus status;

    if (!runtime || !QpmVisa_IsLoaded(runtime) || !expression || !out || !count) return -1;
    status = ((FnFindRsrc)runtime->functions[F_FIND])(runtime->resourceManager, expression, &findList, &total, name);
    if (status < 0)
    {
        *count = 0;
        return 0;
    }

    for (i = 0; i < total; ++i)
    {
        if (written < capacity)
        {
            snprintf(out[written].name, sizeof(out[written].name), "%s", name);
            ++written;
        }
        if (i + 1 < total && ((FnFindNext)runtime->functions[F_NEXT])(findList, name) < 0) break;
    }

    ((FnClose)runtime->functions[F_CLOSE])(findList);
    *count = written;
    return total > capacity ? 1 : 0;
}

int QpmVisa_Open(QpmVisaRuntime *runtime, QpmVisaSession *session, const char *resource, int timeoutMs)
{
    QpmViSession handle = 0;
    QpmViStatus status;

    if (!runtime || !session || !resource || !QpmVisa_IsLoaded(runtime)) return -1;
    QpmVisa_Close(session);
    status = ((FnOpen)runtime->functions[F_OPEN])(runtime->resourceManager, resource, 0, timeoutMs < 0 ? 0u : (uint32_t)timeoutMs, &handle);
    if (status < 0) return -2;
    session->runtime = runtime;
    session->handle = handle;
    return timeoutMs >= 0 ? QpmVisa_SetTimeout(session, timeoutMs) : 0;
}

void QpmVisa_Close(QpmVisaSession *session)
{
    if (!session) return;
    if (session->runtime && session->handle && session->runtime->functions[F_CLOSE])
        ((FnClose)session->runtime->functions[F_CLOSE])(session->handle);
    QpmVisa_SessionInit(session);
}

int QpmVisa_SetTimeout(QpmVisaSession *session, int timeoutMs)
{
    if (!session || !session->runtime || !session->handle) return -1;
    return ((FnSetAttribute)session->runtime->functions[F_ATTR])(
        session->handle, A_TMO, timeoutMs < 0 ? (uintptr_t)0xFFFFFFFFu : (uintptr_t)(uint32_t)timeoutMs) < 0 ? -2 : 0;
}

int QpmVisa_SetTermination(QpmVisaSession *session, int enabled, unsigned char terminator)
{
    FnSetAttribute setAttribute;
    if (!session || !session->runtime || !session->handle) return -1;
    setAttribute = (FnSetAttribute)session->runtime->functions[F_ATTR];
    if (setAttribute(session->handle, A_TERM, terminator) < 0) return -2;
    return setAttribute(session->handle, A_TERM_EN, enabled ? 1u : 0u) < 0 ? -3 : 0;
}

int QpmVisa_Write(QpmVisaSession *session, const void *data, size_t size)
{
    uint32_t written = 0;
    if (!session || !session->runtime || !session->handle || (!data && size) || size > 0xFFFFFFFFu) return -1;
    return ((FnWrite)session->runtime->functions[F_WRITE])(session->handle, (const unsigned char *)data, (uint32_t)size, &written) < 0 ? -2 : (int)written;
}

int QpmVisa_Read(QpmVisaSession *session, void *data, size_t size, int timeoutMs)
{
    uint32_t readCount = 0;
    if (!session || !session->runtime || !session->handle || !data || !size || size > 0xFFFFFFFFu) return -1;
    if (timeoutMs >= 0 && QpmVisa_SetTimeout(session, timeoutMs) != 0) return -2;
    return ((FnRead)session->runtime->functions[F_READ])(session->handle, (unsigned char *)data, (uint32_t)size, &readCount) < 0 ? -3 : (int)readCount;
}

int QpmVisa_Query(QpmVisaSession *session, const void *tx, size_t txSize, void *rx, size_t rxSize, int timeoutMs)
{
    int written = QpmVisa_Write(session, tx, txSize);
    if (written < 0 || (size_t)written != txSize) return -1;
    return QpmVisa_Read(session, rx, rxSize, timeoutMs);
}

int QpmVisa_StatusDescription(QpmVisaRuntime *runtime, int32_t status, char *buffer, size_t size)
{
    char text[256];
    if (!runtime || !QpmVisa_IsLoaded(runtime) || !buffer || !size) return -1;
    if (((FnStatusDesc)runtime->functions[F_DESC])(runtime->resourceManager, status, text) < 0) return -2;
    snprintf(buffer, size, "%s", text);
    return 0;
}

/**
 * @file qpm_ipc.h
 * @brief QPM C named-pipe/FIFO inter-process communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - creates a local server endpoint and waits for a client;
 * - connects to an existing endpoint as a client;
 * - exchanges raw bytes with simple read/write calls;
 * - wraps Windows named pipes and POSIX FIFO-style handles behind one C structure.
 *
 * @par Typical applications
 * - communication between a C test executable and a helper process;
 * - local supervision channels for GUIs, workers or test sequencers;
 * - small command/reply protocols when sockets are unnecessary.
 *
 * @par Usage notes
 * - Use the same pipe name on the server and client side.
 * - Frame your own messages when several commands can be sent on the same connection.
 * - Close both sides cleanly to release the pipe handle before rebuilding.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_ipc.h"
 * 
 * QpmIpcPipe pipeObj;
 * QpmIpc_Init(&pipeObj);
 * if (QpmIpc_ConnectClient(&pipeObj, "demo_pipe", 5000) == 0)
 * {
 *     QpmIpc_Write(&pipeObj, "PING", 4, NULL);
 *     QpmIpc_Close(&pipeObj);
 * }
 * @endcode
 */
#ifndef QPM_IPC_H
#define QPM_IPC_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <windows.h>
typedef HANDLE QpmIpcNativeHandle;
#else
typedef int QpmIpcNativeHandle;
#endif

#ifndef QPM_IPC_NAME_SIZE
#define QPM_IPC_NAME_SIZE 260
#endif

typedef struct QpmIpcPipe
{
    QpmIpcNativeHandle handle;
    int isOpen;
    int isServer;
    char name[QPM_IPC_NAME_SIZE];
} QpmIpcPipe;

void QpmIpc_Init(QpmIpcPipe *pipeObj);
int QpmIpc_CreateServer(QpmIpcPipe *pipeObj, const char *name);
int QpmIpc_WaitClient(QpmIpcPipe *pipeObj, unsigned int timeoutMs);
int QpmIpc_ConnectClient(QpmIpcPipe *pipeObj, const char *name, unsigned int timeoutMs);
int QpmIpc_Write(QpmIpcPipe *pipeObj, const void *data, size_t size, size_t *written);
int QpmIpc_Read(QpmIpcPipe *pipeObj, void *buffer, size_t bufferSize, size_t *received);
void QpmIpc_Close(QpmIpcPipe *pipeObj);
int QpmIpc_IsOpen(const QpmIpcPipe *pipeObj);
const char *QpmIpc_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* QPM_IPC_H */

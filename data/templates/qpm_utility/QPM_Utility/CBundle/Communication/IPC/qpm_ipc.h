#ifndef QPM_IPC_H
#define QPM_IPC_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmIpcPipe
{
    intptr_t handle;
    intptr_t listenHandle;
    int server;
    int opened;
    char name[256];
} QpmIpcPipe;

void QpmIpc_Init(QpmIpcPipe *pipeObj);
int QpmIpc_CreateServer(QpmIpcPipe *pipeObj, const char *name);
int QpmIpc_WaitClient(QpmIpcPipe *pipeObj, int timeoutMs);
int QpmIpc_DisconnectClient(QpmIpcPipe *pipeObj);
int QpmIpc_Connect(QpmIpcPipe *pipeObj, const char *name, int timeoutMs);
int QpmIpc_Send(QpmIpcPipe *pipeObj, const void *data, size_t size);
int QpmIpc_SendAll(QpmIpcPipe *pipeObj, const void *data, size_t size);
int QpmIpc_Receive(QpmIpcPipe *pipeObj, void *data, size_t size, int timeoutMs);
int QpmIpc_ReceiveExact(QpmIpcPipe *pipeObj, void *data, size_t size, int timeoutMs);
int QpmIpc_SendMessage(QpmIpcPipe *pipeObj, const void *data, uint32_t size);
int QpmIpc_ReceiveMessage(QpmIpcPipe *pipeObj, void *data, size_t capacity, uint32_t *messageSize, int timeoutMs);
int QpmIpc_IsOpen(const QpmIpcPipe *pipeObj);
void QpmIpc_Close(QpmIpcPipe *pipeObj);

#ifdef __cplusplus
}
#endif
#endif

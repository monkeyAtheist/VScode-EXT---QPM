#ifndef QPM_SOCKET_H
#define QPM_SOCKET_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef intptr_t QpmSocketHandle;
#define QPM_SOCKET_INVALID ((QpmSocketHandle)-1)

typedef struct QpmSocketEndpoint
{
    char address[128];
    uint16_t port;
} QpmSocketEndpoint;

int QpmSocket_Startup(void);
void QpmSocket_Cleanup(void);
void QpmSocket_Close(QpmSocketHandle socketHandle);
int QpmSocket_Shutdown(QpmSocketHandle socketHandle, int shutdownRead, int shutdownWrite);

QpmSocketHandle QpmSocket_TcpConnect(const char *host, uint16_t port, int timeoutMs);
QpmSocketHandle QpmSocket_TcpListen(const char *bindAddress, uint16_t port, int backlog);
QpmSocketHandle QpmSocket_TcpAccept(QpmSocketHandle listener, char *peerAddress, size_t peerAddressSize, uint16_t *peerPort);
QpmSocketHandle QpmSocket_TcpAcceptTimeout(QpmSocketHandle listener, int timeoutMs, QpmSocketEndpoint *peer);
int QpmSocket_SendAll(QpmSocketHandle socketHandle, const void *data, size_t size);
int QpmSocket_Receive(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs);
int QpmSocket_ReceiveExact(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs);
int QpmSocket_ReceiveUntil(QpmSocketHandle socketHandle, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs);
int QpmSocket_ReceiveLine(QpmSocketHandle socketHandle, char *buffer, size_t bufferSize, int timeoutMs);

QpmSocketHandle QpmSocket_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast);
int QpmSocket_UdpConnect(QpmSocketHandle socketHandle, const char *host, uint16_t port);
int QpmSocket_UdpSend(QpmSocketHandle socketHandle, const void *data, size_t size);
int QpmSocket_UdpReceive(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs);
int QpmSocket_UdpSendTo(QpmSocketHandle socketHandle, const char *host, uint16_t port, const void *data, size_t size);
int QpmSocket_UdpReceiveFrom(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs,
                             char *peerAddress, size_t peerAddressSize, uint16_t *peerPort);
int QpmSocket_UdpJoinMulticast(QpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress);
int QpmSocket_UdpLeaveMulticast(QpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress);
int QpmSocket_UdpSetMulticastTtl(QpmSocketHandle socketHandle, int ttl);
int QpmSocket_UdpSetMulticastLoop(QpmSocketHandle socketHandle, int enabled);

int QpmSocket_WaitReadable(QpmSocketHandle socketHandle, int timeoutMs);
int QpmSocket_WaitWritable(QpmSocketHandle socketHandle, int timeoutMs);
int QpmSocket_SetNoDelay(QpmSocketHandle socketHandle, int enabled);
int QpmSocket_SetKeepAlive(QpmSocketHandle socketHandle, int enabled);
int QpmSocket_SetReuseAddress(QpmSocketHandle socketHandle, int enabled);
int QpmSocket_SetBufferSizes(QpmSocketHandle socketHandle, int receiveBytes, int sendBytes);
int QpmSocket_GetLocalEndpoint(QpmSocketHandle socketHandle, QpmSocketEndpoint *endpoint);
int QpmSocket_GetPeerEndpoint(QpmSocketHandle socketHandle, QpmSocketEndpoint *endpoint);
int QpmSocket_ResolveFirst(const char *host, char *address, size_t addressSize);

const char *QpmSocket_LastErrorText(void);

#ifdef __cplusplus
}
#endif
#endif

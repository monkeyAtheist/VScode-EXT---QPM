/**
 * @file qpm_socket.h
 * @brief QPM C TCP/UDP socket communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - initializes and shuts down the socket library where required;
 * - opens TCP clients, TCP servers and UDP sockets;
 * - accepts TCP clients and exchanges byte or text payloads;
 * - provides endpoint helpers for UDP send/receive operations.
 *
 * @par Typical applications
 * - Ethernet-connected instruments, PLCs, embedded boards and simulators;
 * - local TCP servers for test automation;
 * - UDP telemetry or command channels.
 *
 * @par Usage notes
 * - On Windows, link with ws2_32; QPM adds it automatically when this bundle is inserted.
 * - TCP is stream-oriented: add your own delimiter or length field for packets.
 * - Use the timeout functions to avoid blocking a test sequence indefinitely.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_socket.h"
 * 
 * QpmSocket socketObj;
 * QpmSocket_InitLibrary();
 * QpmSocket_Init(&socketObj);
 * if (QpmSocket_TcpConnect(&socketObj, "192.168.1.50", 5025) == 0)
 * {
 *     QpmSocket_Send(&socketObj, "*IDN?\n", 6, NULL);
 *     QpmSocket_Close(&socketObj);
 * }
 * QpmSocket_ShutdownLibrary();
 * @endcode
 */
#ifndef QPM_SOCKET_H
#define QPM_SOCKET_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <winsock2.h>
typedef SOCKET QpmSocketNativeHandle;
#else
typedef int QpmSocketNativeHandle;
#endif

typedef struct QpmSocket
{
    QpmSocketNativeHandle handle;
    int type;
    int isOpen;
} QpmSocket;

int QpmSocket_InitLibrary(void);
void QpmSocket_ShutdownLibrary(void);
void QpmSocket_Init(QpmSocket *socketObj);
int QpmSocket_TcpConnect(QpmSocket *socketObj, const char *host, unsigned short port);
int QpmSocket_TcpListen(QpmSocket *socketObj, const char *bindAddress, unsigned short port, int backlog);
int QpmSocket_TcpAccept(QpmSocket *server, QpmSocket *client);
int QpmSocket_UdpOpen(QpmSocket *socketObj, const char *bindAddress, unsigned short port);
int QpmSocket_Send(QpmSocket *socketObj, const void *data, size_t size, size_t *sent);
int QpmSocket_Recv(QpmSocket *socketObj, void *buffer, size_t bufferSize, size_t *received);
int QpmSocket_UdpSendTo(QpmSocket *socketObj, const char *host, unsigned short port, const void *data, size_t size, size_t *sent);
int QpmSocket_UdpRecvFrom(QpmSocket *socketObj, void *buffer, size_t bufferSize, size_t *received, char *remoteHost, size_t remoteHostSize, unsigned short *remotePort);
void QpmSocket_Close(QpmSocket *socketObj);
int QpmSocket_IsOpen(const QpmSocket *socketObj);
const char *QpmSocket_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* QPM_SOCKET_H */

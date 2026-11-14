#define _DEFAULT_SOURCE
#define _POSIX_C_SOURCE 200112L
#include "qpm_socket.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#if defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
typedef SOCKET QpmNativeSocket;
typedef int QpmSockLen;
#define QPM_NATIVE_INVALID INVALID_SOCKET
#define QPM_CLOSESOCKET closesocket
#define QPM_SOCKET_SEND_FLAGS 0
#else
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <netdb.h>
#include <netinet/tcp.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <unistd.h>
typedef int QpmNativeSocket;
typedef socklen_t QpmSockLen;
#define QPM_NATIVE_INVALID (-1)
#define QPM_CLOSESOCKET close
#ifdef MSG_NOSIGNAL
#define QPM_SOCKET_SEND_FLAGS MSG_NOSIGNAL
#else
#define QPM_SOCKET_SEND_FLAGS 0
#endif
#endif

static char g_qpmSocketError[256];

static void QpmSocket_SetError(const char *text)
{
    snprintf(g_qpmSocketError, sizeof(g_qpmSocketError), "%s", text ? text : "Unknown socket error");
}

static void QpmSocket_SetSystemError(const char *prefix)
{
#if defined(_WIN32)
    snprintf(g_qpmSocketError, sizeof(g_qpmSocketError), "%s (WSA %d)", prefix, WSAGetLastError());
#else
    snprintf(g_qpmSocketError, sizeof(g_qpmSocketError), "%s (%s)", prefix, strerror(errno));
#endif
}

const char *QpmSocket_LastErrorText(void) { return g_qpmSocketError; }

int QpmSocket_Startup(void)
{
#if defined(_WIN32)
    WSADATA data;
    if (WSAStartup(MAKEWORD(2, 2), &data) != 0) { QpmSocket_SetSystemError("WSAStartup failed"); return -1; }
#endif
    return 0;
}

void QpmSocket_Cleanup(void)
{
#if defined(_WIN32)
    WSACleanup();
#endif
}

static QpmSocketHandle QpmSocket_FromNative(QpmNativeSocket s) { return (QpmSocketHandle)s; }
static QpmNativeSocket QpmSocket_ToNative(QpmSocketHandle s) { return (QpmNativeSocket)s; }

void QpmSocket_Close(QpmSocketHandle socketHandle)
{
    if (socketHandle != QPM_SOCKET_INVALID) QPM_CLOSESOCKET(QpmSocket_ToNative(socketHandle));
}

int QpmSocket_Shutdown(QpmSocketHandle socketHandle, int shutdownRead, int shutdownWrite)
{
    int how;
    if (socketHandle == QPM_SOCKET_INVALID || (!shutdownRead && !shutdownWrite)) return -1;
#if defined(_WIN32)
    how = shutdownRead && shutdownWrite ? SD_BOTH : shutdownRead ? SD_RECEIVE : SD_SEND;
#else
    how = shutdownRead && shutdownWrite ? SHUT_RDWR : shutdownRead ? SHUT_RD : SHUT_WR;
#endif
    return shutdown(QpmSocket_ToNative(socketHandle), how) == 0 ? 0 : -2;
}

static int QpmSocket_WaitNative(QpmNativeSocket s, int writeReady, int timeoutMs)
{
    fd_set set;
    struct timeval tv;
    int rc;
    FD_ZERO(&set); FD_SET(s, &set);
    tv.tv_sec = timeoutMs < 0 ? 0 : timeoutMs / 1000;
    tv.tv_usec = timeoutMs < 0 ? 0 : (timeoutMs % 1000) * 1000;
    rc = select((int)s + 1, writeReady ? NULL : &set, writeReady ? &set : NULL, NULL, timeoutMs < 0 ? NULL : &tv);
    return rc > 0 ? 1 : (rc == 0 ? 0 : -1);
}

int QpmSocket_WaitReadable(QpmSocketHandle socketHandle, int timeoutMs)
{
    return socketHandle == QPM_SOCKET_INVALID ? -1 : QpmSocket_WaitNative(QpmSocket_ToNative(socketHandle), 0, timeoutMs);
}

int QpmSocket_WaitWritable(QpmSocketHandle socketHandle, int timeoutMs)
{
    return socketHandle == QPM_SOCKET_INVALID ? -1 : QpmSocket_WaitNative(QpmSocket_ToNative(socketHandle), 1, timeoutMs);
}

static int QpmSocket_Resolve(const char *host, uint16_t port, int socktype, int passive, struct addrinfo **result)
{
    struct addrinfo hints;
    char portText[16];
    int rc;
    memset(&hints, 0, sizeof(hints));
    hints.ai_family = AF_UNSPEC;
    hints.ai_socktype = socktype;
    hints.ai_flags = passive ? AI_PASSIVE : 0;
    snprintf(portText, sizeof(portText), "%u", (unsigned)port);
    rc = getaddrinfo((host && host[0]) ? host : NULL, portText, &hints, result);
    if (rc != 0)
    {
#if defined(_WIN32)
        snprintf(g_qpmSocketError, sizeof(g_qpmSocketError), "getaddrinfo failed (%d)", rc);
#else
        snprintf(g_qpmSocketError, sizeof(g_qpmSocketError), "getaddrinfo failed (%s)", gai_strerror(rc));
#endif
        return -1;
    }
    return 0;
}

int QpmSocket_ResolveFirst(const char *host, char *address, size_t addressSize)
{
    struct addrinfo *list = NULL;
    int rc;
    if (!host || !*host || !address || addressSize == 0) return -1;
    if (QpmSocket_Resolve(host, 0, SOCK_STREAM, 0, &list) != 0) return -2;
    rc = getnameinfo(list->ai_addr, (QpmSockLen)list->ai_addrlen, address, (QpmSockLen)addressSize, NULL, 0, NI_NUMERICHOST);
    freeaddrinfo(list);
    return rc == 0 ? 0 : -3;
}

static int QpmSocket_SetBlocking(QpmNativeSocket s, int blocking)
{
#if defined(_WIN32)
    u_long mode = blocking ? 0UL : 1UL;
    return ioctlsocket(s, FIONBIO, &mode) == 0 ? 0 : -1;
#else
    int flags = fcntl(s, F_GETFL, 0);
    if (flags < 0) return -1;
    return fcntl(s, F_SETFL, blocking ? (flags & ~O_NONBLOCK) : (flags | O_NONBLOCK)) == 0 ? 0 : -1;
#endif
}

QpmSocketHandle QpmSocket_TcpConnect(const char *host, uint16_t port, int timeoutMs)
{
    struct addrinfo *list = NULL, *it;
    QpmNativeSocket s = QPM_NATIVE_INVALID;
    if (!host || !host[0] || QpmSocket_Resolve(host, port, SOCK_STREAM, 0, &list) != 0) return QPM_SOCKET_INVALID;
    for (it = list; it; it = it->ai_next)
    {
        s = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
        if (s == QPM_NATIVE_INVALID) continue;
        if (QpmSocket_SetBlocking(s, 0) != 0) { QPM_CLOSESOCKET(s); continue; }
        if (connect(s, it->ai_addr, (int)it->ai_addrlen) == 0 || QpmSocket_WaitNative(s, 1, timeoutMs) == 1)
        {
            int error = 0;
            QpmSockLen errorSize = (QpmSockLen)sizeof(error);
            if (getsockopt(s, SOL_SOCKET, SO_ERROR, (char *)&error, &errorSize) == 0 && error == 0)
            {
                (void)QpmSocket_SetBlocking(s, 1);
                freeaddrinfo(list);
                return QpmSocket_FromNative(s);
            }
        }
        QPM_CLOSESOCKET(s); s = QPM_NATIVE_INVALID;
    }
    freeaddrinfo(list);
    QpmSocket_SetError("TCP connection failed");
    return QPM_SOCKET_INVALID;
}

QpmSocketHandle QpmSocket_TcpListen(const char *bindAddress, uint16_t port, int backlog)
{
    struct addrinfo *list = NULL, *it;
    QpmNativeSocket s = QPM_NATIVE_INVALID;
    if (QpmSocket_Resolve(bindAddress, port, SOCK_STREAM, 1, &list) != 0) return QPM_SOCKET_INVALID;
    for (it = list; it; it = it->ai_next)
    {
        int reuse = 1;
        s = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
        if (s == QPM_NATIVE_INVALID) continue;
        setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, (QpmSockLen)sizeof(reuse));
        if (bind(s, it->ai_addr, (int)it->ai_addrlen) == 0 && listen(s, backlog > 0 ? backlog : 4) == 0)
        {
            freeaddrinfo(list);
            return QpmSocket_FromNative(s);
        }
        QPM_CLOSESOCKET(s);
    }
    freeaddrinfo(list);
    QpmSocket_SetSystemError("TCP listen failed");
    return QPM_SOCKET_INVALID;
}

static int QpmSocket_EndpointFromSockaddr(const struct sockaddr *address, QpmSockLen addressSize, QpmSocketEndpoint *endpoint)
{
    char host[128];
    char service[32];
    if (!endpoint) return -1;
    memset(endpoint, 0, sizeof(*endpoint));
    if (getnameinfo(address, addressSize, host, sizeof(host), service, sizeof(service), NI_NUMERICHOST | NI_NUMERICSERV) != 0) return -2;
    snprintf(endpoint->address, sizeof(endpoint->address), "%s", host);
    endpoint->port = (uint16_t)strtoul(service, NULL, 10);
    return 0;
}

QpmSocketHandle QpmSocket_TcpAccept(QpmSocketHandle listener, char *peerAddress, size_t peerAddressSize, uint16_t *peerPort)
{
    struct sockaddr_storage peer;
    QpmSockLen peerSize = (QpmSockLen)sizeof(peer);
    QpmNativeSocket accepted;
    if (listener == QPM_SOCKET_INVALID) return QPM_SOCKET_INVALID;
    accepted = accept(QpmSocket_ToNative(listener), (struct sockaddr *)&peer, &peerSize);
    if (accepted == QPM_NATIVE_INVALID) return QPM_SOCKET_INVALID;
    if (peerAddress && peerAddressSize)
    {
        QpmSocketEndpoint endpoint;
        if (QpmSocket_EndpointFromSockaddr((struct sockaddr *)&peer, peerSize, &endpoint) == 0)
        {
            snprintf(peerAddress, peerAddressSize, "%s", endpoint.address);
            if (peerPort) *peerPort = endpoint.port;
        }
    }
    return QpmSocket_FromNative(accepted);
}

QpmSocketHandle QpmSocket_TcpAcceptTimeout(QpmSocketHandle listener, int timeoutMs, QpmSocketEndpoint *peer)
{
    struct sockaddr_storage address;
    QpmSockLen addressSize = (QpmSockLen)sizeof(address);
    QpmNativeSocket accepted;
    int ready = QpmSocket_WaitReadable(listener, timeoutMs);
    if (ready <= 0) return QPM_SOCKET_INVALID;
    accepted = accept(QpmSocket_ToNative(listener), (struct sockaddr *)&address, &addressSize);
    if (accepted == QPM_NATIVE_INVALID) return QPM_SOCKET_INVALID;
    if (peer) (void)QpmSocket_EndpointFromSockaddr((struct sockaddr *)&address, addressSize, peer);
    return QpmSocket_FromNative(accepted);
}

int QpmSocket_SendAll(QpmSocketHandle socketHandle, const void *data, size_t size)
{
    const unsigned char *bytes = (const unsigned char *)data;
    size_t sentTotal = 0;
    if ((!data && size) || socketHandle == QPM_SOCKET_INVALID) return -1;
    while (sentTotal < size)
    {
        int sent = send(QpmSocket_ToNative(socketHandle), (const char *)bytes + sentTotal, (int)(size - sentTotal), QPM_SOCKET_SEND_FLAGS);
        if (sent <= 0) { QpmSocket_SetSystemError("send failed"); return -2; }
        sentTotal += (size_t)sent;
    }
    return (int)sentTotal;
}

int QpmSocket_Receive(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs)
{
    int ready;
    if (!data || size == 0 || socketHandle == QPM_SOCKET_INVALID) return -1;
    ready = QpmSocket_WaitReadable(socketHandle, timeoutMs);
    if (ready <= 0) return ready;
    {
        int n = recv(QpmSocket_ToNative(socketHandle), (char *)data, (int)size, QPM_SOCKET_SEND_FLAGS);
        if (n < 0) QpmSocket_SetSystemError("recv failed");
        return n;
    }
}

int QpmSocket_ReceiveExact(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs)
{
    unsigned char *bytes = (unsigned char *)data;
    size_t total = 0;
    if (!data || size == 0) return -1;
    while (total < size)
    {
        int n = QpmSocket_Receive(socketHandle, bytes + total, size - total, timeoutMs);
        if (n <= 0) return total ? (int)total : n;
        total += (size_t)n;
    }
    return (int)total;
}

int QpmSocket_ReceiveUntil(QpmSocketHandle socketHandle, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs)
{
    size_t used = 0;
    size_t termLen;
    if (!buffer || bufferSize == 0 || !terminator || !(termLen = strlen(terminator))) return -1;
    while (used + 1 < bufferSize)
    {
        char ch;
        int n = QpmSocket_Receive(socketHandle, &ch, 1, timeoutMs);
        if (n <= 0) { buffer[used] = '\0'; return used ? (int)used : n; }
        buffer[used++] = ch; buffer[used] = '\0';
        if (used >= termLen && memcmp(buffer + used - termLen, terminator, termLen) == 0) return (int)used;
    }
    return (int)used;
}

int QpmSocket_ReceiveLine(QpmSocketHandle socketHandle, char *buffer, size_t bufferSize, int timeoutMs)
{
    int rc = QpmSocket_ReceiveUntil(socketHandle, buffer, bufferSize, "\n", timeoutMs);
    if (rc > 0)
    {
        size_t n = strlen(buffer);
        while (n && (buffer[n - 1] == '\n' || buffer[n - 1] == '\r')) buffer[--n] = '\0';
        return (int)n;
    }
    return rc;
}

QpmSocketHandle QpmSocket_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast)
{
    struct addrinfo *list = NULL, *it;
    QpmNativeSocket s = QPM_NATIVE_INVALID;
    if (QpmSocket_Resolve(bindAddress, localPort, SOCK_DGRAM, 1, &list) != 0) return QPM_SOCKET_INVALID;
    for (it = list; it; it = it->ai_next)
    {
        int reuse = 1;
        s = socket(it->ai_family, it->ai_socktype, it->ai_protocol);
        if (s == QPM_NATIVE_INVALID) continue;
        setsockopt(s, SOL_SOCKET, SO_REUSEADDR, (const char *)&reuse, (QpmSockLen)sizeof(reuse));
        if (enableBroadcast) { int yes = 1; setsockopt(s, SOL_SOCKET, SO_BROADCAST, (const char *)&yes, (QpmSockLen)sizeof(yes)); }
        if (bind(s, it->ai_addr, (int)it->ai_addrlen) == 0) { freeaddrinfo(list); return QpmSocket_FromNative(s); }
        QPM_CLOSESOCKET(s);
    }
    freeaddrinfo(list);
    QpmSocket_SetSystemError("UDP bind failed");
    return QPM_SOCKET_INVALID;
}

int QpmSocket_UdpConnect(QpmSocketHandle socketHandle, const char *host, uint16_t port)
{
    struct addrinfo *list = NULL;
    int rc;
    if (socketHandle == QPM_SOCKET_INVALID || !host || !*host) return -1;
    if (QpmSocket_Resolve(host, port, SOCK_DGRAM, 0, &list) != 0) return -2;
    rc = connect(QpmSocket_ToNative(socketHandle), list->ai_addr, (int)list->ai_addrlen);
    freeaddrinfo(list);
    return rc == 0 ? 0 : -3;
}

int QpmSocket_UdpSend(QpmSocketHandle socketHandle, const void *data, size_t size)
{
    if (socketHandle == QPM_SOCKET_INVALID || (!data && size)) return -1;
    return send(QpmSocket_ToNative(socketHandle), (const char *)data, (int)size, QPM_SOCKET_SEND_FLAGS);
}

int QpmSocket_UdpReceive(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs)
{
    return QpmSocket_Receive(socketHandle, data, size, timeoutMs);
}

int QpmSocket_UdpSendTo(QpmSocketHandle socketHandle, const char *host, uint16_t port, const void *data, size_t size)
{
    struct addrinfo *list = NULL;
    int sent;
    if (socketHandle == QPM_SOCKET_INVALID || !host || (!data && size)) return -1;
    if (QpmSocket_Resolve(host, port, SOCK_DGRAM, 0, &list) != 0) return -2;
    sent = sendto(QpmSocket_ToNative(socketHandle), (const char *)data, (int)size, QPM_SOCKET_SEND_FLAGS, list->ai_addr, (int)list->ai_addrlen);
    freeaddrinfo(list);
    return sent;
}

int QpmSocket_UdpReceiveFrom(QpmSocketHandle socketHandle, void *data, size_t size, int timeoutMs,
                             char *peerAddress, size_t peerAddressSize, uint16_t *peerPort)
{
    struct sockaddr_storage peer;
    QpmSockLen peerSize = (QpmSockLen)sizeof(peer);
    int ready, received;
    if (socketHandle == QPM_SOCKET_INVALID || !data || size == 0) return -1;
    ready = QpmSocket_WaitReadable(socketHandle, timeoutMs);
    if (ready <= 0) return ready;
    received = recvfrom(QpmSocket_ToNative(socketHandle), (char *)data, (int)size, 0, (struct sockaddr *)&peer, &peerSize);
    if (received >= 0 && peerAddress && peerAddressSize)
    {
        QpmSocketEndpoint endpoint;
        if (QpmSocket_EndpointFromSockaddr((struct sockaddr *)&peer, peerSize, &endpoint) == 0)
        {
            snprintf(peerAddress, peerAddressSize, "%s", endpoint.address);
            if (peerPort) *peerPort = endpoint.port;
        }
    }
    return received;
}

static int QpmSocket_Multicast(QpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress, int join)
{
    struct ip_mreq request;
    if (socketHandle == QPM_SOCKET_INVALID || !multicastAddress) return -1;
    memset(&request, 0, sizeof(request));
    if (inet_pton(AF_INET, multicastAddress, &request.imr_multiaddr) != 1) return -2;
    if (interfaceAddress && *interfaceAddress)
    {
        if (inet_pton(AF_INET, interfaceAddress, &request.imr_interface) != 1) return -3;
    }
    else request.imr_interface.s_addr = htonl(INADDR_ANY);
    return setsockopt(QpmSocket_ToNative(socketHandle), IPPROTO_IP, join ? IP_ADD_MEMBERSHIP : IP_DROP_MEMBERSHIP,
                      (const char *)&request, (QpmSockLen)sizeof(request)) == 0 ? 0 : -4;
}

int QpmSocket_UdpJoinMulticast(QpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress)
{ return QpmSocket_Multicast(socketHandle, multicastAddress, interfaceAddress, 1); }
int QpmSocket_UdpLeaveMulticast(QpmSocketHandle socketHandle, const char *multicastAddress, const char *interfaceAddress)
{ return QpmSocket_Multicast(socketHandle, multicastAddress, interfaceAddress, 0); }

int QpmSocket_UdpSetMulticastTtl(QpmSocketHandle socketHandle, int ttl)
{
    unsigned char value = (unsigned char)(ttl < 0 ? 0 : ttl > 255 ? 255 : ttl);
    return socketHandle == QPM_SOCKET_INVALID ? -1 : (setsockopt(QpmSocket_ToNative(socketHandle), IPPROTO_IP, IP_MULTICAST_TTL, (const char *)&value, (QpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int QpmSocket_UdpSetMulticastLoop(QpmSocketHandle socketHandle, int enabled)
{
    unsigned char value = enabled ? 1U : 0U;
    return socketHandle == QPM_SOCKET_INVALID ? -1 : (setsockopt(QpmSocket_ToNative(socketHandle), IPPROTO_IP, IP_MULTICAST_LOOP, (const char *)&value, (QpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int QpmSocket_SetNoDelay(QpmSocketHandle socketHandle, int enabled)
{
    int value = enabled ? 1 : 0;
    return socketHandle == QPM_SOCKET_INVALID ? -1 : (setsockopt(QpmSocket_ToNative(socketHandle), IPPROTO_TCP, TCP_NODELAY, (const char *)&value, (QpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int QpmSocket_SetKeepAlive(QpmSocketHandle socketHandle, int enabled)
{
    int value = enabled ? 1 : 0;
    return socketHandle == QPM_SOCKET_INVALID ? -1 : (setsockopt(QpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_KEEPALIVE, (const char *)&value, (QpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int QpmSocket_SetReuseAddress(QpmSocketHandle socketHandle, int enabled)
{
    int value = enabled ? 1 : 0;
    return socketHandle == QPM_SOCKET_INVALID ? -1 : (setsockopt(QpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_REUSEADDR, (const char *)&value, (QpmSockLen)sizeof(value)) == 0 ? 0 : -2);
}

int QpmSocket_SetBufferSizes(QpmSocketHandle socketHandle, int receiveBytes, int sendBytes)
{
    int rc = 0;
    if (socketHandle == QPM_SOCKET_INVALID) return -1;
    if (receiveBytes > 0 && setsockopt(QpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_RCVBUF, (const char *)&receiveBytes, (QpmSockLen)sizeof(receiveBytes)) != 0) rc = -2;
    if (sendBytes > 0 && setsockopt(QpmSocket_ToNative(socketHandle), SOL_SOCKET, SO_SNDBUF, (const char *)&sendBytes, (QpmSockLen)sizeof(sendBytes)) != 0) rc = -3;
    return rc;
}

int QpmSocket_GetLocalEndpoint(QpmSocketHandle socketHandle, QpmSocketEndpoint *endpoint)
{
    struct sockaddr_storage address;
    QpmSockLen size = (QpmSockLen)sizeof(address);
    if (socketHandle == QPM_SOCKET_INVALID || !endpoint) return -1;
    if (getsockname(QpmSocket_ToNative(socketHandle), (struct sockaddr *)&address, &size) != 0) return -2;
    return QpmSocket_EndpointFromSockaddr((struct sockaddr *)&address, size, endpoint);
}

int QpmSocket_GetPeerEndpoint(QpmSocketHandle socketHandle, QpmSocketEndpoint *endpoint)
{
    struct sockaddr_storage address;
    QpmSockLen size = (QpmSockLen)sizeof(address);
    if (socketHandle == QPM_SOCKET_INVALID || !endpoint) return -1;
    if (getpeername(QpmSocket_ToNative(socketHandle), (struct sockaddr *)&address, &size) != 0) return -2;
    return QpmSocket_EndpointFromSockaddr((struct sockaddr *)&address, size, endpoint);
}

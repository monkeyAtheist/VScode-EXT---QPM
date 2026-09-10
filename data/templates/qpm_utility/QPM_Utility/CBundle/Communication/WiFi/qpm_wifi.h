/**
 * @file qpm_wifi.h
 * @brief QPM C Wi-Fi TCP/UDP application communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - uses normal TCP/UDP sockets once the operating system is connected to Wi-Fi;
 * - supports client/server modes, UDP endpoints and peer tracking;
 * - provides text, byte and small packet helpers;
 * - keeps Wi-Fi transport code separate from SSID/password association logic.
 *
 * @par Typical applications
 * - wireless communication with ESP32/Raspberry Pi services;
 * - test tools that talk to a Wi-Fi instrument over TCP or UDP;
 * - local wireless telemetry channels.
 *
 * @par Usage notes
 * - This module does not connect the PC to an SSID; configure Wi-Fi with the OS first.
 * - On Windows, link with ws2_32; QPM adds it automatically for this bundle.
 * - For reliable messages over TCP, add delimiters or use the packet helpers.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_wifi.h"
 * 
 * QpmWifiLink link;
 * QpmWifi_InitLibrary();
 * QpmWifi_Init(&link);
 * if (QpmWifi_OpenTcpClient(&link, "192.168.1.42", 5000) == 0)
 * {
 *     QpmWifi_Send(&link, "PING\n", 5, NULL);
 *     QpmWifi_Close(&link);
 * }
 * QpmWifi_ShutdownLibrary();
 * @endcode
 */
#ifndef QPM_WIFI_H
#define QPM_WIFI_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <winsock2.h>
typedef SOCKET QpmWifiNativeHandle;
#else
typedef int QpmWifiNativeHandle;
#endif

typedef enum QpmWifiProtocol
{
    QPM_WIFI_PROTOCOL_TCP = 1,
    QPM_WIFI_PROTOCOL_UDP = 2
} QpmWifiProtocol;

typedef struct QpmWifiEndpoint
{
    char host[128];
    unsigned short port;
} QpmWifiEndpoint;

typedef struct QpmWifiLink
{
    QpmWifiNativeHandle handle;
    QpmWifiProtocol protocol;
    int isOpen;
} QpmWifiLink;

int QpmWifi_InitLibrary(void);
void QpmWifi_ShutdownLibrary(void);
void QpmWifi_Init(QpmWifiLink *link);
int QpmWifi_OpenTcpClient(QpmWifiLink *link, const char *host, unsigned short port);
int QpmWifi_OpenTcpServer(QpmWifiLink *link, const char *bindAddress, unsigned short port, int backlog);
int QpmWifi_AcceptClient(QpmWifiLink *server, QpmWifiLink *client);
int QpmWifi_OpenUdp(QpmWifiLink *link, const char *bindAddress, unsigned short port);
int QpmWifi_Send(QpmWifiLink *link, const void *data, size_t size, size_t *sent);
int QpmWifi_Receive(QpmWifiLink *link, void *buffer, size_t bufferSize, size_t *received);
int QpmWifi_SendTo(QpmWifiLink *link, const char *host, unsigned short port, const void *data, size_t size, size_t *sent);
int QpmWifi_ReceiveFrom(QpmWifiLink *link, void *buffer, size_t bufferSize, size_t *received, QpmWifiEndpoint *remoteEndpoint);
void QpmWifi_Close(QpmWifiLink *link);
int QpmWifi_IsOpen(const QpmWifiLink *link);
const char *QpmWifi_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* QPM_WIFI_H */

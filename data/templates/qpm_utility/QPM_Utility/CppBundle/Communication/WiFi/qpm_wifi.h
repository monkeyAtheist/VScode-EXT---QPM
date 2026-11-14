#ifndef QPM_WIFI_H
#define QPM_WIFI_H

#include "qpm_socket.h"

#ifdef __cplusplus
extern "C" {
#endif

/* Wi-Fi transport uses the regular IP stack after the OS has associated with an AP. */
typedef QpmSocketHandle QpmWifiHandle;

int QpmWifi_Startup(void);
void QpmWifi_Cleanup(void);
QpmWifiHandle QpmWifi_TcpConnect(const char *host, uint16_t port, int timeoutMs);
QpmWifiHandle QpmWifi_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast);
int QpmWifi_Send(QpmWifiHandle handle, const void *data, size_t size);
int QpmWifi_Receive(QpmWifiHandle handle, void *data, size_t size, int timeoutMs);
int QpmWifi_UdpSendTo(QpmWifiHandle handle, const char *host, uint16_t port, const void *data, size_t size);
int QpmWifi_UdpReceiveFrom(QpmWifiHandle handle, void *data, size_t size, int timeoutMs,
                           char *peerAddress, size_t peerAddressSize, uint16_t *peerPort);
void QpmWifi_Close(QpmWifiHandle handle);

#ifdef __cplusplus
}
#endif
#endif

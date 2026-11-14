#include "qpm_wifi.h"

int QpmWifi_Startup(void) { return QpmSocket_Startup(); }
void QpmWifi_Cleanup(void) { QpmSocket_Cleanup(); }
QpmWifiHandle QpmWifi_TcpConnect(const char *host, uint16_t port, int timeoutMs) { return QpmSocket_TcpConnect(host, port, timeoutMs); }
QpmWifiHandle QpmWifi_UdpOpen(const char *bindAddress, uint16_t localPort, int enableBroadcast) { return QpmSocket_UdpOpen(bindAddress, localPort, enableBroadcast); }
int QpmWifi_Send(QpmWifiHandle handle, const void *data, size_t size) { return QpmSocket_SendAll(handle, data, size); }
int QpmWifi_Receive(QpmWifiHandle handle, void *data, size_t size, int timeoutMs) { return QpmSocket_Receive(handle, data, size, timeoutMs); }
int QpmWifi_UdpSendTo(QpmWifiHandle handle, const char *host, uint16_t port, const void *data, size_t size) { return QpmSocket_UdpSendTo(handle, host, port, data, size); }
int QpmWifi_UdpReceiveFrom(QpmWifiHandle handle, void *data, size_t size, int timeoutMs, char *peerAddress, size_t peerAddressSize, uint16_t *peerPort) { return QpmSocket_UdpReceiveFrom(handle, data, size, timeoutMs, peerAddress, peerAddressSize, peerPort); }
void QpmWifi_Close(QpmWifiHandle handle) { QpmSocket_Close(handle); }

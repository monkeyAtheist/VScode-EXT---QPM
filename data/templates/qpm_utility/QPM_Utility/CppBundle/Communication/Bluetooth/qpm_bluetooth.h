#ifndef QPM_BLUETOOTH_H
#define QPM_BLUETOOTH_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef intptr_t QpmBluetoothHandle;
#define QPM_BLUETOOTH_INVALID ((QpmBluetoothHandle)-1)

int QpmBluetooth_Startup(void);
void QpmBluetooth_Cleanup(void);
QpmBluetoothHandle QpmBluetooth_RfcommConnect(const char *bluetoothAddress, uint32_t channel, int timeoutMs);
int QpmBluetooth_Send(QpmBluetoothHandle handle, const void *data, size_t size);
int QpmBluetooth_SendAll(QpmBluetoothHandle handle, const void *data, size_t size);
int QpmBluetooth_Receive(QpmBluetoothHandle handle, void *data, size_t size, int timeoutMs);
int QpmBluetooth_ReceiveExact(QpmBluetoothHandle handle, void *data, size_t size, int timeoutMs);
int QpmBluetooth_ReadLine(QpmBluetoothHandle handle, char *buffer, size_t bufferSize, int timeoutMs);
void QpmBluetooth_Close(QpmBluetoothHandle handle);

#ifdef __cplusplus
}
#endif
#endif

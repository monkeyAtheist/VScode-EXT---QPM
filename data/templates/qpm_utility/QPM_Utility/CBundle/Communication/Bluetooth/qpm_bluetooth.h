/**
 * @file qpm_bluetooth.h
 * @brief QPM C Bluetooth Classic RFCOMM communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - initializes the Bluetooth socket backend;
 * - opens an RFCOMM client connection to a paired device;
 * - sends and receives raw byte payloads;
 * - reports unsupported status on platforms without a backend implementation.
 *
 * @par Typical applications
 * - serial-like communication with Bluetooth Classic modules such as HC-05/HC-06;
 * - wireless bench debug links when BLE is not required;
 * - small command protocols over RFCOMM.
 *
 * @par Usage notes
 * - The bundled implementation is Windows RFCOMM-oriented.
 * - Pair the remote device in the operating system before opening the RFCOMM channel.
 * - Use the device MAC address and RFCOMM channel configured by the remote service.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_bluetooth.h"
 * 
 * QpmBluetoothLink link;
 * QpmBluetooth_InitLibrary();
 * QpmBluetooth_Init(&link);
 * if (QpmBluetooth_OpenRfcommClient(&link, "00:11:22:33:44:55", 1) == 0)
 * {
 *     QpmBluetooth_Send(&link, "PING", 4, NULL);
 *     QpmBluetooth_Close(&link);
 * }
 * QpmBluetooth_ShutdownLibrary();
 * @endcode
 */
#ifndef QPM_BLUETOOTH_H
#define QPM_BLUETOOTH_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <winsock2.h>
#  include <ws2bth.h>
typedef SOCKET QpmBluetoothNativeHandle;
#else
typedef int QpmBluetoothNativeHandle;
#endif

typedef struct QpmBluetoothLink
{
    QpmBluetoothNativeHandle handle;
    int isOpen;
} QpmBluetoothLink;

void QpmBluetooth_Init(QpmBluetoothLink *link);
int QpmBluetooth_InitLibrary(void);
void QpmBluetooth_ShutdownLibrary(void);
int QpmBluetooth_OpenRfcommClient(QpmBluetoothLink *link, const char *address, unsigned int channel);
int QpmBluetooth_Send(QpmBluetoothLink *link, const void *data, size_t size, size_t *sent);
int QpmBluetooth_Receive(QpmBluetoothLink *link, void *buffer, size_t bufferSize, size_t *received);
void QpmBluetooth_Close(QpmBluetoothLink *link);
int QpmBluetooth_IsOpen(const QpmBluetoothLink *link);
const char *QpmBluetooth_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* QPM_BLUETOOTH_H */

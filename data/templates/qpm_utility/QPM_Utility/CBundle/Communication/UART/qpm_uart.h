/**
 * @file qpm_uart.h
 * @brief QPM C UART/serial-port communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - opens and configures a serial port or COM port;
 * - supports baud rate, data bits, stop bits and parity configuration;
 * - provides byte, text and line-oriented read/write helpers;
 * - uses timeout-aware reads and exposes the last transport error.
 *
 * @par Typical applications
 * - communication with microcontrollers, Arduino/ESP32 boards, modems and instruments;
 * - simple debug consoles and command protocols over RS-232/RS-485/USB-serial;
 * - bench-test tools requiring a procedural C serial API.
 *
 * @par Usage notes
 * - On Windows, pass names such as "COM3"; high COM numbers are normalized internally when required.
 * - On Linux, pass device files such as "/dev/ttyUSB0" or "/dev/ttyS0".
 * - Always close the port with QpmUart_Close before rebuilding or disconnecting the device.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_uart.h"
 * 
 * QpmUartPort port;
 * QpmUart_Init(&port);
 * if (QpmUart_OpenEx(&port, "COM3", 115200, 8, 1, QPM_UART_PARITY_NONE) == 0)
 * {
 *     char line[128];
 *     QpmUart_WriteText(&port, "MEAS?\n");
 *     if (QpmUart_ReadLine(&port, line, sizeof(line), 1000) == 0)
 *     {
 *         printf("Device answered: %s\n", line);
 *     }
 *     QpmUart_Close(&port);
 * }
 * @endcode
 */
#ifndef QPM_UART_H
#define QPM_UART_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>

#ifdef _WIN32
#  ifndef WIN32_LEAN_AND_MEAN
#    define WIN32_LEAN_AND_MEAN
#  endif
#  include <windows.h>
typedef HANDLE QpmUartNativeHandle;
#else
typedef int QpmUartNativeHandle;
#endif

typedef enum QpmUartParity
{
    QPM_UART_PARITY_NONE = 0,
    QPM_UART_PARITY_ODD = 1,
    QPM_UART_PARITY_EVEN = 2
} QpmUartParity;

typedef struct QpmUartPort
{
    QpmUartNativeHandle handle;
    int isOpen;
} QpmUartPort;

void QpmUart_Init(QpmUartPort *port);
int QpmUart_Open(QpmUartPort *port, const char *deviceName, unsigned int baudRate);
int QpmUart_OpenEx(QpmUartPort *port, const char *deviceName, unsigned int baudRate,
                   int dataBits, int stopBits, QpmUartParity parity);
int QpmUart_IsOpen(const QpmUartPort *port);
int QpmUart_Write(QpmUartPort *port, const void *data, size_t size, size_t *written);
int QpmUart_WriteText(QpmUartPort *port, const char *text);
int QpmUart_Read(QpmUartPort *port, void *buffer, size_t bufferSize, size_t *received, unsigned int timeoutMs);
int QpmUart_ReadLine(QpmUartPort *port, char *buffer, size_t bufferSize, unsigned int timeoutMs);
void QpmUart_Close(QpmUartPort *port);
const char *QpmUart_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* QPM_UART_H */

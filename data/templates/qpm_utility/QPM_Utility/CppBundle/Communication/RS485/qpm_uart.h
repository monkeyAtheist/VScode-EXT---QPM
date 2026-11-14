#ifndef QPM_UART_H
#define QPM_UART_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmUartParity
{
    QPM_UART_PARITY_NONE = 0,
    QPM_UART_PARITY_ODD,
    QPM_UART_PARITY_EVEN,
    QPM_UART_PARITY_MARK,
    QPM_UART_PARITY_SPACE
} QpmUartParity;

typedef enum QpmUartFlowControl
{
    QPM_UART_FLOW_NONE = 0,
    QPM_UART_FLOW_RTS_CTS,
    QPM_UART_FLOW_XON_XOFF
} QpmUartFlowControl;

typedef struct QpmUartConfig
{
    int baudRate;
    int dataBits;
    QpmUartParity parity;
    int stopBits; /* 1 or 2. */
    QpmUartFlowControl flowControl;
    int readTimeoutMs;
    int writeTimeoutMs;
    int dtrEnabled;
    int rtsEnabled;
} QpmUartConfig;

typedef struct QpmUart
{
    intptr_t handle;
    int opened;
    QpmUartConfig config;
} QpmUart;

void QpmUart_DefaultConfig(QpmUartConfig *config);
void QpmUart_Init(QpmUart *uart);
int QpmUart_OpenConfig(QpmUart *uart, const char *port, const QpmUartConfig *config);
int QpmUart_Open(QpmUart *uart, const char *port, int baudrate, int dataBits, char parity, int stopBits);
int QpmUart_Configure(QpmUart *uart, const QpmUartConfig *config);
void QpmUart_Close(QpmUart *uart);
int QpmUart_IsOpen(const QpmUart *uart);

int QpmUart_Write(QpmUart *uart, const void *data, size_t size);
int QpmUart_WriteAll(QpmUart *uart, const void *data, size_t size);
int QpmUart_WriteText(QpmUart *uart, const char *text);
int QpmUart_Read(QpmUart *uart, void *data, size_t size, int timeoutMs);
int QpmUart_ReadExact(QpmUart *uart, void *data, size_t size, int timeoutMs);
int QpmUart_ReadUntil(QpmUart *uart, char *buffer, size_t bufferSize, const char *terminator, int timeoutMs);
int QpmUart_ReadLine(QpmUart *uart, char *buffer, size_t bufferSize, int timeoutMs);

int QpmUart_BytesAvailable(QpmUart *uart);
int QpmUart_Purge(QpmUart *uart, int purgeRx, int purgeTx);
int QpmUart_Flush(QpmUart *uart);
int QpmUart_SetDtr(QpmUart *uart, int enabled);
int QpmUart_SetRts(QpmUart *uart, int enabled);
int QpmUart_SendBreak(QpmUart *uart, int durationMs);
const char *QpmUart_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif

#ifndef QPM_RS485_H
#define QPM_RS485_H

#include <stddef.h>
#include <stdint.h>
#include "qpm_uart.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmRs485Config
{
    QpmUartConfig uart;
    int manualDirection;      /* 1: drive RTS around writes, 0: adapter/driver auto direction. */
    int rtsActiveHigh;        /* Manual RTS transmit level. */
    uint32_t preTransmitDelayUs;
    uint32_t postTransmitDelayUs;
    int tryLinuxKernelMode;   /* Request TIOCSRS485 when available. */
} QpmRs485Config;

typedef struct QpmRs485
{
    QpmUart uart;
    QpmRs485Config config;
    int kernelModeEnabled;
} QpmRs485;

void QpmRs485_DefaultConfig(QpmRs485Config *config);
void QpmRs485_Init(QpmRs485 *bus);
int QpmRs485_Open(QpmRs485 *bus, const char *port, const QpmRs485Config *config);
void QpmRs485_Close(QpmRs485 *bus);
int QpmRs485_Write(QpmRs485 *bus, const void *data, size_t size);
int QpmRs485_Read(QpmRs485 *bus, void *data, size_t size, int timeoutMs);
int QpmRs485_ReadExact(QpmRs485 *bus, void *data, size_t size, int timeoutMs);
int QpmRs485_Transceive(QpmRs485 *bus, const void *txData, size_t txSize,
                        void *rxData, size_t rxCapacity, int responseTimeoutMs);
int QpmRs485_SetDirection(QpmRs485 *bus, int transmit);

#ifdef __cplusplus
}
#endif
#endif

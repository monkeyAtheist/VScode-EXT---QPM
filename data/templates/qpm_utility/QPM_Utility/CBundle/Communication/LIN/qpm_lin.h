#ifndef QPM_LIN_H
#define QPM_LIN_H

#include <stddef.h>
#include <stdint.h>
#include "qpm_uart.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmLinChecksumMode
{
    QPM_LIN_CHECKSUM_AUTO = 0,
    QPM_LIN_CHECKSUM_CLASSIC,
    QPM_LIN_CHECKSUM_ENHANCED
} QpmLinChecksumMode;

typedef struct QpmLinConfig
{
    QpmUartConfig uart;
    int breakDurationMs;
    int responseTimeoutMs;
    int discardHeaderEcho;
} QpmLinConfig;

typedef struct QpmLin
{
    QpmUart uart;
    QpmLinConfig config;
} QpmLin;

void QpmLin_DefaultConfig(QpmLinConfig *config);
void QpmLin_Init(QpmLin *lin);
int QpmLin_Open(QpmLin *lin, const char *port, const QpmLinConfig *config);
void QpmLin_Close(QpmLin *lin);

uint8_t QpmLin_ProtectedId(uint8_t frameId);
int QpmLin_ValidateProtectedId(uint8_t protectedId);
uint8_t QpmLin_Checksum(uint8_t protectedId, const uint8_t *data, size_t dataLength, QpmLinChecksumMode mode);
int QpmLin_ValidateFrame(uint8_t protectedId, const uint8_t *data, size_t dataLength, uint8_t checksum, QpmLinChecksumMode mode);

int QpmLin_SendHeader(QpmLin *lin, uint8_t frameId);
int QpmLin_Publish(QpmLin *lin, uint8_t frameId, const uint8_t *data, size_t dataLength, QpmLinChecksumMode mode);
int QpmLin_Request(QpmLin *lin, uint8_t frameId, uint8_t *data, size_t dataLength, QpmLinChecksumMode mode, int timeoutMs);

#ifdef __cplusplus
}
#endif
#endif

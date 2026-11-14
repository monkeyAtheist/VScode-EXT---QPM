#include "qpm_lin.h"

#include <string.h>

void QpmLin_DefaultConfig(QpmLinConfig *config)
{
    if (!config) return;
    memset(config, 0, sizeof(*config));
    QpmUart_DefaultConfig(&config->uart);
    config->uart.baudRate = 19200;
    config->uart.dataBits = 8;
    config->uart.parity = QPM_UART_PARITY_NONE;
    config->uart.stopBits = 1;
    config->breakDurationMs = 1;
    config->responseTimeoutMs = 100;
    config->discardHeaderEcho = 0;
}

void QpmLin_Init(QpmLin *lin)
{
    if (!lin) return;
    memset(lin, 0, sizeof(*lin));
    QpmUart_Init(&lin->uart);
    QpmLin_DefaultConfig(&lin->config);
}

int QpmLin_Open(QpmLin *lin, const char *port, const QpmLinConfig *config)
{
    QpmLinConfig local;
    if (!lin || !port) return -1;
    if (!config) { QpmLin_DefaultConfig(&local); config = &local; }
    QpmLin_Close(lin);
    lin->config = *config;
    return QpmUart_OpenConfig(&lin->uart, port, &config->uart);
}

void QpmLin_Close(QpmLin *lin)
{
    if (!lin) return;
    QpmUart_Close(&lin->uart);
    QpmLin_Init(lin);
}

uint8_t QpmLin_ProtectedId(uint8_t frameId)
{
    uint8_t id = (uint8_t)(frameId & 0x3FU);
    uint8_t p0 = (uint8_t)(((id >> 0) ^ (id >> 1) ^ (id >> 2) ^ (id >> 4)) & 1U);
    uint8_t p1 = (uint8_t)(~((id >> 1) ^ (id >> 3) ^ (id >> 4) ^ (id >> 5)) & 1U);
    return (uint8_t)(id | (uint8_t)(p0 << 6) | (uint8_t)(p1 << 7));
}

int QpmLin_ValidateProtectedId(uint8_t protectedId)
{
    return QpmLin_ProtectedId((uint8_t)(protectedId & 0x3FU)) == protectedId;
}

static QpmLinChecksumMode QpmLin_EffectiveMode(uint8_t protectedId, QpmLinChecksumMode mode)
{
    uint8_t id = (uint8_t)(protectedId & 0x3FU);
    if (mode != QPM_LIN_CHECKSUM_AUTO) return mode;
    return (id == 0x3CU || id == 0x3DU) ? QPM_LIN_CHECKSUM_CLASSIC : QPM_LIN_CHECKSUM_ENHANCED;
}

uint8_t QpmLin_Checksum(uint8_t protectedId, const uint8_t *data, size_t dataLength, QpmLinChecksumMode mode)
{
    uint16_t sum = 0;
    size_t i;
    mode = QpmLin_EffectiveMode(protectedId, mode);
    if (mode == QPM_LIN_CHECKSUM_ENHANCED) sum = protectedId;
    for (i = 0; i < dataLength; ++i)
    {
        sum = (uint16_t)(sum + data[i]);
        if (sum > 0xFFU) sum = (uint16_t)((sum & 0xFFU) + 1U);
    }
    return (uint8_t)(~sum);
}

int QpmLin_ValidateFrame(uint8_t protectedId, const uint8_t *data, size_t dataLength, uint8_t checksum, QpmLinChecksumMode mode)
{
    if (!QpmLin_ValidateProtectedId(protectedId)) return 0;
    if (!data && dataLength) return 0;
    return QpmLin_Checksum(protectedId, data, dataLength, mode) == checksum;
}

int QpmLin_SendHeader(QpmLin *lin, uint8_t frameId)
{
    uint8_t header[2];
    int rc;
    if (!lin || !lin->uart.opened || frameId > 0x3FU) return -1;
    rc = QpmUart_SendBreak(&lin->uart, lin->config.breakDurationMs);
    if (rc != 0) return -2;
    header[0] = 0x55U;
    header[1] = QpmLin_ProtectedId(frameId);
    rc = QpmUart_WriteAll(&lin->uart, header, sizeof(header));
    if (rc != (int)sizeof(header)) return -3;
    if (lin->config.discardHeaderEcho)
    {
        uint8_t echo[2];
        (void)QpmUart_ReadExact(&lin->uart, echo, sizeof(echo), lin->config.responseTimeoutMs);
    }
    return 0;
}

int QpmLin_Publish(QpmLin *lin, uint8_t frameId, const uint8_t *data, size_t dataLength, QpmLinChecksumMode mode)
{
    uint8_t checksum;
    uint8_t pid;
    int rc;
    if (!lin || (!data && dataLength) || dataLength > 8U) return -1;
    rc = QpmLin_SendHeader(lin, frameId);
    if (rc != 0) return rc;
    pid = QpmLin_ProtectedId(frameId);
    checksum = QpmLin_Checksum(pid, data, dataLength, mode);
    if (dataLength && QpmUart_WriteAll(&lin->uart, data, dataLength) != (int)dataLength) return -4;
    if (QpmUart_WriteAll(&lin->uart, &checksum, 1U) != 1) return -5;
    return QpmUart_Flush(&lin->uart);
}

int QpmLin_Request(QpmLin *lin, uint8_t frameId, uint8_t *data, size_t dataLength, QpmLinChecksumMode mode, int timeoutMs)
{
    uint8_t checksum;
    uint8_t pid;
    int rc;
    if (!lin || !data || dataLength == 0 || dataLength > 8U) return -1;
    rc = QpmLin_SendHeader(lin, frameId);
    if (rc != 0) return rc;
    if (timeoutMs < 0) timeoutMs = lin->config.responseTimeoutMs;
    rc = QpmUart_ReadExact(&lin->uart, data, dataLength, timeoutMs);
    if (rc != (int)dataLength) return rc >= 0 ? -4 : rc;
    rc = QpmUart_ReadExact(&lin->uart, &checksum, 1U, timeoutMs);
    if (rc != 1) return rc >= 0 ? -5 : rc;
    pid = QpmLin_ProtectedId(frameId);
    return QpmLin_ValidateFrame(pid, data, dataLength, checksum, mode) ? (int)dataLength : -6;
}

#include "qpm_modbus.h"

static void QpmModbus_Put16(uint8_t *dst, uint16_t value) { dst[0] = (uint8_t)(value >> 8); dst[1] = (uint8_t)value; }
static uint16_t QpmModbus_Get16(const uint8_t *src) { return (uint16_t)(((uint16_t)src[0] << 8) | src[1]); }

uint16_t QpmModbus_Crc16(const void *data, size_t size)
{
    const uint8_t *bytes = (const uint8_t *)data;
    uint16_t crc = 0xFFFFu;
    size_t i; int bit;
    if (!data && size) return 0;
    for (i = 0; i < size; ++i)
    {
        crc ^= bytes[i];
        for (bit = 0; bit < 8; ++bit) crc = (crc & 1u) ? (uint16_t)((crc >> 1) ^ 0xA001u) : (uint16_t)(crc >> 1);
    }
    return crc;
}

int QpmModbus_RtuValidate(const void *frame, size_t frameSize)
{
    const uint8_t *bytes = (const uint8_t *)frame;
    uint16_t crc;
    if (!frame || frameSize < 4) return -1;
    crc = QpmModbus_Crc16(bytes, frameSize - 2);
    return bytes[frameSize - 2] == (uint8_t)crc && bytes[frameSize - 1] == (uint8_t)(crc >> 8) ? 1 : 0;
}

static int QpmModbus_RtuFinish(uint8_t *output, size_t payloadSize, size_t capacity, size_t *outputSize)
{
    uint16_t crc;
    if (capacity < payloadSize + 2u || !outputSize) return -1;
    crc = QpmModbus_Crc16(output, payloadSize);
    output[payloadSize] = (uint8_t)crc;
    output[payloadSize + 1] = (uint8_t)(crc >> 8);
    *outputSize = payloadSize + 2u;
    return 0;
}

int QpmModbus_RtuBuildRead(uint8_t slave, uint8_t function, uint16_t address, uint16_t quantity, void *output, size_t capacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    if (!output || !outputSize || quantity == 0 || (function < 1 || function > 4) || capacity < 8) return -1;
    dst[0] = slave; dst[1] = function; QpmModbus_Put16(dst + 2, address); QpmModbus_Put16(dst + 4, quantity);
    return QpmModbus_RtuFinish(dst, 6, capacity, outputSize);
}

int QpmModbus_RtuBuildWriteSingleRegister(uint8_t slave, uint16_t address, uint16_t value, void *output, size_t capacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    if (!output || !outputSize || capacity < 8) return -1;
    dst[0] = slave; dst[1] = QPM_MODBUS_FC_WRITE_SINGLE_REGISTER; QpmModbus_Put16(dst + 2, address); QpmModbus_Put16(dst + 4, value);
    return QpmModbus_RtuFinish(dst, 6, capacity, outputSize);
}

int QpmModbus_RtuBuildWriteMultipleRegisters(uint8_t slave, uint16_t address, const uint16_t *values, uint16_t count, void *output, size_t capacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    size_t payloadSize = 7u + (size_t)count * 2u;
    uint16_t i;
    if (!values || !output || !outputSize || count == 0 || count > 123 || capacity < payloadSize + 2u) return -1;
    dst[0] = slave; dst[1] = QPM_MODBUS_FC_WRITE_MULTIPLE_REGISTERS; QpmModbus_Put16(dst + 2, address); QpmModbus_Put16(dst + 4, count); dst[6] = (uint8_t)(count * 2u);
    for (i = 0; i < count; ++i) QpmModbus_Put16(dst + 7u + (size_t)i * 2u, values[i]);
    return QpmModbus_RtuFinish(dst, payloadSize, capacity, outputSize);
}

int QpmModbus_RtuException(const void *frame, size_t frameSize, uint8_t *exceptionCode)
{
    const uint8_t *bytes = (const uint8_t *)frame;
    if (!frame || frameSize < 5 || QpmModbus_RtuValidate(frame, frameSize) != 1) return -1;
    if ((bytes[1] & 0x80u) == 0) return 0;
    if (exceptionCode) *exceptionCode = bytes[2];
    return 1;
}

int QpmModbus_RtuParseRegisters(const void *frame, size_t frameSize, uint8_t expectedSlave, uint8_t expectedFunction, uint16_t *values, size_t capacity, size_t *valueCount)
{
    const uint8_t *bytes = (const uint8_t *)frame;
    size_t count, i;
    if (!frame || !values || !valueCount || frameSize < 5) return -1;
    if (QpmModbus_RtuValidate(frame, frameSize) != 1) return -2;
    if (bytes[0] != expectedSlave) return -3;
    if (bytes[1] & 0x80u) return -4;
    if (bytes[1] != expectedFunction) return -5;
    if ((bytes[2] & 1u) != 0 || frameSize != (size_t)bytes[2] + 5u) return -6;
    count = bytes[2] / 2u;
    if (count > capacity) { *valueCount = count; return -7; }
    for (i = 0; i < count; ++i) values[i] = QpmModbus_Get16(bytes + 3u + i * 2u);
    *valueCount = count; return 0;
}

static int QpmModbus_TcpHeader(uint16_t transactionId, uint8_t unitId, uint16_t pduLength, uint8_t *dst, size_t capacity)
{
    if (!dst || capacity < (size_t)pduLength + 7u) return -1;
    QpmModbus_Put16(dst, transactionId); QpmModbus_Put16(dst + 2, 0); QpmModbus_Put16(dst + 4, (uint16_t)(pduLength + 1u)); dst[6] = unitId;
    return 0;
}

int QpmModbus_TcpBuildRead(uint16_t transactionId, uint8_t unitId, uint8_t function, uint16_t address, uint16_t quantity, void *output, size_t capacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    if (!output || !outputSize || quantity == 0 || function < 1 || function > 4) return -1;
    if (QpmModbus_TcpHeader(transactionId, unitId, 5, dst, capacity) != 0) return -2;
    dst[7] = function; QpmModbus_Put16(dst + 8, address); QpmModbus_Put16(dst + 10, quantity); *outputSize = 12; return 0;
}

int QpmModbus_TcpBuildWriteSingleRegister(uint16_t transactionId, uint8_t unitId, uint16_t address, uint16_t value, void *output, size_t capacity, size_t *outputSize)
{
    uint8_t *dst = (uint8_t *)output;
    if (!output || !outputSize) return -1;
    if (QpmModbus_TcpHeader(transactionId, unitId, 5, dst, capacity) != 0) return -2;
    dst[7] = QPM_MODBUS_FC_WRITE_SINGLE_REGISTER; QpmModbus_Put16(dst + 8, address); QpmModbus_Put16(dst + 10, value); *outputSize = 12; return 0;
}

static int QpmModbus_TcpValidateHeader(const uint8_t *bytes, size_t frameSize, uint16_t expectedTransactionId, uint8_t expectedUnitId)
{
    uint16_t length;
    if (!bytes || frameSize < 9) return -1;
    if (QpmModbus_Get16(bytes) != expectedTransactionId || QpmModbus_Get16(bytes + 2) != 0 || bytes[6] != expectedUnitId) return -2;
    length = QpmModbus_Get16(bytes + 4);
    return frameSize == (size_t)length + 6u ? 0 : -3;
}

int QpmModbus_TcpException(const void *frame, size_t frameSize, uint8_t *exceptionCode)
{
    const uint8_t *bytes = (const uint8_t *)frame;
    if (!frame || frameSize < 9) return -1;
    if ((bytes[7] & 0x80u) == 0) return 0;
    if (exceptionCode) *exceptionCode = bytes[8];
    return 1;
}

int QpmModbus_TcpParseRegisters(const void *frame, size_t frameSize, uint16_t expectedTransactionId, uint8_t expectedUnitId, uint8_t expectedFunction, uint16_t *values, size_t capacity, size_t *valueCount)
{
    const uint8_t *bytes = (const uint8_t *)frame;
    size_t count, i;
    int rc;
    if (!frame || !values || !valueCount) return -1;
    rc = QpmModbus_TcpValidateHeader(bytes, frameSize, expectedTransactionId, expectedUnitId);
    if (rc != 0) return -2;
    if (bytes[7] & 0x80u) return -3;
    if (bytes[7] != expectedFunction || (bytes[8] & 1u) != 0 || frameSize != (size_t)bytes[8] + 9u) return -4;
    count = bytes[8] / 2u;
    if (count > capacity) { *valueCount = count; return -5; }
    for (i = 0; i < count; ++i) values[i] = QpmModbus_Get16(bytes + 9u + i * 2u);
    *valueCount = count; return 0;
}

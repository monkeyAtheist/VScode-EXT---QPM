#ifndef QPM_MODBUS_H
#define QPM_MODBUS_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

enum
{
    QPM_MODBUS_FC_READ_COILS = 0x01,
    QPM_MODBUS_FC_READ_DISCRETE_INPUTS = 0x02,
    QPM_MODBUS_FC_READ_HOLDING_REGISTERS = 0x03,
    QPM_MODBUS_FC_READ_INPUT_REGISTERS = 0x04,
    QPM_MODBUS_FC_WRITE_SINGLE_COIL = 0x05,
    QPM_MODBUS_FC_WRITE_SINGLE_REGISTER = 0x06,
    QPM_MODBUS_FC_WRITE_MULTIPLE_COILS = 0x0F,
    QPM_MODBUS_FC_WRITE_MULTIPLE_REGISTERS = 0x10
};

uint16_t QpmModbus_Crc16(const void *data, size_t size);
int QpmModbus_RtuValidate(const void *frame, size_t frameSize);
int QpmModbus_RtuBuildRead(uint8_t slave, uint8_t function, uint16_t address, uint16_t quantity, void *output, size_t capacity, size_t *outputSize);
int QpmModbus_RtuBuildWriteSingleRegister(uint8_t slave, uint16_t address, uint16_t value, void *output, size_t capacity, size_t *outputSize);
int QpmModbus_RtuBuildWriteMultipleRegisters(uint8_t slave, uint16_t address, const uint16_t *values, uint16_t count, void *output, size_t capacity, size_t *outputSize);
int QpmModbus_RtuParseRegisters(const void *frame, size_t frameSize, uint8_t expectedSlave, uint8_t expectedFunction, uint16_t *values, size_t capacity, size_t *valueCount);
int QpmModbus_RtuException(const void *frame, size_t frameSize, uint8_t *exceptionCode);

int QpmModbus_TcpBuildRead(uint16_t transactionId, uint8_t unitId, uint8_t function, uint16_t address, uint16_t quantity, void *output, size_t capacity, size_t *outputSize);
int QpmModbus_TcpBuildWriteSingleRegister(uint16_t transactionId, uint8_t unitId, uint16_t address, uint16_t value, void *output, size_t capacity, size_t *outputSize);
int QpmModbus_TcpParseRegisters(const void *frame, size_t frameSize, uint16_t expectedTransactionId, uint8_t expectedUnitId, uint8_t expectedFunction, uint16_t *values, size_t capacity, size_t *valueCount);
int QpmModbus_TcpException(const void *frame, size_t frameSize, uint8_t *exceptionCode);

#ifdef __cplusplus
}
#endif
#endif

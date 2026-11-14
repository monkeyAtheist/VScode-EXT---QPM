#ifndef QPM_MODBUS_RS485_H
#define QPM_MODBUS_RS485_H
#include "qpm_rs485.h"
#include "qpm_modbus.h"
#ifdef __cplusplus
extern "C" {
#endif
typedef struct QpmModbusRs485 { QpmRs485 *bus; uint8_t slave; int timeoutMs; } QpmModbusRs485;
void QpmModbusRs485_Init(QpmModbusRs485 *client,QpmRs485 *bus,uint8_t slave,int timeoutMs);
int QpmModbusRs485_ReadHolding(QpmModbusRs485 *client,uint16_t address,uint16_t quantity,uint16_t *values,size_t capacity,size_t *valueCount);
int QpmModbusRs485_ReadInput(QpmModbusRs485 *client,uint16_t address,uint16_t quantity,uint16_t *values,size_t capacity,size_t *valueCount);
int QpmModbusRs485_WriteSingle(QpmModbusRs485 *client,uint16_t address,uint16_t value);
int QpmModbusRs485_WriteMultiple(QpmModbusRs485 *client,uint16_t address,const uint16_t *values,uint16_t count);
#ifdef __cplusplus
}
#endif
#endif

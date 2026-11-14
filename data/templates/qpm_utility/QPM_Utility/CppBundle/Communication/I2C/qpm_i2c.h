#ifndef QPM_I2C_H
#define QPM_I2C_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmI2cByteOrder { QPM_I2C_MSB_FIRST = 0, QPM_I2C_LSB_FIRST = 1 } QpmI2cByteOrder;
typedef struct QpmI2c { int handle; uint16_t address; } QpmI2c;

void QpmI2c_Init(QpmI2c *bus);
int QpmI2c_Open(QpmI2c *bus, const char *devicePath, uint16_t address);
void QpmI2c_Close(QpmI2c *bus);
int QpmI2c_SetAddress(QpmI2c *bus, uint16_t address);
int QpmI2c_Write(QpmI2c *bus, const void *data, size_t size);
int QpmI2c_Read(QpmI2c *bus, void *data, size_t size);
int QpmI2c_WriteRead(QpmI2c *bus, const void *writeData, size_t writeSize, void *readData, size_t readSize);
int QpmI2c_WriteRegister8(QpmI2c *bus, uint8_t reg, uint8_t value);
int QpmI2c_ReadRegister8(QpmI2c *bus, uint8_t reg, uint8_t *value);
int QpmI2c_ReadRegisters(QpmI2c *bus, uint8_t startReg, void *data, size_t size);
int QpmI2c_WriteRegister16(QpmI2c *bus, uint16_t reg, const void *data, size_t size, QpmI2cByteOrder order);
int QpmI2c_ReadRegister16(QpmI2c *bus, uint16_t reg, void *data, size_t size, QpmI2cByteOrder order);

#ifdef __cplusplus
}
#endif
#endif

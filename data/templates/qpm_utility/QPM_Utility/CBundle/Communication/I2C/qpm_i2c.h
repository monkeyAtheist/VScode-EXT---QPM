/**
 * @file qpm_i2c.h
 * @brief QPM C Linux I2C device-file communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - opens an I2C bus device such as "/dev/i2c-1";
 * - selects the slave address for the active transaction;
 * - reads and writes raw buffers;
 * - provides register read/write helpers for 8-bit register maps.
 *
 * @par Typical applications
 * - Raspberry Pi or Linux SBC communication with sensors, EEPROMs and expanders;
 * - quick validation of I2C peripherals from C;
 * - test benches that need deterministic low-level I2C access.
 *
 * @par Usage notes
 * - The bundled implementation targets Linux i2c-dev.
 * - Enable I2C and configure permissions before running the executable.
 * - For 16-bit registers or special protocols, build a small wrapper above the raw read/write calls.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_i2c.h"
 * 
 * QpmI2cBus bus;
 * uint8_t value = 0;
 * QpmI2c_Init(&bus);
 * if (QpmI2c_Open(&bus, "/dev/i2c-1") == 0)
 * {
 *     QpmI2c_SetAddress(&bus, 0x48);
 *     QpmI2c_ReadRegister8(&bus, 0x00, &value);
 *     QpmI2c_Close(&bus);
 * }
 * @endcode
 */
#ifndef QPM_I2C_H
#define QPM_I2C_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

typedef struct QpmI2cBus
{
    int handle;
    int currentAddress;
} QpmI2cBus;

void QpmI2c_Init(QpmI2cBus *bus);
int QpmI2c_Open(QpmI2cBus *bus, const char *devicePath);
void QpmI2c_Close(QpmI2cBus *bus);
int QpmI2c_SetAddress(QpmI2cBus *bus, uint8_t address);
int QpmI2c_Write(QpmI2cBus *bus, const uint8_t *data, size_t size);
int QpmI2c_Read(QpmI2cBus *bus, uint8_t *data, size_t size);
int QpmI2c_WriteRead(QpmI2cBus *bus,
                     const uint8_t *txData,
                     size_t txSize,
                     uint8_t *rxData,
                     size_t rxSize);
int QpmI2c_WriteRegister8(QpmI2cBus *bus, uint8_t registerAddress, uint8_t value);
int QpmI2c_ReadRegister8(QpmI2cBus *bus, uint8_t registerAddress, uint8_t *value);
int QpmI2c_ReadRegisters(QpmI2cBus *bus, uint8_t startRegister, uint8_t *data, size_t size);

#ifdef __cplusplus
}
#endif

#endif /* QPM_I2C_H */

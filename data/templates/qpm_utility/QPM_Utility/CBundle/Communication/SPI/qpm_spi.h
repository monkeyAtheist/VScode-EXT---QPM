/**
 * @file qpm_spi.h
 * @brief QPM C Linux SPI device-file communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - opens an spidev node such as "/dev/spidev0.0";
 * - configures mode, bits per word, speed and LSB/MSB order;
 * - performs full-duplex transfers;
 * - provides simple write and read helpers built on transfer calls.
 *
 * @par Typical applications
 * - Raspberry Pi or Linux SBC communication with ADCs, DACs, displays and sensors;
 * - low-level validation of SPI peripherals;
 * - embedded test tools where a small C interface is enough.
 *
 * @par Usage notes
 * - The bundled implementation targets Linux spidev.
 * - Enable SPI and configure permissions before running the executable.
 * - SPI is full duplex: reading generally also writes dummy bytes.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_spi.h"
 * 
 * QpmSpiDevice device;
 * uint8_t tx[2] = { 0x9F, 0x00 };
 * uint8_t rx[2] = { 0 };
 * QpmSpi_Init(&device);
 * if (QpmSpi_Open(&device, "/dev/spidev0.0", 1000000U, QPM_SPI_MODE0, 8) == 0)
 * {
 *     QpmSpi_Transfer(&device, tx, rx, sizeof(tx));
 *     QpmSpi_Close(&device);
 * }
 * @endcode
 */
#ifndef QPM_SPI_H
#define QPM_SPI_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

typedef struct QpmSpiDevice
{
    int handle;
    uint32_t speedHz;
    uint8_t mode;
    uint8_t bitsPerWord;
} QpmSpiDevice;

void QpmSpi_Init(QpmSpiDevice *device);
int QpmSpi_Open(QpmSpiDevice *device, const char *devicePath, uint32_t speedHz, uint8_t mode, uint8_t bitsPerWord);
void QpmSpi_Close(QpmSpiDevice *device);
int QpmSpi_SetMode(QpmSpiDevice *device, uint8_t mode);
int QpmSpi_SetSpeed(QpmSpiDevice *device, uint32_t speedHz);
int QpmSpi_SetBitsPerWord(QpmSpiDevice *device, uint8_t bitsPerWord);
int QpmSpi_Transfer(QpmSpiDevice *device, const uint8_t *txData, uint8_t *rxData, size_t size);
int QpmSpi_Write(QpmSpiDevice *device, const uint8_t *data, size_t size);
int QpmSpi_Read(QpmSpiDevice *device, uint8_t fillByte, uint8_t *data, size_t size);

#ifdef __cplusplus
}
#endif

#endif /* QPM_SPI_H */

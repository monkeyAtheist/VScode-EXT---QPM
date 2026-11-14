#ifndef QPM_SPI_H
#define QPM_SPI_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmSpi { int handle; uint32_t speedHz; uint8_t mode; uint8_t bitsPerWord; } QpmSpi;
typedef struct QpmSpiSegment
{
    const void *txData;
    void *rxData;
    size_t size;
    uint32_t speedHz; /* 0 = current default. */
    uint16_t delayUsec;
    uint8_t bitsPerWord; /* 0 = current default. */
    uint8_t csChange;
} QpmSpiSegment;

void QpmSpi_Init(QpmSpi *spi);
int QpmSpi_Open(QpmSpi *spi,const char *devicePath,uint32_t speedHz,uint8_t mode,uint8_t bitsPerWord);
void QpmSpi_Close(QpmSpi *spi);
int QpmSpi_Configure(QpmSpi *spi,uint32_t speedHz,uint8_t mode,uint8_t bitsPerWord);
int QpmSpi_Transfer(QpmSpi *spi,const void *txData,void *rxData,size_t size);
int QpmSpi_TransferEx(QpmSpi *spi,const QpmSpiSegment *segment);
int QpmSpi_TransferSegments(QpmSpi *spi,const QpmSpiSegment *segments,size_t count);
int QpmSpi_Write(QpmSpi *spi,const void *data,size_t size);
int QpmSpi_Read(QpmSpi *spi,void *data,size_t size,uint8_t fillByte);

#ifdef __cplusplus
}
#endif
#endif

# QPM C SPI module

Minimal C wrapper for Linux spidev devices such as `/dev/spidev0.0`.

Typical usage:

```c
QpmSpiDevice spi;
uint8_t tx[2] = { 0x9F, 0x00 };
uint8_t rx[2] = { 0 };

QpmSpi_Init(&spi);
if (QpmSpi_Open(&spi, "/dev/spidev0.0", 1000000U, 0, 8) == 0)
{
    QpmSpi_Transfer(&spi, tx, rx, sizeof(tx));
    QpmSpi_Close(&spi);
}
```

The module returns `-2` on platforms where the low-level SPI backend is not implemented.

# QPM C I2C module

Minimal C wrapper for Linux I2C devices such as `/dev/i2c-1`.

Typical usage:

```c
QpmI2cBus bus;
uint8_t value = 0;

QpmI2c_Init(&bus);
if (QpmI2c_Open(&bus, "/dev/i2c-1") == 0)
{
    QpmI2c_SetAddress(&bus, 0x40);
    QpmI2c_ReadRegister8(&bus, 0x00, &value);
    QpmI2c_Close(&bus);
}
```

The module returns `-2` on platforms where the low-level I2C backend is not implemented.

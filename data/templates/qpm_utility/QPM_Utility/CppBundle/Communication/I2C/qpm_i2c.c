#include "qpm_i2c.h"

#include <stdlib.h>
#include <string.h>

#if defined(__linux__)
#include <fcntl.h>
#include <linux/i2c-dev.h>
#include <linux/i2c.h>
#include <sys/ioctl.h>
#include <unistd.h>
#endif

void QpmI2c_Init(QpmI2c *bus)
{
    if (bus)
    {
        bus->handle = -1;
        bus->address = 0;
    }
}

int QpmI2c_SetAddress(QpmI2c *bus, uint16_t address)
{
#if defined(__linux__)
    if (!bus || bus->handle < 0) return -1;
    if (ioctl(bus->handle, I2C_SLAVE, address) != 0) return -2;
    bus->address = address;
    return 0;
#else
    (void)bus; (void)address;
    return -2;
#endif
}

int QpmI2c_Open(QpmI2c *bus, const char *devicePath, uint16_t address)
{
#if defined(__linux__)
    int fd;
    if (!bus || !devicePath) return -1;
    QpmI2c_Close(bus);
    fd = open(devicePath, O_RDWR);
    if (fd < 0) return -2;
    bus->handle = fd;
    if (QpmI2c_SetAddress(bus, address) != 0)
    {
        close(fd);
        QpmI2c_Init(bus);
        return -3;
    }
    return 0;
#else
    (void)bus; (void)devicePath; (void)address;
    return -2;
#endif
}

void QpmI2c_Close(QpmI2c *bus)
{
    if (!bus) return;
#if defined(__linux__)
    if (bus->handle >= 0) close(bus->handle);
#endif
    QpmI2c_Init(bus);
}

int QpmI2c_Write(QpmI2c *bus, const void *data, size_t size)
{
#if defined(__linux__)
    ssize_t n;
    if (!bus || bus->handle < 0 || (!data && size)) return -1;
    n = write(bus->handle, data, size);
    return n < 0 ? -2 : (int)n;
#else
    (void)bus; (void)data; (void)size;
    return -2;
#endif
}

int QpmI2c_Read(QpmI2c *bus, void *data, size_t size)
{
#if defined(__linux__)
    ssize_t n;
    if (!bus || bus->handle < 0 || (!data && size)) return -1;
    n = read(bus->handle, data, size);
    return n < 0 ? -2 : (int)n;
#else
    (void)bus; (void)data; (void)size;
    return -2;
#endif
}

int QpmI2c_WriteRead(QpmI2c *bus, const void *writeData, size_t writeSize, void *readData, size_t readSize)
{
#if defined(__linux__)
    struct i2c_msg msgs[2];
    struct i2c_rdwr_ioctl_data tx;
    unsigned count = 0;
    if (!bus || bus->handle < 0 || (!writeData && writeSize) || (!readData && readSize)) return -1;
    if (writeSize > 65535u || readSize > 65535u) return -2;
    memset(msgs, 0, sizeof(msgs));
    if (writeSize)
    {
        msgs[count].addr = bus->address;
        msgs[count].flags = 0;
        msgs[count].len = (uint16_t)writeSize;
        msgs[count].buf = (uint8_t *)writeData;
        count++;
    }
    if (readSize)
    {
        msgs[count].addr = bus->address;
        msgs[count].flags = I2C_M_RD;
        msgs[count].len = (uint16_t)readSize;
        msgs[count].buf = (uint8_t *)readData;
        count++;
    }
    if (count == 0) return 0;
    tx.msgs = msgs;
    tx.nmsgs = count;
    return ioctl(bus->handle, I2C_RDWR, &tx) == (int)count ? 0 : -3;
#else
    (void)bus; (void)writeData; (void)writeSize; (void)readData; (void)readSize;
    return -2;
#endif
}

int QpmI2c_WriteRegister8(QpmI2c *bus, uint8_t reg, uint8_t value)
{
    uint8_t bytes[2] = { reg, value };
    return QpmI2c_Write(bus, bytes, sizeof(bytes)) == (int)sizeof(bytes) ? 0 : -1;
}

int QpmI2c_ReadRegister8(QpmI2c *bus, uint8_t reg, uint8_t *value)
{
    if (!value) return -1;
    return QpmI2c_WriteRead(bus, &reg, 1, value, 1);
}

int QpmI2c_ReadRegisters(QpmI2c *bus, uint8_t startReg, void *data, size_t size)
{
    if (!data && size) return -1;
    return QpmI2c_WriteRead(bus, &startReg, 1, data, size);
}

int QpmI2c_WriteRegister16(QpmI2c *bus, uint16_t reg, const void *data, size_t size, QpmI2cByteOrder order)
{
    unsigned char stack[258];
    unsigned char *buffer = stack;
    size_t total = size + 2;
    int result;
    if ((!data && size) || size > 65533u) return -1;
    if (total > sizeof(stack))
    {
        buffer = (unsigned char *)malloc(total);
        if (!buffer) return -2;
    }
    if (order == QPM_I2C_LSB_FIRST)
    {
        buffer[0] = (unsigned char)reg;
        buffer[1] = (unsigned char)(reg >> 8);
    }
    else
    {
        buffer[0] = (unsigned char)(reg >> 8);
        buffer[1] = (unsigned char)reg;
    }
    if (size) memcpy(buffer + 2, data, size);
    result = QpmI2c_Write(bus, buffer, total) == (int)total ? 0 : -3;
    if (buffer != stack) free(buffer);
    return result;
}

int QpmI2c_ReadRegister16(QpmI2c *bus, uint16_t reg, void *data, size_t size, QpmI2cByteOrder order)
{
    unsigned char bytes[2];
    if (!data && size) return -1;
    if (order == QPM_I2C_LSB_FIRST)
    {
        bytes[0] = (unsigned char)reg;
        bytes[1] = (unsigned char)(reg >> 8);
    }
    else
    {
        bytes[0] = (unsigned char)(reg >> 8);
        bytes[1] = (unsigned char)reg;
    }
    return QpmI2c_WriteRead(bus, bytes, sizeof(bytes), data, size);
}

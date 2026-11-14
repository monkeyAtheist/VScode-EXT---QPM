#define _DEFAULT_SOURCE
#include "qpm_rs485.h"

#include <string.h>
#if defined(_WIN32)
#include <windows.h>
#else
#include <time.h>
#if defined(__linux__)
#include <sys/ioctl.h>
#include <linux/serial.h>
#endif
#endif

static void QpmRs485_SleepUs(uint32_t us)
{
#if defined(_WIN32)
    if (us) Sleep((DWORD)((us + 999U) / 1000U));
#else
    struct timespec ts;
    ts.tv_sec = (time_t)(us / 1000000U);
    ts.tv_nsec = (long)(us % 1000000U) * 1000L;
    while (nanosleep(&ts, &ts) != 0) { }
#endif
}

void QpmRs485_DefaultConfig(QpmRs485Config *config)
{
    if (!config) return;
    memset(config, 0, sizeof(*config));
    QpmUart_DefaultConfig(&config->uart);
    config->manualDirection = 1;
    config->rtsActiveHigh = 1;
    config->preTransmitDelayUs = 0;
    config->postTransmitDelayUs = 0;
    config->tryLinuxKernelMode = 1;
    config->uart.rtsEnabled = 0;
}

void QpmRs485_Init(QpmRs485 *bus)
{
    if (!bus) return;
    memset(bus, 0, sizeof(*bus));
    QpmUart_Init(&bus->uart);
    QpmRs485_DefaultConfig(&bus->config);
}

static int QpmRs485_TryKernelMode(QpmRs485 *bus)
{
#if defined(__linux__) && defined(TIOCSRS485)
    struct serial_rs485 rs485;
    if (!bus || !bus->uart.opened) return -1;
    memset(&rs485, 0, sizeof(rs485));
    rs485.flags |= SER_RS485_ENABLED;
    if (bus->config.rtsActiveHigh) rs485.flags |= SER_RS485_RTS_ON_SEND;
    else rs485.flags |= SER_RS485_RTS_AFTER_SEND;
    rs485.delay_rts_before_send = bus->config.preTransmitDelayUs / 1000U;
    rs485.delay_rts_after_send = bus->config.postTransmitDelayUs / 1000U;
    if (ioctl((int)bus->uart.handle, TIOCSRS485, &rs485) == 0)
    {
        bus->kernelModeEnabled = 1;
        return 0;
    }
#else
    (void)bus;
#endif
    return -2;
}

int QpmRs485_Open(QpmRs485 *bus, const char *port, const QpmRs485Config *config)
{
    QpmRs485Config local;
    if (!bus || !port) return -1;
    if (!config) { QpmRs485_DefaultConfig(&local); config = &local; }
    QpmRs485_Close(bus);
    bus->config = *config;
    if (QpmUart_OpenConfig(&bus->uart, port, &config->uart) != 0) return -2;
    bus->kernelModeEnabled = 0;
    if (config->tryLinuxKernelMode && QpmRs485_TryKernelMode(bus) == 0)
        bus->config.manualDirection = 0;
    if (bus->config.manualDirection)
        (void)QpmRs485_SetDirection(bus, 0);
    return 0;
}

void QpmRs485_Close(QpmRs485 *bus)
{
    if (!bus) return;
    QpmUart_Close(&bus->uart);
    QpmRs485_Init(bus);
}

int QpmRs485_SetDirection(QpmRs485 *bus, int transmit)
{
    int level;
    if (!bus || !bus->uart.opened) return -1;
    if (!bus->config.manualDirection || bus->kernelModeEnabled) return 0;
    level = transmit ? bus->config.rtsActiveHigh : !bus->config.rtsActiveHigh;
    return QpmUart_SetRts(&bus->uart, level);
}

int QpmRs485_Write(QpmRs485 *bus, const void *data, size_t size)
{
    int rc;
    if (!bus || !bus->uart.opened) return -1;
    if (QpmRs485_SetDirection(bus, 1) != 0) return -2;
    QpmRs485_SleepUs(bus->config.preTransmitDelayUs);
    rc = QpmUart_WriteAll(&bus->uart, data, size);
    if (rc >= 0 && QpmUart_Flush(&bus->uart) != 0) rc = -3;
    QpmRs485_SleepUs(bus->config.postTransmitDelayUs);
    if (QpmRs485_SetDirection(bus, 0) != 0 && rc >= 0) rc = -4;
    return rc;
}

int QpmRs485_Read(QpmRs485 *bus, void *data, size_t size, int timeoutMs)
{
    if (!bus) return -1;
    (void)QpmRs485_SetDirection(bus, 0);
    return QpmUart_Read(&bus->uart, data, size, timeoutMs);
}

int QpmRs485_ReadExact(QpmRs485 *bus, void *data, size_t size, int timeoutMs)
{
    if (!bus) return -1;
    (void)QpmRs485_SetDirection(bus, 0);
    return QpmUart_ReadExact(&bus->uart, data, size, timeoutMs);
}

int QpmRs485_Transceive(QpmRs485 *bus, const void *txData, size_t txSize,
                        void *rxData, size_t rxCapacity, int responseTimeoutMs)
{
    int rc = QpmRs485_Write(bus, txData, txSize);
    if (rc < 0) return rc;
    return QpmRs485_Read(bus, rxData, rxCapacity, responseTimeoutMs);
}

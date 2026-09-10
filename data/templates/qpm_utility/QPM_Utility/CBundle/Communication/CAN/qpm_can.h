/**
 * @file qpm_can.h
 * @brief QPM C CAN and SocketCAN communication API.
 *
 * @details
 * This bundle is intended to be readable immediately after insertion into a
 * QPM project. The comments below summarize what the module provides, when it
 * is useful and how to start using the public API.
 *
 * @par Main features
 * - opens a CAN interface and optionally enables CAN FD;
 * - builds standard and extended frame identifiers;
 * - sends and receives classic CAN or CAN FD frames;
 * - configures timeouts, loopback, own-message reception and filters;
 * - formats frames for diagnostics and logs.
 *
 * @par Typical applications
 * - Linux SocketCAN test utilities;
 * - communication with ECUs, embedded boards and CAN sensors;
 * - bench diagnostics where a small C wrapper is preferable to vendor tooling.
 *
 * @par Usage notes
 * - The default backend targets Linux SocketCAN interfaces such as "can0".
 * - Configure bitrate and bring the interface up outside the program, for example with ip link.
 * - Windows adapters normally require vendor-specific SDK glue code.
 *
 * @par Example of use
 * @code{.c}
 * #include "qpm_can.h"
 * 
 * QpmCanBus bus;
 * QpmCanFrame frame;
 * uint8_t payload[] = { 0x11, 0x22 };
 * QpmCan_InitBus(&bus);
 * QpmCan_InitFrame(&frame);
 * if (QpmCan_Open(&bus, "can0", 0) == 0)
 * {
 *     frame.id = QpmCan_MakeStandardId(0x123);
 *     QpmCan_SetData(&frame, payload, sizeof(payload));
 *     QpmCan_Send(&bus, &frame);
 *     QpmCan_Close(&bus);
 * }
 * @endcode
 */
#ifndef QPM_CAN_H
#define QPM_CAN_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stddef.h>
#include <stdint.h>

#define QPM_CAN_MAX_DATA 64u

#define QPM_CAN_OK 0
#define QPM_CAN_ERROR_INVALID_ARGUMENT (-1)
#define QPM_CAN_ERROR_UNSUPPORTED (-2)
#define QPM_CAN_ERROR_SYSTEM (-3)
#define QPM_CAN_ERROR_TIMEOUT (-4)
#define QPM_CAN_ERROR_TRUNCATED (-5)

typedef struct QpmCanBus
{
    int handle;
    int canFdEnabled;
    char interfaceName[32];
} QpmCanBus;

typedef struct QpmCanFrame
{
    uint32_t id;
    uint8_t dlc;
    uint8_t data[QPM_CAN_MAX_DATA];
    uint8_t isExtended;
    uint8_t isRemote;
    uint8_t isError;
    uint8_t isFd;
    uint8_t bitrateSwitch;
    uint8_t errorStateIndicator;
} QpmCanFrame;

void QpmCan_InitBus(QpmCanBus *bus);
void QpmCan_InitFrame(QpmCanFrame *frame);
int QpmCan_SetData(QpmCanFrame *frame, const uint8_t *data, size_t size);

int QpmCan_Open(QpmCanBus *bus, const char *interfaceName, int enableCanFd);
void QpmCan_Close(QpmCanBus *bus);
int QpmCan_IsOpen(const QpmCanBus *bus);

int QpmCan_SetReceiveTimeout(QpmCanBus *bus, int timeoutMs);
int QpmCan_SetLoopback(QpmCanBus *bus, int enabled);
int QpmCan_SetReceiveOwnMessages(QpmCanBus *bus, int enabled);
int QpmCan_SetFilters(QpmCanBus *bus, const uint32_t *ids, const uint32_t *masks, size_t count);
int QpmCan_ClearFilters(QpmCanBus *bus);

int QpmCan_Send(QpmCanBus *bus, const QpmCanFrame *frame);
int QpmCan_Receive(QpmCanBus *bus, QpmCanFrame *frame);

uint32_t QpmCan_MakeStandardId(uint16_t id11);
uint32_t QpmCan_MakeExtendedId(uint32_t id29);
int QpmCan_FormatFrame(const QpmCanFrame *frame, char *buffer, size_t bufferSize);
const char *QpmCan_LastError(void);

#ifdef __cplusplus
}
#endif

#endif /* QPM_CAN_H */

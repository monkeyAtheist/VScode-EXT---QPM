#ifndef QPM_CAN_H
#define QPM_CAN_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmCanFrame
{
    uint32_t id;
    uint8_t data[64];
    uint8_t length;
    uint8_t extended;
    uint8_t remote;
    uint8_t fd;
} QpmCanFrame;

typedef struct QpmCanFilter
{
    uint32_t id;
    uint32_t mask;
    uint8_t extended;
} QpmCanFilter;

typedef struct QpmCan
{
    int handle;
    int fdEnabled;
} QpmCan;

void QpmCan_Init(QpmCan *canBus);
int QpmCan_Open(QpmCan *canBus, const char *interfaceName, int enableFd);
void QpmCan_Close(QpmCan *canBus);
int QpmCan_Send(QpmCan *canBus, const QpmCanFrame *frame);
int QpmCan_Receive(QpmCan *canBus, QpmCanFrame *frame, int timeoutMs);
int QpmCan_SetFilter(QpmCan *canBus, uint32_t id, uint32_t mask, int extended);
int QpmCan_SetFilters(QpmCan *canBus, const QpmCanFilter *filters, size_t count);
int QpmCan_ClearFilters(QpmCan *canBus);
int QpmCan_SetLoopback(QpmCan *canBus, int enabled);
int QpmCan_SetReceiveOwnMessages(QpmCan *canBus, int enabled);
int QpmCan_SetErrorMask(QpmCan *canBus, uint32_t errorMask);
int QpmCan_FormatFrame(const QpmCanFrame *frame, char *buffer, size_t bufferSize);

#ifdef __cplusplus
}
#endif
#endif

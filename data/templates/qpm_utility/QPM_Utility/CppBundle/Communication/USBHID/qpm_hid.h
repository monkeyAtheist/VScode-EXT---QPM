#ifndef QPM_HID_H
#define QPM_HID_H

#include <stddef.h>
#include <stdint.h>
#include <wchar.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmHidInfo
{
    char path[512];
    uint16_t vendorId;
    uint16_t productId;
    uint16_t versionNumber;
    wchar_t manufacturer[128];
    wchar_t product[128];
    wchar_t serialNumber[128];
} QpmHidInfo;

typedef int (*QpmHidEnumerateCallback)(const QpmHidInfo *info, void *context);

typedef struct QpmHidDevice
{
    intptr_t handle;
    int opened;
    uint16_t inputReportLength;
    uint16_t outputReportLength;
    uint16_t featureReportLength;
    char path[512];
} QpmHidDevice;

void QpmHid_Init(QpmHidDevice *device);
void QpmHid_Close(QpmHidDevice *device);
int QpmHid_Enumerate(uint16_t vendorId, uint16_t productId, QpmHidEnumerateCallback callback, void *context);
int QpmHid_OpenPath(QpmHidDevice *device, const char *path);
int QpmHid_OpenVidPid(QpmHidDevice *device, uint16_t vendorId, uint16_t productId, const wchar_t *serialNumber);
int QpmHid_Read(QpmHidDevice *device, void *buffer, size_t capacity, int timeoutMs);
int QpmHid_Write(QpmHidDevice *device, const void *report, size_t reportSize);
int QpmHid_GetFeature(QpmHidDevice *device, void *report, size_t reportSize);
int QpmHid_SetFeature(QpmHidDevice *device, const void *report, size_t reportSize);
const char *QpmHid_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif

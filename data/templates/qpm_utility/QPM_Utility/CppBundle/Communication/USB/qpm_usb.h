#ifndef QPM_USB_H
#define QPM_USB_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define QPM_USB_MAX_STRING 128
typedef struct QpmUsbRuntime { void *library; void *context; void *functions[16]; } QpmUsbRuntime;
typedef struct QpmUsbDevice { QpmUsbRuntime *runtime; void *handle; int claimedInterface; } QpmUsbDevice;
typedef struct QpmUsbDeviceInfo { uint16_t vendorId, productId; uint8_t busNumber, deviceAddress, deviceClass, deviceSubClass, deviceProtocol; char manufacturer[QPM_USB_MAX_STRING]; char product[QPM_USB_MAX_STRING]; char serialNumber[QPM_USB_MAX_STRING]; } QpmUsbDeviceInfo;
void QpmUsb_RuntimeInit(QpmUsbRuntime *runtime);
int QpmUsb_Load(QpmUsbRuntime *runtime);
int QpmUsb_LoadLibrary(QpmUsbRuntime *runtime,const char *path);
void QpmUsb_Unload(QpmUsbRuntime *runtime);
int QpmUsb_IsLoaded(const QpmUsbRuntime *runtime);
int QpmUsb_Enumerate(QpmUsbRuntime *runtime,QpmUsbDeviceInfo *items,size_t capacity,size_t *count);
void QpmUsb_DeviceInit(QpmUsbDevice *device);
int QpmUsb_OpenVidPid(QpmUsbRuntime *runtime,QpmUsbDevice *device,uint16_t vid,uint16_t pid,const char *serialNumber);
void QpmUsb_Close(QpmUsbDevice *device);
int QpmUsb_ClaimInterface(QpmUsbDevice *device,int interfaceNumber);
int QpmUsb_ReleaseInterface(QpmUsbDevice *device);
int QpmUsb_BulkTransfer(QpmUsbDevice *device,uint8_t endpoint,void *data,size_t size,int timeoutMs);
int QpmUsb_InterruptTransfer(QpmUsbDevice *device,uint8_t endpoint,void *data,size_t size,int timeoutMs);
int QpmUsb_ControlTransfer(QpmUsbDevice *device,uint8_t requestType,uint8_t request,uint16_t value,uint16_t index,void *data,uint16_t length,int timeoutMs);
const char *QpmUsb_LastErrorText(void);
#ifdef __cplusplus
}
#endif
#endif

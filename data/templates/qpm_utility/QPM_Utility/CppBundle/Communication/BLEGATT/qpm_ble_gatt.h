#ifndef QPM_BLE_GATT_H
#define QPM_BLE_GATT_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif
#define QPM_BLE_UUID_TEXT 48
typedef struct QpmBleDeviceInfo { char path[512]; char name[256]; } QpmBleDeviceInfo;
typedef struct QpmBleGattDevice { intptr_t handle; char path[512]; } QpmBleGattDevice;
typedef struct QpmBleGattService { char uuid[QPM_BLE_UUID_TEXT]; uint16_t attributeHandle; unsigned char native[48]; } QpmBleGattService;
typedef struct QpmBleGattCharacteristic { char uuid[QPM_BLE_UUID_TEXT]; uint16_t attributeHandle; int readable,writable,writeWithoutResponse,notifiable,indicatable; unsigned char native[96]; } QpmBleGattCharacteristic;
int QpmBleGatt_IsSupported(void);
int QpmBleGatt_Enumerate(QpmBleDeviceInfo *items,size_t capacity,size_t *count);
void QpmBleGatt_Init(QpmBleGattDevice *device);
int QpmBleGatt_OpenPath(QpmBleGattDevice *device,const char *path);
void QpmBleGatt_Close(QpmBleGattDevice *device);
int QpmBleGatt_GetServices(QpmBleGattDevice *device,QpmBleGattService *items,size_t capacity,size_t *count);
int QpmBleGatt_GetCharacteristics(QpmBleGattDevice *device,const QpmBleGattService *service,QpmBleGattCharacteristic *items,size_t capacity,size_t *count);
int QpmBleGatt_Read(QpmBleGattDevice *device,const QpmBleGattCharacteristic *characteristic,void *data,size_t capacity,size_t *dataSize);
int QpmBleGatt_Write(QpmBleGattDevice *device,const QpmBleGattCharacteristic *characteristic,const void *data,size_t size,int withoutResponse);
const char *QpmBleGatt_LastErrorText(void);
#ifdef __cplusplus
}
#endif
#endif

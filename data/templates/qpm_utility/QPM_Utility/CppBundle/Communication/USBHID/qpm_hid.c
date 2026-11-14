#include "qpm_hid.h"

#include <stdio.h>
#include <string.h>

#if defined(_WIN32)
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <setupapi.h>
#include <hidsdi.h>
#elif defined(QPM_HID_USE_HIDAPI)
#include <hidapi/hidapi.h>
#endif

void QpmHid_Init(QpmHidDevice *device)
{
    if (!device) return;
    memset(device, 0, sizeof(*device));
    device->handle = -1;
}

void QpmHid_Close(QpmHidDevice *device)
{
    if (!device) return;
    if (device->opened)
    {
#if defined(_WIN32)
        CloseHandle((HANDLE)device->handle);
#elif defined(QPM_HID_USE_HIDAPI)
        hid_close((hid_device *)device->handle);
#endif
    }
    QpmHid_Init(device);
}

#if defined(_WIN32)
static void QpmHid_CopyWide(HANDLE handle, BOOLEAN (__stdcall *getter)(HANDLE, PVOID, ULONG), wchar_t *dst, size_t capacity)
{
    if (!dst || capacity == 0) return;
    dst[0] = L'\0';
    if (getter) (void)getter(handle, dst, (ULONG)(capacity * sizeof(wchar_t)));
}

static int QpmHid_QueryInfo(const char *path, QpmHidInfo *info)
{
    HANDLE handle;
    HIDD_ATTRIBUTES attributes;
    if (!path || !info) return -1;
    memset(info, 0, sizeof(*info));
    snprintf(info->path, sizeof(info->path), "%s", path);
    handle = CreateFileA(path, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, 0, NULL);
    if (handle == INVALID_HANDLE_VALUE) return -2;
    memset(&attributes, 0, sizeof(attributes));
    attributes.Size = sizeof(attributes);
    if (HidD_GetAttributes(handle, &attributes))
    {
        info->vendorId = attributes.VendorID;
        info->productId = attributes.ProductID;
        info->versionNumber = attributes.VersionNumber;
    }
    QpmHid_CopyWide(handle, HidD_GetManufacturerString, info->manufacturer, sizeof(info->manufacturer) / sizeof(info->manufacturer[0]));
    QpmHid_CopyWide(handle, HidD_GetProductString, info->product, sizeof(info->product) / sizeof(info->product[0]));
    QpmHid_CopyWide(handle, HidD_GetSerialNumberString, info->serialNumber, sizeof(info->serialNumber) / sizeof(info->serialNumber[0]));
    CloseHandle(handle);
    return 0;
}

int QpmHid_Enumerate(uint16_t vendorId, uint16_t productId, QpmHidEnumerateCallback callback, void *context)
{
    GUID hidGuid;
    HDEVINFO set;
    SP_DEVICE_INTERFACE_DATA iface;
    DWORD index = 0;
    int count = 0;
    HidD_GetHidGuid(&hidGuid);
    set = SetupDiGetClassDevsA(&hidGuid, NULL, NULL, DIGCF_PRESENT | DIGCF_DEVICEINTERFACE);
    if (set == INVALID_HANDLE_VALUE) return -1;
    memset(&iface, 0, sizeof(iface)); iface.cbSize = sizeof(iface);
    while (SetupDiEnumDeviceInterfaces(set, NULL, &hidGuid, index++, &iface))
    {
        DWORD required = 0;
        PSP_DEVICE_INTERFACE_DETAIL_DATA_A detail;
        QpmHidInfo info;
        SetupDiGetDeviceInterfaceDetailA(set, &iface, NULL, 0, &required, NULL);
        if (!required) continue;
        detail = (PSP_DEVICE_INTERFACE_DETAIL_DATA_A)HeapAlloc(GetProcessHeap(), 0, required);
        if (!detail) { SetupDiDestroyDeviceInfoList(set); return -2; }
        detail->cbSize = sizeof(*detail);
        if (SetupDiGetDeviceInterfaceDetailA(set, &iface, detail, required, NULL, NULL) && QpmHid_QueryInfo(detail->DevicePath, &info) == 0)
        {
            if ((!vendorId || info.vendorId == vendorId) && (!productId || info.productId == productId))
            {
                ++count;
                if (callback && callback(&info, context) == 0)
                {
                    HeapFree(GetProcessHeap(), 0, detail);
                    break;
                }
            }
        }
        HeapFree(GetProcessHeap(), 0, detail);
    }
    SetupDiDestroyDeviceInfoList(set);
    return count;
}

static int QpmHid_LoadCaps(QpmHidDevice *device, HANDLE handle)
{
    PHIDP_PREPARSED_DATA preparsed = NULL;
    HIDP_CAPS caps;
    if (!HidD_GetPreparsedData(handle, &preparsed)) return -1;
    memset(&caps, 0, sizeof(caps));
    if (HidP_GetCaps(preparsed, &caps) != HIDP_STATUS_SUCCESS)
    {
        HidD_FreePreparsedData(preparsed);
        return -2;
    }
    device->inputReportLength = caps.InputReportByteLength;
    device->outputReportLength = caps.OutputReportByteLength;
    device->featureReportLength = caps.FeatureReportByteLength;
    HidD_FreePreparsedData(preparsed);
    return 0;
}

int QpmHid_OpenPath(QpmHidDevice *device, const char *path)
{
    HANDLE handle;
    if (!device || !path || !*path) return -1;
    QpmHid_Close(device);
    handle = CreateFileA(path, GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, NULL);
    if (handle == INVALID_HANDLE_VALUE)
        handle = CreateFileA(path, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_FLAG_OVERLAPPED, NULL);
    if (handle == INVALID_HANDLE_VALUE) return -2;
    device->handle = (intptr_t)handle;
    device->opened = 1;
    snprintf(device->path, sizeof(device->path), "%s", path);
    (void)QpmHid_LoadCaps(device, handle);
    return 0;
}

typedef struct QpmHidFindContext
{
    const wchar_t *serial;
    char path[512];
} QpmHidFindContext;

static int QpmHid_FindCallback(const QpmHidInfo *info, void *context)
{
    QpmHidFindContext *find = (QpmHidFindContext *)context;
    if (find->serial && *find->serial && wcscmp(find->serial, info->serialNumber) != 0) return 1;
    snprintf(find->path, sizeof(find->path), "%s", info->path);
    return 0;
}

int QpmHid_OpenVidPid(QpmHidDevice *device, uint16_t vendorId, uint16_t productId, const wchar_t *serialNumber)
{
    QpmHidFindContext find;
    int count;
    memset(&find, 0, sizeof(find));
    find.serial = serialNumber;
    count = QpmHid_Enumerate(vendorId, productId, QpmHid_FindCallback, &find);
    if (count <= 0 || !find.path[0]) return -2;
    return QpmHid_OpenPath(device, find.path);
}

int QpmHid_Read(QpmHidDevice *device, void *buffer, size_t capacity, int timeoutMs)
{
    HANDLE handle;
    OVERLAPPED ov;
    DWORD received = 0;
    DWORD waitRc;
    if (!device || !device->opened || !buffer || capacity == 0) return -1;
    handle = (HANDLE)device->handle;
    memset(&ov, 0, sizeof(ov));
    ov.hEvent = CreateEventA(NULL, TRUE, FALSE, NULL);
    if (!ov.hEvent) return -2;
    if (!ReadFile(handle, buffer, (DWORD)capacity, &received, &ov))
    {
        if (GetLastError() != ERROR_IO_PENDING) { CloseHandle(ov.hEvent); return -3; }
        waitRc = WaitForSingleObject(ov.hEvent, timeoutMs < 0 ? INFINITE : (DWORD)timeoutMs);
        if (waitRc == WAIT_TIMEOUT)
        {
            CancelIoEx(handle, &ov); CloseHandle(ov.hEvent); return 0;
        }
        if (waitRc != WAIT_OBJECT_0 || !GetOverlappedResult(handle, &ov, &received, FALSE)) { CloseHandle(ov.hEvent); return -3; }
    }
    CloseHandle(ov.hEvent);
    return (int)received;
}

int QpmHid_Write(QpmHidDevice *device, const void *report, size_t reportSize)
{
    DWORD written = 0;
    if (!device || !device->opened || !report || reportSize == 0) return -1;
    if (!WriteFile((HANDLE)device->handle, report, (DWORD)reportSize, &written, NULL)) return -2;
    return (int)written;
}

int QpmHid_GetFeature(QpmHidDevice *device, void *report, size_t reportSize)
{
    if (!device || !device->opened || !report || reportSize == 0) return -1;
    return HidD_GetFeature((HANDLE)device->handle, report, (ULONG)reportSize) ? (int)reportSize : -2;
}

int QpmHid_SetFeature(QpmHidDevice *device, const void *report, size_t reportSize)
{
    if (!device || !device->opened || !report || reportSize == 0) return -1;
    return HidD_SetFeature((HANDLE)device->handle, (PVOID)report, (ULONG)reportSize) ? (int)reportSize : -2;
}

#elif defined(QPM_HID_USE_HIDAPI)
int QpmHid_Enumerate(uint16_t vendorId, uint16_t productId, QpmHidEnumerateCallback callback, void *context)
{
    struct hid_device_info *list = hid_enumerate(vendorId, productId), *it = list;
    int count = 0;
    while (it)
    {
        QpmHidInfo info;
        memset(&info, 0, sizeof(info));
        snprintf(info.path, sizeof(info.path), "%s", it->path ? it->path : "");
        info.vendorId = it->vendor_id; info.productId = it->product_id; info.versionNumber = it->release_number;
        if (it->manufacturer_string) wcsncpy(info.manufacturer, it->manufacturer_string, 127);
        if (it->product_string) wcsncpy(info.product, it->product_string, 127);
        if (it->serial_number) wcsncpy(info.serialNumber, it->serial_number, 127);
        ++count;
        if (callback && callback(&info, context) == 0) break;
        it = it->next;
    }
    hid_free_enumeration(list);
    return count;
}
int QpmHid_OpenPath(QpmHidDevice *device, const char *path)
{
    hid_device *handle;
    if (!device || !path) return -1;
    QpmHid_Close(device);
    handle = hid_open_path(path);
    if (!handle) return -2;
    device->handle = (intptr_t)handle; device->opened = 1; snprintf(device->path, sizeof(device->path), "%s", path); return 0;
}
int QpmHid_OpenVidPid(QpmHidDevice *device, uint16_t vendorId, uint16_t productId, const wchar_t *serialNumber)
{
    hid_device *handle;
    if (!device) return -1;
    QpmHid_Close(device);
    handle = hid_open(vendorId, productId, serialNumber);
    if (!handle) return -2;
    device->handle = (intptr_t)handle; device->opened = 1; return 0;
}
int QpmHid_Read(QpmHidDevice *device, void *buffer, size_t capacity, int timeoutMs)
{
    int rc; if (!device || !device->opened || !buffer) return -1;
    rc = hid_read_timeout((hid_device *)device->handle, (unsigned char *)buffer, capacity, timeoutMs); return rc;
}
int QpmHid_Write(QpmHidDevice *device, const void *report, size_t reportSize)
{ return (!device || !device->opened || !report) ? -1 : hid_write((hid_device *)device->handle, (const unsigned char *)report, reportSize); }
int QpmHid_GetFeature(QpmHidDevice *device, void *report, size_t reportSize)
{ return (!device || !device->opened || !report) ? -1 : hid_get_feature_report((hid_device *)device->handle, (unsigned char *)report, reportSize); }
int QpmHid_SetFeature(QpmHidDevice *device, const void *report, size_t reportSize)
{ return (!device || !device->opened || !report) ? -1 : hid_send_feature_report((hid_device *)device->handle, (const unsigned char *)report, reportSize); }
#else
int QpmHid_Enumerate(uint16_t vendorId, uint16_t productId, QpmHidEnumerateCallback callback, void *context)
{ (void)vendorId; (void)productId; (void)callback; (void)context; return -10; }
int QpmHid_OpenPath(QpmHidDevice *device, const char *path) { (void)device; (void)path; return -10; }
int QpmHid_OpenVidPid(QpmHidDevice *device, uint16_t vendorId, uint16_t productId, const wchar_t *serialNumber)
{ (void)device; (void)vendorId; (void)productId; (void)serialNumber; return -10; }
int QpmHid_Read(QpmHidDevice *device, void *buffer, size_t capacity, int timeoutMs)
{ (void)device; (void)buffer; (void)capacity; (void)timeoutMs; return -10; }
int QpmHid_Write(QpmHidDevice *device, const void *report, size_t reportSize)
{ (void)device; (void)report; (void)reportSize; return -10; }
int QpmHid_GetFeature(QpmHidDevice *device, void *report, size_t reportSize)
{ (void)device; (void)report; (void)reportSize; return -10; }
int QpmHid_SetFeature(QpmHidDevice *device, const void *report, size_t reportSize)
{ (void)device; (void)report; (void)reportSize; return -10; }
#endif

const char *QpmHid_ResultText(int result)
{
    if (result >= 0) return "OK";
    if (result == -10) return "USB HID backend unavailable: define QPM_HID_USE_HIDAPI and link HIDAPI on this platform";
    return "USB HID operation failed";
}

#pragma once
#include "qpm_usb.h"
#include <chrono>
#include <stdexcept>
#include <string>
#include <vector>
namespace qpm { class UsbRuntime { QpmUsbRuntime r_{}; public: UsbRuntime(){QpmUsb_RuntimeInit(&r_);} ~UsbRuntime(){QpmUsb_Unload(&r_);} bool load(){return QpmUsb_Load(&r_)==0;} QpmUsbRuntime*native(){return &r_;} std::vector<QpmUsbDeviceInfo> enumerate(std::size_t max=256){std::vector<QpmUsbDeviceInfo>v(max);size_t n=0;int rc=QpmUsb_Enumerate(&r_,v.data(),v.size(),&n);if(rc<0)throw std::runtime_error(QpmUsb_LastErrorText());v.resize(n<max?n:max);return v;} }; class UsbDevice { QpmUsbDevice d_{}; public: UsbDevice(){QpmUsb_DeviceInit(&d_);} ~UsbDevice(){QpmUsb_Close(&d_);} UsbDevice(const UsbDevice&)=delete; UsbDevice&operator=(const UsbDevice&)=delete; bool open(UsbRuntime&r,uint16_t vid,uint16_t pid,const std::string&serial={}){return QpmUsb_OpenVidPid(r.native(),&d_,vid,pid,serial.empty()?nullptr:serial.c_str())==0;} void claim(int i){if(QpmUsb_ClaimInterface(&d_,i)!=0)throw std::runtime_error("USB claim failed");} int bulk(uint8_t ep,void*data,size_t n,std::chrono::milliseconds t=std::chrono::seconds(1)){return QpmUsb_BulkTransfer(&d_,ep,data,n,(int)t.count());} }; }

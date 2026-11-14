#pragma once
#include "qpm_ble_gatt.h"
#include <stdexcept>
#include <string>
#include <vector>
namespace qpm { class BleGattDevice { QpmBleGattDevice d_{}; public: BleGattDevice(){QpmBleGatt_Init(&d_);} ~BleGattDevice(){QpmBleGatt_Close(&d_);} bool open(const std::string&p){return QpmBleGatt_OpenPath(&d_,p.c_str())==0;} std::vector<QpmBleGattService> services(){std::vector<QpmBleGattService>v(64);size_t n=0;int rc=QpmBleGatt_GetServices(&d_,v.data(),v.size(),&n);if(rc<0)throw std::runtime_error(QpmBleGatt_LastErrorText());v.resize(n<v.size()?n:v.size());return v;} std::vector<QpmBleGattCharacteristic> characteristics(const QpmBleGattService&s){std::vector<QpmBleGattCharacteristic>v(128);size_t n=0;int rc=QpmBleGatt_GetCharacteristics(&d_,&s,v.data(),v.size(),&n);if(rc<0)throw std::runtime_error(QpmBleGatt_LastErrorText());v.resize(n<v.size()?n:v.size());return v;} std::vector<uint8_t> read(const QpmBleGattCharacteristic&c,size_t max=512){std::vector<uint8_t>v(max);size_t n=0;if(QpmBleGatt_Read(&d_,&c,v.data(),v.size(),&n)!=0)throw std::runtime_error(QpmBleGatt_LastErrorText());v.resize(n);return v;} }; }

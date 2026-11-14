#pragma once
#include "qpm_modbus_rs485.h"
#include <stdexcept>
#include <vector>
namespace qpm { class ModbusRs485Client { QpmModbusRs485 c_{}; public: ModbusRs485Client(QpmRs485*bus,uint8_t slave,int timeoutMs=500){QpmModbusRs485_Init(&c_,bus,slave,timeoutMs);} std::vector<uint16_t> readHolding(uint16_t a,uint16_t q){std::vector<uint16_t>v(q);size_t n=0;if(QpmModbusRs485_ReadHolding(&c_,a,q,v.data(),v.size(),&n)!=0)throw std::runtime_error("Modbus RTU read failed");v.resize(n);return v;} void write(uint16_t a,uint16_t v){if(QpmModbusRs485_WriteSingle(&c_,a,v)!=0)throw std::runtime_error("Modbus RTU write failed");} }; }

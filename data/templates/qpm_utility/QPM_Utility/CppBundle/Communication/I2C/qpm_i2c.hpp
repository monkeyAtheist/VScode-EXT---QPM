#pragma once
#include "qpm_i2c.h"
#include <cstdint>
#include <string>
#include <utility>
#include <vector>

namespace qpm
{
class I2cDevice
{
public:
    I2cDevice() { QpmI2c_Init(&bus_); }
    ~I2cDevice() { QpmI2c_Close(&bus_); }
    I2cDevice(const I2cDevice&) = delete;
    I2cDevice& operator=(const I2cDevice&) = delete;
    I2cDevice(I2cDevice&& other) noexcept : bus_(other.bus_) { QpmI2c_Init(&other.bus_); }
    I2cDevice& operator=(I2cDevice&& other) noexcept { if (this != &other) { QpmI2c_Close(&bus_); bus_ = other.bus_; QpmI2c_Init(&other.bus_); } return *this; }
    bool open(const std::string& devicePath, std::uint16_t address) { return QpmI2c_Open(&bus_, devicePath.c_str(), address) == 0; }
    void close() { QpmI2c_Close(&bus_); }
    bool setAddress(std::uint16_t address) { return QpmI2c_SetAddress(&bus_, address) == 0; }
    int write(const void* data, std::size_t size) { return QpmI2c_Write(&bus_, data, size); }
    int read(void* data, std::size_t size) { return QpmI2c_Read(&bus_, data, size); }
    bool writeRead(const void* tx, std::size_t txSize, void* rx, std::size_t rxSize) { return QpmI2c_WriteRead(&bus_, tx, txSize, rx, rxSize) == 0; }
    bool readRegister8(std::uint8_t reg, std::uint8_t& value) { return QpmI2c_ReadRegister8(&bus_, reg, &value) == 0; }
    std::vector<std::uint8_t> readRegisters(std::uint8_t start, std::size_t count) { std::vector<std::uint8_t> v(count); if (QpmI2c_ReadRegisters(&bus_, start, v.data(), v.size()) != 0) v.clear(); return v; }
private:
    QpmI2c bus_{};
};
}

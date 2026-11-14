#pragma once
#include "qpm_scpi.h"
#include <chrono>
#include <cstdint>
#include <functional>
#include <string>
#include <utility>
#include <vector>

namespace qpm
{
class ScpiClient
{
public:
    using WriteFunction = std::function<int(const void*, std::size_t)>;
    using ReadFunction = std::function<int(void*, std::size_t, int)>;
    ScpiClient(WriteFunction write, ReadFunction read) : write_(std::move(write)), read_(std::move(read)) { QpmScpi_Init(&scpi_, this, &writeThunk, &readThunk); }
    void setTerminators(const std::string& tx, const std::string& rx) { QpmScpi_SetTerminators(&scpi_, tx.c_str(), rx.c_str()); }
    void setTimeout(std::chrono::milliseconds timeout) { QpmScpi_SetTimeout(&scpi_, static_cast<int>(timeout.count())); }
    bool write(const std::string& command) { return QpmScpi_Write(&scpi_, command.c_str()) == 0; }
    std::string query(const std::string& command, std::size_t maxSize = 4096)
    { std::vector<char> buffer(maxSize + 1); const int n = QpmScpi_Query(&scpi_, command.c_str(), buffer.data(), buffer.size()); return n >= 0 ? std::string(buffer.data(), static_cast<std::size_t>(n)) : std::string{}; }
    std::string idn() { return query("*IDN?"); }
    bool clear() { return QpmScpi_Clear(&scpi_) == 0; }
    bool reset() { return QpmScpi_Reset(&scpi_) == 0; }
    bool queryDouble(const std::string& command, double& value) { return QpmScpi_QueryDouble(&scpi_, command.c_str(), &value) == 0; }
    bool queryInt(const std::string& command, long long& value) { return QpmScpi_QueryInt(&scpi_, command.c_str(), &value) == 0; }
    std::vector<std::uint8_t> queryBinaryBlock(const std::string& command, std::size_t capacity = 1024 * 1024)
    { std::vector<std::uint8_t> data(capacity); std::size_t n = 0; if (QpmScpi_QueryBinaryBlock(&scpi_, command.c_str(), data.data(), data.size(), &n) != 0) return {}; data.resize(n); return data; }
private:
    static int writeThunk(void* context, const void* data, std::size_t size) { return static_cast<ScpiClient*>(context)->write_(data, size); }
    static int readThunk(void* context, void* data, std::size_t size, int timeoutMs) { return static_cast<ScpiClient*>(context)->read_(data, size, timeoutMs); }
    WriteFunction write_; ReadFunction read_; QpmScpi scpi_{};
};
}

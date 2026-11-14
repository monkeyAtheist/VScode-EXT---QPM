#pragma once
#include "qpm_framing.h"
#include <cstdint>
#include <stdexcept>
#include <vector>

namespace qpm::framing
{
inline std::vector<std::uint8_t> cobsEncode(const void* data, std::size_t size)
{
    std::vector<std::uint8_t> out(QpmFraming_CobsMaxEncodedSize(size)); std::size_t n = 0;
    if (QpmFraming_CobsEncode(data, size, out.data(), out.size(), &n) != 0) return {};
    out.resize(n); return out;
}
inline std::vector<std::uint8_t> cobsDecode(const void* data, std::size_t size)
{
    std::vector<std::uint8_t> out(size); std::size_t n = 0;
    if (QpmFraming_CobsDecode(data, size, out.data(), out.size(), &n) != 0) return {};
    out.resize(n); return out;
}
inline std::vector<std::uint8_t> slipEncode(const void* data, std::size_t size, bool delimit = true)
{
    std::vector<std::uint8_t> out(QpmFraming_SlipMaxEncodedSize(size)); std::size_t n = 0;
    if (QpmFraming_SlipEncode(data, size, out.data(), out.size(), &n, delimit ? 1 : 0) != 0) return {};
    out.resize(n); return out;
}
inline std::vector<std::uint8_t> slipDecode(const void* data, std::size_t size)
{
    std::vector<std::uint8_t> out(size); std::size_t n = 0;
    if (QpmFraming_SlipDecode(data, size, out.data(), out.size(), &n) != 0) return {};
    out.resize(n); return out;
}
}

#pragma once
#include "qpm_checksum.h"
#include <cstdint>
#include <string_view>
#include <vector>
namespace qpm::checksum {
template<class C> inline std::uint8_t xor8(const C&c){return QpmChecksum_Xor8(c.data(),c.size());}
template<class C> inline std::uint8_t sum8(const C&c){return QpmChecksum_Sum8(c.data(),c.size());}
template<class C> inline std::uint16_t crc16Ccitt(const C&c){return QpmCrc16CcittFalse(c.data(),c.size());}
template<class C> inline std::uint16_t crc16Modbus(const C&c){return QpmCrc16Modbus(c.data(),c.size());}
template<class C> inline std::uint32_t crc32(const C&c){return QpmCrc32(c.data(),c.size());}
inline std::uint32_t crc32(std::string_view s){return QpmCrc32(s.data(),s.size());}
}

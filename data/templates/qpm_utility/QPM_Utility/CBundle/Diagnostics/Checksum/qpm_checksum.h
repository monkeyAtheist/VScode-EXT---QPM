/** @file qpm_checksum.h @brief Common checksums and CRC algorithms for byte streams. */
#ifndef QPM_CHECKSUM_H
#define QPM_CHECKSUM_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

uint8_t QpmChecksum_Xor8(const void *data, size_t size);
uint8_t QpmChecksum_Sum8(const void *data, size_t size);
uint16_t QpmChecksum_Fletcher16(const void *data, size_t size);
uint32_t QpmChecksum_Adler32(const void *data, size_t size);
uint8_t QpmCrc8(const void *data, size_t size, uint8_t polynomial, uint8_t initialValue);
uint16_t QpmCrc16CcittFalse(const void *data, size_t size);
uint16_t QpmCrc16Modbus(const void *data, size_t size);
uint32_t QpmCrc32(const void *data, size_t size);

#ifdef __cplusplus
}
#endif
#endif

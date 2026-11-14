/** @file qpm_buffer.h @brief Dynamic byte buffer, cursor reader and endian conversion helpers. */
#ifndef QPM_BUFFER_H
#define QPM_BUFFER_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmByteBuffer { unsigned char *data; size_t size; size_t capacity; } QpmByteBuffer;
typedef struct QpmByteReader { const unsigned char *data; size_t size; size_t offset; } QpmByteReader;

uint16_t QpmEndian_ReadU16LE(const void *data);
uint16_t QpmEndian_ReadU16BE(const void *data);
uint32_t QpmEndian_ReadU32LE(const void *data);
uint32_t QpmEndian_ReadU32BE(const void *data);
uint64_t QpmEndian_ReadU64LE(const void *data);
uint64_t QpmEndian_ReadU64BE(const void *data);
void QpmEndian_WriteU16LE(void *data, uint16_t value);
void QpmEndian_WriteU16BE(void *data, uint16_t value);
void QpmEndian_WriteU32LE(void *data, uint32_t value);
void QpmEndian_WriteU32BE(void *data, uint32_t value);
void QpmEndian_WriteU64LE(void *data, uint64_t value);
void QpmEndian_WriteU64BE(void *data, uint64_t value);

void QpmByteBuffer_Init(QpmByteBuffer *buffer);
void QpmByteBuffer_Free(QpmByteBuffer *buffer);
void QpmByteBuffer_Clear(QpmByteBuffer *buffer);
int QpmByteBuffer_Reserve(QpmByteBuffer *buffer, size_t capacity);
int QpmByteBuffer_Append(QpmByteBuffer *buffer, const void *data, size_t size);
int QpmByteBuffer_AppendU8(QpmByteBuffer *buffer, uint8_t value);
int QpmByteBuffer_AppendU16LE(QpmByteBuffer *buffer, uint16_t value);
int QpmByteBuffer_AppendU16BE(QpmByteBuffer *buffer, uint16_t value);
int QpmByteBuffer_AppendU32LE(QpmByteBuffer *buffer, uint32_t value);
int QpmByteBuffer_AppendU32BE(QpmByteBuffer *buffer, uint32_t value);

void QpmByteReader_Init(QpmByteReader *reader, const void *data, size_t size);
size_t QpmByteReader_Remaining(const QpmByteReader *reader);
int QpmByteReader_Read(QpmByteReader *reader, void *output, size_t size);
int QpmByteReader_ReadU8(QpmByteReader *reader, uint8_t *value);
int QpmByteReader_ReadU16LE(QpmByteReader *reader, uint16_t *value);
int QpmByteReader_ReadU16BE(QpmByteReader *reader, uint16_t *value);
int QpmByteReader_ReadU32LE(QpmByteReader *reader, uint32_t *value);
int QpmByteReader_ReadU32BE(QpmByteReader *reader, uint32_t *value);

int QpmHex_Encode(const void *data, size_t size, char *output, size_t outputSize, int uppercase, char separator);
int QpmHex_Decode(const char *text, unsigned char *output, size_t outputCapacity, size_t *outputSize);

#ifdef __cplusplus
}
#endif
#endif

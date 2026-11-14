#ifndef QPM_FRAMING_H
#define QPM_FRAMING_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

size_t QpmFraming_CobsMaxEncodedSize(size_t inputSize);
int QpmFraming_CobsEncode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize);
int QpmFraming_CobsDecode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize);

size_t QpmFraming_SlipMaxEncodedSize(size_t inputSize);
int QpmFraming_SlipEncode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize, int includeEndBytes);
int QpmFraming_SlipDecode(const void *input, size_t inputSize, void *output, size_t outputCapacity, size_t *outputSize);

int QpmFraming_EncodeLength16BE(const void *payload, size_t payloadSize, void *output, size_t outputCapacity, size_t *outputSize);
int QpmFraming_DecodeLength16BE(const void *frame, size_t frameSize, const uint8_t **payload, size_t *payloadSize);
int QpmFraming_EncodeLength32BE(const void *payload, size_t payloadSize, void *output, size_t outputCapacity, size_t *outputSize);
int QpmFraming_DecodeLength32BE(const void *frame, size_t frameSize, const uint8_t **payload, size_t *payloadSize);

int QpmFraming_FindDelimiter(const void *data, size_t dataSize, const void *delimiter, size_t delimiterSize, size_t *position);

#ifdef __cplusplus
}
#endif
#endif

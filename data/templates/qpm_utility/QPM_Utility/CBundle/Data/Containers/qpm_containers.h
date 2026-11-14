/** @file qpm_containers.h @brief Generic vector and ring-buffer containers for C. */
#ifndef QPM_CONTAINERS_H
#define QPM_CONTAINERS_H
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmVector {
    unsigned char *data;
    size_t count;
    size_t capacity;
    size_t elementSize;
} QpmVector;

typedef struct QpmRingBuffer {
    unsigned char *data;
    size_t capacity;
    size_t count;
    size_t head;
    size_t tail;
    size_t elementSize;
} QpmRingBuffer;

int QpmVector_Init(QpmVector *vector, size_t elementSize);
void QpmVector_Free(QpmVector *vector);
void QpmVector_Clear(QpmVector *vector);
int QpmVector_Reserve(QpmVector *vector, size_t capacity);
int QpmVector_Push(QpmVector *vector, const void *element);
int QpmVector_Insert(QpmVector *vector, size_t index, const void *element);
int QpmVector_Remove(QpmVector *vector, size_t index);
void *QpmVector_At(QpmVector *vector, size_t index);
const void *QpmVector_AtConst(const QpmVector *vector, size_t index);

int QpmRingBuffer_Init(QpmRingBuffer *ring, size_t elementSize, size_t capacity);
void QpmRingBuffer_Free(QpmRingBuffer *ring);
void QpmRingBuffer_Clear(QpmRingBuffer *ring);
int QpmRingBuffer_Push(QpmRingBuffer *ring, const void *element, int overwriteOldest);
int QpmRingBuffer_Pop(QpmRingBuffer *ring, void *element);
int QpmRingBuffer_Peek(const QpmRingBuffer *ring, size_t index, void *element);

#ifdef __cplusplus
}
#endif
#endif

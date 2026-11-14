#ifndef QPM_SCPI_H
#define QPM_SCPI_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef int (*QpmScpiWriteFn)(void *context, const void *data, size_t size);
typedef int (*QpmScpiReadFn)(void *context, void *data, size_t size, int timeoutMs);

typedef struct QpmScpi
{
    void *context;
    QpmScpiWriteFn writeFn;
    QpmScpiReadFn readFn;
    char txTerminator[4];
    char rxTerminator[4];
    int timeoutMs;
} QpmScpi;

void QpmScpi_Init(QpmScpi *scpi, void *context, QpmScpiWriteFn writeFn, QpmScpiReadFn readFn);
void QpmScpi_SetTerminators(QpmScpi *scpi, const char *txTerminator, const char *rxTerminator);
void QpmScpi_SetTimeout(QpmScpi *scpi, int timeoutMs);
int QpmScpi_Write(QpmScpi *scpi, const char *command);
int QpmScpi_Query(QpmScpi *scpi, const char *command, char *response, size_t responseSize);
int QpmScpi_QueryInt(QpmScpi *scpi, const char *command, long long *value);
int QpmScpi_QueryDouble(QpmScpi *scpi, const char *command, double *value);
int QpmScpi_QueryBool(QpmScpi *scpi, const char *command, int *value);
int QpmScpi_QueryBinaryBlock(QpmScpi *scpi, const char *command, void *data, size_t capacity, size_t *dataSize);

int QpmScpi_Idn(QpmScpi *scpi, char *response, size_t responseSize);
int QpmScpi_Clear(QpmScpi *scpi);
int QpmScpi_Reset(QpmScpi *scpi);
int QpmScpi_Opc(QpmScpi *scpi, int *complete);
int QpmScpi_SystemError(QpmScpi *scpi, char *response, size_t responseSize);

#ifdef __cplusplus
}
#endif
#endif

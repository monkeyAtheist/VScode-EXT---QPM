/** @file qpm_csv.h @brief Lightweight CSV reader/writer with quoted-field support. */
#ifndef QPM_CSV_H
#define QPM_CSV_H
#include <stddef.h>
#include <stdio.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmCsvRow { char **fields; size_t count; } QpmCsvRow;
typedef int (*QpmCsvRowCallback)(const QpmCsvRow *row, size_t rowIndex, void *userData);

int QpmCsv_ParseLine(const char *line, char delimiter, QpmCsvRow *row);
void QpmCsv_FreeRow(QpmCsvRow *row);
int QpmCsv_ReadFile(const char *path, char delimiter, QpmCsvRowCallback callback, void *userData);
int QpmCsv_WriteField(FILE *file, const char *value, char delimiter);
int QpmCsv_WriteRow(FILE *file, const char *const *fields, size_t fieldCount, char delimiter);
int QpmCsv_AppendRow(const char *path, const char *const *fields, size_t fieldCount, char delimiter);

#ifdef __cplusplus
}
#endif
#endif

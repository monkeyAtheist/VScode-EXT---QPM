/** @file qpm_string.h @brief Safe string helpers and a dynamic string builder. */
#ifndef QPM_STRING_H
#define QPM_STRING_H
#include <stddef.h>
#include <stdarg.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmStringBuilder {
    char *data;
    size_t length;
    size_t capacity;
} QpmStringBuilder;

int QpmString_Copy(char *dst, size_t dstSize, const char *src);
int QpmString_Append(char *dst, size_t dstSize, const char *src);
char *QpmString_Trim(char *text);
void QpmString_ToLower(char *text);
void QpmString_ToUpper(char *text);
int QpmString_EqualsIgnoreCase(const char *a, const char *b);
int QpmString_StartsWith(const char *text, const char *prefix, int ignoreCase);
int QpmString_EndsWith(const char *text, const char *suffix, int ignoreCase);
int QpmString_Contains(const char *text, const char *needle, int ignoreCase);
size_t QpmString_ReplaceAll(char *dst, size_t dstSize, const char *src, const char *needle, const char *replacement);
size_t QpmString_Split(char *text, char delimiter, char **parts, size_t maxParts, int keepEmpty);

void QpmStringBuilder_Init(QpmStringBuilder *builder);
void QpmStringBuilder_Free(QpmStringBuilder *builder);
int QpmStringBuilder_Reserve(QpmStringBuilder *builder, size_t capacity);
int QpmStringBuilder_Append(QpmStringBuilder *builder, const char *text);
int QpmStringBuilder_AppendN(QpmStringBuilder *builder, const char *text, size_t length);
int QpmStringBuilder_AppendChar(QpmStringBuilder *builder, char ch);
int QpmStringBuilder_AppendFormat(QpmStringBuilder *builder, const char *format, ...);
int QpmStringBuilder_AppendFormatV(QpmStringBuilder *builder, const char *format, va_list args);
char *QpmStringBuilder_Detach(QpmStringBuilder *builder);

#ifdef __cplusplus
}
#endif
#endif

/** @file qpm_log.h @brief Lightweight configurable logging for C applications. */
#ifndef QPM_LOG_H
#define QPM_LOG_H
#include <stddef.h>
#include <stdarg.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmLogLevel {
    QPM_LOG_TRACE = 0,
    QPM_LOG_DEBUG,
    QPM_LOG_INFO,
    QPM_LOG_WARN,
    QPM_LOG_ERROR,
    QPM_LOG_FATAL,
    QPM_LOG_OFF
} QpmLogLevel;

typedef void (*QpmLogCallback)(QpmLogLevel level, const char *formattedLine, void *userData);

void QpmLog_Init(void);
void QpmLog_Shutdown(void);
void QpmLog_SetLevel(QpmLogLevel level);
QpmLogLevel QpmLog_GetLevel(void);
void QpmLog_EnableConsole(int enabled);
int QpmLog_SetFile(const char *path, int append);
void QpmLog_CloseFile(void);
void QpmLog_SetCallback(QpmLogCallback callback, void *userData);
void QpmLog_Write(QpmLogLevel level, const char *format, ...);
void QpmLog_WriteV(QpmLogLevel level, const char *format, va_list args);
void QpmLog_Hex(QpmLogLevel level, const char *label, const void *data, size_t size, size_t bytesPerLine);
const char *QpmLog_LevelName(QpmLogLevel level);

#define QPM_LOG_T(...) QpmLog_Write(QPM_LOG_TRACE, __VA_ARGS__)
#define QPM_LOG_D(...) QpmLog_Write(QPM_LOG_DEBUG, __VA_ARGS__)
#define QPM_LOG_I(...) QpmLog_Write(QPM_LOG_INFO, __VA_ARGS__)
#define QPM_LOG_W(...) QpmLog_Write(QPM_LOG_WARN, __VA_ARGS__)
#define QPM_LOG_E(...) QpmLog_Write(QPM_LOG_ERROR, __VA_ARGS__)
#define QPM_LOG_F(...) QpmLog_Write(QPM_LOG_FATAL, __VA_ARGS__)

#ifdef __cplusplus
}
#endif
#endif

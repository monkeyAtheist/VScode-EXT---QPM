/** @file qpm_process.h @brief Small cross-platform process/shell helpers. */
#ifndef QPM_PROCESS_H
#define QPM_PROCESS_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

int QpmProcess_Run(const char *commandLine, int *exitCode);
int QpmProcess_RunCapture(const char *commandLine, char **output, size_t *outputSize, int *exitCode);
int QpmProcess_StartDetached(const char *commandLine);
uint64_t QpmProcess_CurrentId(void);
int QpmProcess_GetEnv(const char *name, char *value, size_t valueSize);
int QpmProcess_SetEnv(const char *name, const char *value);

#ifdef __cplusplus
}
#endif
#endif

/**
 * @file qpm_file.h
 * @brief Cross-platform file and path helpers for QPM C projects.
 */
#ifndef QPM_FILE_H
#define QPM_FILE_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmFileStatus {
    QPM_FILE_OK = 0,
    QPM_FILE_NOT_FOUND = 1,
    QPM_FILE_ERR_ARGUMENT = -1,
    QPM_FILE_ERR_IO = -2,
    QPM_FILE_ERR_MEMORY = -3,
    QPM_FILE_ERR_RANGE = -4
} QpmFileStatus;

int QpmFile_Exists(const char *path);
int QpmFile_IsDirectory(const char *path);
int QpmFile_Size(const char *path, uint64_t *size);
int QpmFile_ReadAllBinary(const char *path, unsigned char **data, size_t *size);
int QpmFile_ReadAllText(const char *path, char **text, size_t *size);
int QpmFile_WriteAllBinary(const char *path, const void *data, size_t size);
int QpmFile_WriteAllText(const char *path, const char *text);
int QpmFile_AppendText(const char *path, const char *text);
int QpmFile_CreateDirectories(const char *path);
int QpmFile_Remove(const char *path);
int QpmFile_Rename(const char *fromPath, const char *toPath);

int QpmPath_Join(char *output, size_t outputSize, const char *left, const char *right);
int QpmPath_DirName(const char *path, char *output, size_t outputSize);
int QpmPath_BaseName(const char *path, char *output, size_t outputSize);
int QpmPath_Extension(const char *path, char *output, size_t outputSize);
int QpmPath_NormalizeSeparators(char *path);
int QpmPath_GetExecutablePath(char *output, size_t outputSize);
int QpmPath_GetExecutableDirectory(char *output, size_t outputSize);

const char *QpmFile_StatusString(int status);

#ifdef __cplusplus
}
#endif
#endif /* QPM_FILE_H */

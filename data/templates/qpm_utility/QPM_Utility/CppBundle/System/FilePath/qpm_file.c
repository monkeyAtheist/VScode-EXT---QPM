#if !defined(_WIN32)
#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#endif
#include "qpm_file.h"

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

#if defined(_WIN32)
#include <direct.h>
#include <windows.h>
#define QPM_MKDIR(path) _mkdir(path)
#define QPM_PATH_SEP '\\'
#else
#include <limits.h>
#include <unistd.h>
#define QPM_MKDIR(path) mkdir((path), 0777)
#define QPM_PATH_SEP '/'
#endif

static int qpm_copy(char *output, size_t outputSize, const char *text)
{
    size_t length;
    if (output == NULL || outputSize == 0 || text == NULL) return QPM_FILE_ERR_ARGUMENT;
    length = strlen(text);
    if (length + 1 > outputSize) return QPM_FILE_ERR_RANGE;
    memcpy(output, text, length + 1);
    return QPM_FILE_OK;
}

static int qpm_is_sep(char ch)
{
    return ch == '/' || ch == '\\';
}

int QpmFile_Exists(const char *path)
{
    struct stat info;
    return path != NULL && stat(path, &info) == 0;
}

int QpmFile_IsDirectory(const char *path)
{
    struct stat info;
    if (path == NULL || stat(path, &info) != 0) return 0;
#if defined(_WIN32)
    return (info.st_mode & _S_IFDIR) != 0;
#else
    return S_ISDIR(info.st_mode);
#endif
}

int QpmFile_Size(const char *path, uint64_t *size)
{
    struct stat info;
    if (path == NULL || size == NULL) return QPM_FILE_ERR_ARGUMENT;
    if (stat(path, &info) != 0) return errno == ENOENT ? QPM_FILE_NOT_FOUND : QPM_FILE_ERR_IO;
    if (info.st_size < 0) return QPM_FILE_ERR_IO;
    *size = (uint64_t)info.st_size;
    return QPM_FILE_OK;
}

int QpmFile_ReadAllBinary(const char *path, unsigned char **data, size_t *size)
{
    FILE *file;
    long length;
    unsigned char *buffer;
    size_t readCount;
    if (path == NULL || data == NULL || size == NULL) return QPM_FILE_ERR_ARGUMENT;
    *data = NULL;
    *size = 0;
    file = fopen(path, "rb");
    if (file == NULL) return errno == ENOENT ? QPM_FILE_NOT_FOUND : QPM_FILE_ERR_IO;
    if (fseek(file, 0, SEEK_END) != 0 || (length = ftell(file)) < 0 || fseek(file, 0, SEEK_SET) != 0) {
        fclose(file);
        return QPM_FILE_ERR_IO;
    }
    if ((unsigned long)length > (size_t)-1) {
        fclose(file);
        return QPM_FILE_ERR_RANGE;
    }
    buffer = (unsigned char *)malloc((size_t)length + 1u);
    if (buffer == NULL) {
        fclose(file);
        return QPM_FILE_ERR_MEMORY;
    }
    readCount = fread(buffer, 1, (size_t)length, file);
    if (readCount != (size_t)length && ferror(file)) {
        free(buffer);
        fclose(file);
        return QPM_FILE_ERR_IO;
    }
    fclose(file);
    buffer[readCount] = 0;
    *data = buffer;
    *size = readCount;
    return QPM_FILE_OK;
}

int QpmFile_ReadAllText(const char *path, char **text, size_t *size)
{
    unsigned char *data = NULL;
    int status;
    if (text == NULL) return QPM_FILE_ERR_ARGUMENT;
    status = QpmFile_ReadAllBinary(path, &data, size);
    if (status != QPM_FILE_OK) return status;
    *text = (char *)data;
    return QPM_FILE_OK;
}

int QpmFile_WriteAllBinary(const char *path, const void *data, size_t size)
{
    FILE *file;
    if (path == NULL || (data == NULL && size != 0)) return QPM_FILE_ERR_ARGUMENT;
    file = fopen(path, "wb");
    if (file == NULL) return QPM_FILE_ERR_IO;
    if (size != 0 && fwrite(data, 1, size, file) != size) {
        fclose(file);
        return QPM_FILE_ERR_IO;
    }
    if (fclose(file) != 0) return QPM_FILE_ERR_IO;
    return QPM_FILE_OK;
}

int QpmFile_WriteAllText(const char *path, const char *text)
{
    if (text == NULL) return QPM_FILE_ERR_ARGUMENT;
    return QpmFile_WriteAllBinary(path, text, strlen(text));
}

int QpmFile_AppendText(const char *path, const char *text)
{
    FILE *file;
    size_t size;
    if (path == NULL || text == NULL) return QPM_FILE_ERR_ARGUMENT;
    file = fopen(path, "ab");
    if (file == NULL) return QPM_FILE_ERR_IO;
    size = strlen(text);
    if (size != 0 && fwrite(text, 1, size, file) != size) {
        fclose(file);
        return QPM_FILE_ERR_IO;
    }
    if (fclose(file) != 0) return QPM_FILE_ERR_IO;
    return QPM_FILE_OK;
}

int QpmPath_NormalizeSeparators(char *path)
{
    char *cursor;
    if (path == NULL) return QPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) {
        if (qpm_is_sep(*cursor)) *cursor = QPM_PATH_SEP;
    }
    return QPM_FILE_OK;
}

int QpmFile_CreateDirectories(const char *path)
{
    char *copy;
    size_t length;
    size_t i;
    if (path == NULL || *path == '\0') return QPM_FILE_ERR_ARGUMENT;
    length = strlen(path);
    copy = (char *)malloc(length + 1u);
    if (copy == NULL) return QPM_FILE_ERR_MEMORY;
    memcpy(copy, path, length + 1u);
    QpmPath_NormalizeSeparators(copy);
    while (length > 1 && qpm_is_sep(copy[length - 1])) copy[--length] = '\0';
    for (i = 1; i <= length; ++i) {
        if (i == length || qpm_is_sep(copy[i])) {
            char saved = copy[i];
            copy[i] = '\0';
#if defined(_WIN32)
            if (i == 2 && copy[1] == ':') { copy[i] = saved; continue; }
#endif
            if (*copy != '\0' && !QpmFile_IsDirectory(copy)) {
                if (QPM_MKDIR(copy) != 0 && errno != EEXIST) {
                    free(copy);
                    return QPM_FILE_ERR_IO;
                }
            }
            copy[i] = saved;
        }
    }
    free(copy);
    return QPM_FILE_OK;
}

int QpmFile_Remove(const char *path)
{
    if (path == NULL) return QPM_FILE_ERR_ARGUMENT;
    if (remove(path) == 0) return QPM_FILE_OK;
    return errno == ENOENT ? QPM_FILE_NOT_FOUND : QPM_FILE_ERR_IO;
}

int QpmFile_Rename(const char *fromPath, const char *toPath)
{
    if (fromPath == NULL || toPath == NULL) return QPM_FILE_ERR_ARGUMENT;
    return rename(fromPath, toPath) == 0 ? QPM_FILE_OK : QPM_FILE_ERR_IO;
}

int QpmPath_Join(char *output, size_t outputSize, const char *left, const char *right)
{
    size_t leftLength;
    size_t rightOffset = 0;
    size_t needed;
    int addSeparator;
    if (output == NULL || outputSize == 0 || left == NULL || right == NULL) return QPM_FILE_ERR_ARGUMENT;
    leftLength = strlen(left);
    while (right[rightOffset] != '\0' && qpm_is_sep(right[rightOffset])) ++rightOffset;
    addSeparator = leftLength != 0 && !qpm_is_sep(left[leftLength - 1]) && right[rightOffset] != '\0';
    needed = leftLength + (size_t)addSeparator + strlen(right + rightOffset) + 1u;
    if (needed > outputSize) return QPM_FILE_ERR_RANGE;
    memcpy(output, left, leftLength);
    if (addSeparator) output[leftLength++] = QPM_PATH_SEP;
    strcpy(output + leftLength, right + rightOffset);
    QpmPath_NormalizeSeparators(output);
    return QPM_FILE_OK;
}

int QpmPath_DirName(const char *path, char *output, size_t outputSize)
{
    const char *last = NULL;
    const char *cursor;
    size_t length;
    if (path == NULL || output == NULL || outputSize == 0) return QPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) if (qpm_is_sep(*cursor)) last = cursor;
    if (last == NULL) return qpm_copy(output, outputSize, ".");
    length = (size_t)(last - path);
    if (length == 0) length = 1;
    if (length + 1 > outputSize) return QPM_FILE_ERR_RANGE;
    memcpy(output, path, length);
    output[length] = '\0';
    return QPM_FILE_OK;
}

int QpmPath_BaseName(const char *path, char *output, size_t outputSize)
{
    const char *base = path;
    const char *cursor;
    if (path == NULL) return QPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) if (qpm_is_sep(*cursor)) base = cursor + 1;
    return qpm_copy(output, outputSize, base);
}

int QpmPath_Extension(const char *path, char *output, size_t outputSize)
{
    const char *base = path;
    const char *dot = NULL;
    const char *cursor;
    if (path == NULL) return QPM_FILE_ERR_ARGUMENT;
    for (cursor = path; *cursor != '\0'; ++cursor) {
        if (qpm_is_sep(*cursor)) { base = cursor + 1; dot = NULL; }
        else if (*cursor == '.') dot = cursor;
    }
    if (dot == NULL || dot == base) return qpm_copy(output, outputSize, "");
    return qpm_copy(output, outputSize, dot);
}

int QpmPath_GetExecutablePath(char *output, size_t outputSize)
{
    if (output == NULL || outputSize == 0) return QPM_FILE_ERR_ARGUMENT;
#if defined(_WIN32)
    {
        DWORD length = GetModuleFileNameA(NULL, output, (DWORD)outputSize);
        if (length == 0) return QPM_FILE_ERR_IO;
        if ((size_t)length >= outputSize) return QPM_FILE_ERR_RANGE;
        return QPM_FILE_OK;
    }
#else
    {
        ssize_t length = readlink("/proc/self/exe", output, outputSize - 1u);
        if (length < 0) return QPM_FILE_ERR_IO;
        if ((size_t)length >= outputSize - 1u) return QPM_FILE_ERR_RANGE;
        output[length] = '\0';
        return QPM_FILE_OK;
    }
#endif
}

int QpmPath_GetExecutableDirectory(char *output, size_t outputSize)
{
    char path[4096];
    int status = QpmPath_GetExecutablePath(path, sizeof(path));
    if (status != QPM_FILE_OK) return status;
    return QpmPath_DirName(path, output, outputSize);
}

const char *QpmFile_StatusString(int status)
{
    switch (status) {
        case QPM_FILE_OK: return "ok";
        case QPM_FILE_NOT_FOUND: return "not found";
        case QPM_FILE_ERR_ARGUMENT: return "invalid argument";
        case QPM_FILE_ERR_IO: return "I/O error";
        case QPM_FILE_ERR_MEMORY: return "out of memory";
        case QPM_FILE_ERR_RANGE: return "buffer/range error";
        default: return "unknown error";
    }
}

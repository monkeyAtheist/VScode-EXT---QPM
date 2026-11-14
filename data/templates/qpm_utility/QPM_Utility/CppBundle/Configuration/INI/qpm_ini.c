/**
 * @file qpm_ini.c
 * @brief Implementation of the QPM dependency-free INI bundle.
 */
#include "qpm_ini.h"

#include <ctype.h>
#include <errno.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef QPM_INI_LINE_SIZE
#define QPM_INI_LINE_SIZE 4096
#endif

static char *QpmIni_StrDup(const char *text)
{
    size_t length;
    char *copy;

    if (text == NULL)
        text = "";
    length = strlen(text);
    copy = (char *)malloc(length + 1);
    if (copy == NULL)
        return NULL;
    memcpy(copy, text, length + 1);
    return copy;
}

static int QpmIni_CharEqual(char a, char b, int caseSensitive)
{
    if (caseSensitive)
        return a == b;
    return tolower((unsigned char)a) == tolower((unsigned char)b);
}

static int QpmIni_TextEqual(const char *a, const char *b, int caseSensitive)
{
    if (a == NULL || b == NULL)
        return a == b;
    while (*a != '\0' && *b != '\0')
    {
        if (!QpmIni_CharEqual(*a, *b, caseSensitive))
            return 0;
        ++a;
        ++b;
    }
    return *a == '\0' && *b == '\0';
}

static char *QpmIni_Trim(char *text)
{
    char *end;
    if (text == NULL)
        return NULL;
    while (*text != '\0' && isspace((unsigned char)*text))
        ++text;
    end = text + strlen(text);
    while (end > text && isspace((unsigned char)end[-1]))
        --end;
    *end = '\0';
    return text;
}

static int QpmIni_Copy(char *dst, size_t dstSize, const char *src)
{
    size_t length;
    if (dst == NULL || dstSize == 0)
        return QPM_INI_ERR_ARGUMENT;
    if (src == NULL)
        src = "";
    length = strlen(src);
    if (length >= dstSize)
    {
        memcpy(dst, src, dstSize - 1);
        dst[dstSize - 1] = '\0';
        return QPM_INI_ERR_RANGE;
    }
    memcpy(dst, src, length + 1);
    return QPM_INI_OK;
}

static void QpmIni_FreeSection(QpmIniSection *section)
{
    size_t i;
    if (section == NULL)
        return;
    for (i = 0; i < section->entryCount; ++i)
    {
        free(section->entries[i].key);
        free(section->entries[i].value);
    }
    free(section->entries);
    free(section->name);
    memset(section, 0, sizeof(*section));
}

void QpmIni_Init(QpmIniDocument *document)
{
    if (document == NULL)
        return;
    memset(document, 0, sizeof(*document));
}

void QpmIni_Free(QpmIniDocument *document)
{
    size_t i;
    int caseSensitive;
    if (document == NULL)
        return;
    caseSensitive = document->caseSensitive;
    for (i = 0; i < document->sectionCount; ++i)
        QpmIni_FreeSection(&document->sections[i]);
    free(document->sections);
    memset(document, 0, sizeof(*document));
    document->caseSensitive = caseSensitive;
}

void QpmIni_SetCaseSensitive(QpmIniDocument *document, int enabled)
{
    if (document != NULL)
        document->caseSensitive = enabled ? 1 : 0;
}

static QpmIniSection *QpmIni_FindSectionMutable(QpmIniDocument *document, const char *name)
{
    size_t i;
    const char *resolved = name != NULL ? name : "";
    if (document == NULL)
        return NULL;
    for (i = 0; i < document->sectionCount; ++i)
    {
        if (QpmIni_TextEqual(document->sections[i].name, resolved, document->caseSensitive))
            return &document->sections[i];
    }
    return NULL;
}

static const QpmIniSection *QpmIni_FindSection(const QpmIniDocument *document, const char *name)
{
    size_t i;
    const char *resolved = name != NULL ? name : "";
    if (document == NULL)
        return NULL;
    for (i = 0; i < document->sectionCount; ++i)
    {
        if (QpmIni_TextEqual(document->sections[i].name, resolved, document->caseSensitive))
            return &document->sections[i];
    }
    return NULL;
}

static QpmIniEntry *QpmIni_FindEntryMutable(QpmIniDocument *document, QpmIniSection *section, const char *key)
{
    size_t i;
    if (document == NULL || section == NULL || key == NULL)
        return NULL;
    for (i = 0; i < section->entryCount; ++i)
    {
        if (QpmIni_TextEqual(section->entries[i].key, key, document->caseSensitive))
            return &section->entries[i];
    }
    return NULL;
}

static const QpmIniEntry *QpmIni_FindEntry(const QpmIniDocument *document, const QpmIniSection *section, const char *key)
{
    size_t i;
    if (document == NULL || section == NULL || key == NULL)
        return NULL;
    for (i = 0; i < section->entryCount; ++i)
    {
        if (QpmIni_TextEqual(section->entries[i].key, key, document->caseSensitive))
            return &section->entries[i];
    }
    return NULL;
}

static int QpmIni_GrowSections(QpmIniDocument *document)
{
    size_t newCapacity;
    QpmIniSection *next;
    if (document->sectionCount < document->sectionCapacity)
        return QPM_INI_OK;
    newCapacity = document->sectionCapacity == 0 ? 4 : document->sectionCapacity * 2;
    next = (QpmIniSection *)realloc(document->sections, newCapacity * sizeof(*next));
    if (next == NULL)
        return QPM_INI_ERR_MEMORY;
    memset(next + document->sectionCapacity, 0, (newCapacity - document->sectionCapacity) * sizeof(*next));
    document->sections = next;
    document->sectionCapacity = newCapacity;
    return QPM_INI_OK;
}

static int QpmIni_GrowEntries(QpmIniSection *section)
{
    size_t newCapacity;
    QpmIniEntry *next;
    if (section->entryCount < section->entryCapacity)
        return QPM_INI_OK;
    newCapacity = section->entryCapacity == 0 ? 8 : section->entryCapacity * 2;
    next = (QpmIniEntry *)realloc(section->entries, newCapacity * sizeof(*next));
    if (next == NULL)
        return QPM_INI_ERR_MEMORY;
    memset(next + section->entryCapacity, 0, (newCapacity - section->entryCapacity) * sizeof(*next));
    section->entries = next;
    section->entryCapacity = newCapacity;
    return QPM_INI_OK;
}

static QpmIniSection *QpmIni_EnsureSection(QpmIniDocument *document, const char *name, int *status)
{
    QpmIniSection *section;
    const char *resolved = name != NULL ? name : "";
    int result;

    section = QpmIni_FindSectionMutable(document, resolved);
    if (section != NULL)
    {
        if (status != NULL)
            *status = QPM_INI_OK;
        return section;
    }

    result = QpmIni_GrowSections(document);
    if (result != QPM_INI_OK)
    {
        if (status != NULL)
            *status = result;
        return NULL;
    }

    section = &document->sections[document->sectionCount];
    section->name = QpmIni_StrDup(resolved);
    if (section->name == NULL)
    {
        if (status != NULL)
            *status = QPM_INI_ERR_MEMORY;
        return NULL;
    }
    ++document->sectionCount;
    if (status != NULL)
        *status = QPM_INI_OK;
    return section;
}

int QpmIni_SetString(QpmIniDocument *document, const char *sectionName, const char *key, const char *value)
{
    QpmIniSection *section;
    QpmIniEntry *entry;
    char *copy;
    int status;

    if (document == NULL || key == NULL || key[0] == '\0' || value == NULL)
        return QPM_INI_ERR_ARGUMENT;

    section = QpmIni_EnsureSection(document, sectionName, &status);
    if (section == NULL)
        return status;

    entry = QpmIni_FindEntryMutable(document, section, key);
    copy = QpmIni_StrDup(value);
    if (copy == NULL)
        return QPM_INI_ERR_MEMORY;

    if (entry != NULL)
    {
        free(entry->value);
        entry->value = copy;
        return QPM_INI_OK;
    }

    status = QpmIni_GrowEntries(section);
    if (status != QPM_INI_OK)
    {
        free(copy);
        return status;
    }

    entry = &section->entries[section->entryCount];
    entry->key = QpmIni_StrDup(key);
    if (entry->key == NULL)
    {
        free(copy);
        return QPM_INI_ERR_MEMORY;
    }
    entry->value = copy;
    ++section->entryCount;
    return QPM_INI_OK;
}

static void QpmIni_UnquoteInPlace(char *value)
{
    size_t length;
    size_t readIndex;
    size_t writeIndex;
    char quote;

    if (value == NULL)
        return;
    length = strlen(value);
    if (length < 2 || !((value[0] == '"' && value[length - 1] == '"') || (value[0] == '\'' && value[length - 1] == '\'')))
        return;

    quote = value[0];
    writeIndex = 0;
    for (readIndex = 1; readIndex + 1 < length; ++readIndex)
    {
        char ch = value[readIndex];
        if (quote == '"' && ch == '\\' && readIndex + 2 < length)
        {
            char next = value[++readIndex];
            switch (next)
            {
                case 'n': ch = '\n'; break;
                case 'r': ch = '\r'; break;
                case 't': ch = '\t'; break;
                case '\\': ch = '\\'; break;
                case '"': ch = '"'; break;
                default:
                    value[writeIndex++] = '\\';
                    ch = next;
                    break;
            }
        }
        value[writeIndex++] = ch;
    }
    value[writeIndex] = '\0';
}

int QpmIni_Load(QpmIniDocument *document, const char *path)
{
    FILE *file;
    char line[QPM_INI_LINE_SIZE];
    char currentSection[512] = "";
    int firstLine = 1;
    int result = QPM_INI_OK;
    int caseSensitive;

    if (document == NULL || path == NULL || path[0] == '\0')
        return QPM_INI_ERR_ARGUMENT;

    file = fopen(path, "rb");
    if (file == NULL)
        return QPM_INI_ERR_IO;

    caseSensitive = document->caseSensitive;
    QpmIni_Free(document);
    QpmIni_Init(document);
    document->caseSensitive = caseSensitive;

    while (fgets(line, sizeof(line), file) != NULL)
    {
        char *cursor;
        char *separator;
        size_t length = strlen(line);

        if (length == sizeof(line) - 1 && line[length - 1] != '\n' && !feof(file))
        {
            result = QPM_INI_ERR_RANGE;
            break;
        }

        if (firstLine)
        {
            unsigned char *bytes = (unsigned char *)line;
            if (length >= 3 && bytes[0] == 0xEF && bytes[1] == 0xBB && bytes[2] == 0xBF)
                memmove(line, line + 3, length - 2);
            firstLine = 0;
        }

        cursor = QpmIni_Trim(line);
        if (cursor[0] == '\0' || cursor[0] == ';' || cursor[0] == '#')
            continue;

        if (cursor[0] == '[')
        {
            char *closing = strchr(cursor + 1, ']');
            char *name;
            if (closing == NULL)
            {
                result = QPM_INI_ERR_PARSE;
                break;
            }
            *closing = '\0';
            name = QpmIni_Trim(cursor + 1);
            if (name[0] == '\0' || strlen(name) >= sizeof(currentSection))
            {
                result = QPM_INI_ERR_PARSE;
                break;
            }
            strcpy(currentSection, name);
            continue;
        }

        separator = strchr(cursor, '=');
        if (separator == NULL)
        {
            result = QPM_INI_ERR_PARSE;
            break;
        }
        *separator = '\0';
        {
            char *key = QpmIni_Trim(cursor);
            char *value = QpmIni_Trim(separator + 1);
            if (key[0] == '\0')
            {
                result = QPM_INI_ERR_PARSE;
                break;
            }
            QpmIni_UnquoteInPlace(value);
            result = QpmIni_SetString(document, currentSection, key, value);
            if (result != QPM_INI_OK)
                break;
        }
    }

    fclose(file);
    if (result != QPM_INI_OK)
    {
        QpmIni_Free(document);
        QpmIni_Init(document);
        document->caseSensitive = caseSensitive;
    }
    return result;
}

static int QpmIni_ValueNeedsQuotes(const char *value)
{
    size_t length;
    if (value == NULL)
        return 0;
    length = strlen(value);
    if (length == 0)
        return 0;
    if (isspace((unsigned char)value[0]) || isspace((unsigned char)value[length - 1]) || value[0] == ';' || value[0] == '#')
        return 1;
    return strchr(value, '\n') != NULL || strchr(value, '\r') != NULL || strchr(value, '"') != NULL || strchr(value, '\\') != NULL;
}

static int QpmIni_WriteValue(FILE *file, const char *value)
{
    const unsigned char *cursor;
    if (!QpmIni_ValueNeedsQuotes(value))
        return fputs(value != NULL ? value : "", file) < 0 ? QPM_INI_ERR_IO : QPM_INI_OK;

    if (fputc('"', file) == EOF)
        return QPM_INI_ERR_IO;
    for (cursor = (const unsigned char *)(value != NULL ? value : ""); *cursor != '\0'; ++cursor)
    {
        const char *escape = NULL;
        switch (*cursor)
        {
            case '\n': escape = "\\n"; break;
            case '\r': escape = "\\r"; break;
            case '\t': escape = "\\t"; break;
            case '\\': escape = "\\\\"; break;
            case '"': escape = "\\\""; break;
            default: break;
        }
        if (escape != NULL)
        {
            if (fputs(escape, file) < 0)
                return QPM_INI_ERR_IO;
        }
        else if (fputc((int)*cursor, file) == EOF)
        {
            return QPM_INI_ERR_IO;
        }
    }
    return fputc('"', file) == EOF ? QPM_INI_ERR_IO : QPM_INI_OK;
}

int QpmIni_Save(const QpmIniDocument *document, const char *path)
{
    FILE *file;
    size_t sectionIndex;
    int wroteAny = 0;

    if (document == NULL || path == NULL || path[0] == '\0')
        return QPM_INI_ERR_ARGUMENT;
    file = fopen(path, "wb");
    if (file == NULL)
        return QPM_INI_ERR_IO;

    for (sectionIndex = 0; sectionIndex < document->sectionCount; ++sectionIndex)
    {
        const QpmIniSection *section = &document->sections[sectionIndex];
        size_t entryIndex;
        if (wroteAny && fputc('\n', file) == EOF)
        {
            fclose(file);
            return QPM_INI_ERR_IO;
        }
        if (section->name != NULL && section->name[0] != '\0')
        {
            if (fprintf(file, "[%s]\n", section->name) < 0)
            {
                fclose(file);
                return QPM_INI_ERR_IO;
            }
        }
        for (entryIndex = 0; entryIndex < section->entryCount; ++entryIndex)
        {
            const QpmIniEntry *entry = &section->entries[entryIndex];
            if (fprintf(file, "%s=", entry->key) < 0 || QpmIni_WriteValue(file, entry->value) != QPM_INI_OK || fputc('\n', file) == EOF)
            {
                fclose(file);
                return QPM_INI_ERR_IO;
            }
        }
        wroteAny = 1;
    }

    if (fclose(file) != 0)
        return QPM_INI_ERR_IO;
    return QPM_INI_OK;
}

int QpmIni_HasSection(const QpmIniDocument *document, const char *section)
{
    return QpmIni_FindSection(document, section) != NULL;
}

int QpmIni_HasKey(const QpmIniDocument *document, const char *section, const char *key)
{
    const QpmIniSection *found = QpmIni_FindSection(document, section);
    return found != NULL && QpmIni_FindEntry(document, found, key) != NULL;
}

const char *QpmIni_GetRawValue(const QpmIniDocument *document, const char *section, const char *key)
{
    const QpmIniSection *foundSection = QpmIni_FindSection(document, section);
    const QpmIniEntry *entry = QpmIni_FindEntry(document, foundSection, key);
    return entry != NULL ? entry->value : NULL;
}

int QpmIni_GetString(const QpmIniDocument *document, const char *section, const char *key,
                     const char *defaultValue, char *value, size_t valueSize)
{
    const char *raw;
    int copyStatus;
    if (document == NULL || key == NULL || value == NULL || valueSize == 0)
        return QPM_INI_ERR_ARGUMENT;
    raw = QpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        copyStatus = QpmIni_Copy(value, valueSize, defaultValue != NULL ? defaultValue : "");
        return copyStatus == QPM_INI_OK ? QPM_INI_NOT_FOUND : copyStatus;
    }
    return QpmIni_Copy(value, valueSize, raw);
}

static int QpmIni_ParseInt64(const char *text, int64_t *value)
{
    char *end = NULL;
    long long parsed;
    if (text == NULL || value == NULL)
        return QPM_INI_ERR_ARGUMENT;
    errno = 0;
    parsed = strtoll(text, &end, 0);
    if (end == text || errno == ERANGE)
        return QPM_INI_ERR_PARSE;
    while (*end != '\0' && isspace((unsigned char)*end))
        ++end;
    if (*end != '\0')
        return QPM_INI_ERR_PARSE;
    *value = (int64_t)parsed;
    return QPM_INI_OK;
}

int QpmIni_GetInt64(const QpmIniDocument *document, const char *section, const char *key,
                    int64_t defaultValue, int64_t *value)
{
    const char *raw;
    int status;
    if (document == NULL || key == NULL || value == NULL)
        return QPM_INI_ERR_ARGUMENT;
    raw = QpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        *value = defaultValue;
        return QPM_INI_NOT_FOUND;
    }
    status = QpmIni_ParseInt64(raw, value);
    if (status != QPM_INI_OK)
        *value = defaultValue;
    return status;
}

int QpmIni_GetInt(const QpmIniDocument *document, const char *section, const char *key,
                  int defaultValue, int *value)
{
    int64_t parsed = (int64_t)defaultValue;
    int status;
    if (value == NULL)
        return QPM_INI_ERR_ARGUMENT;
    status = QpmIni_GetInt64(document, section, key, (int64_t)defaultValue, &parsed);
    if (parsed < (int64_t)INT_MIN || parsed > (int64_t)INT_MAX)
    {
        *value = defaultValue;
        return QPM_INI_ERR_RANGE;
    }
    *value = (int)parsed;
    return status;
}

int QpmIni_GetDouble(const QpmIniDocument *document, const char *section, const char *key,
                     double defaultValue, double *value)
{
    const char *raw;
    char *end = NULL;
    double parsed;
    if (document == NULL || key == NULL || value == NULL)
        return QPM_INI_ERR_ARGUMENT;
    raw = QpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        *value = defaultValue;
        return QPM_INI_NOT_FOUND;
    }
    errno = 0;
    parsed = strtod(raw, &end);
    if (end == raw || errno == ERANGE)
    {
        *value = defaultValue;
        return QPM_INI_ERR_PARSE;
    }
    while (*end != '\0' && isspace((unsigned char)*end))
        ++end;
    if (*end != '\0')
    {
        *value = defaultValue;
        return QPM_INI_ERR_PARSE;
    }
    *value = parsed;
    return QPM_INI_OK;
}

int QpmIni_GetBool(const QpmIniDocument *document, const char *section, const char *key,
                   int defaultValue, int *value)
{
    const char *raw;
    if (document == NULL || key == NULL || value == NULL)
        return QPM_INI_ERR_ARGUMENT;
    raw = QpmIni_GetRawValue(document, section, key);
    if (raw == NULL)
    {
        *value = defaultValue ? 1 : 0;
        return QPM_INI_NOT_FOUND;
    }
    if (QpmIni_TextEqual(raw, "1", 0) || QpmIni_TextEqual(raw, "true", 0) ||
        QpmIni_TextEqual(raw, "yes", 0) || QpmIni_TextEqual(raw, "on", 0) ||
        QpmIni_TextEqual(raw, "enabled", 0))
    {
        *value = 1;
        return QPM_INI_OK;
    }
    if (QpmIni_TextEqual(raw, "0", 0) || QpmIni_TextEqual(raw, "false", 0) ||
        QpmIni_TextEqual(raw, "no", 0) || QpmIni_TextEqual(raw, "off", 0) ||
        QpmIni_TextEqual(raw, "disabled", 0))
    {
        *value = 0;
        return QPM_INI_OK;
    }
    *value = defaultValue ? 1 : 0;
    return QPM_INI_ERR_PARSE;
}

int QpmIni_SetInt(QpmIniDocument *document, const char *section, const char *key, int value)
{
    char buffer[32];
    snprintf(buffer, sizeof(buffer), "%d", value);
    return QpmIni_SetString(document, section, key, buffer);
}

int QpmIni_SetInt64(QpmIniDocument *document, const char *section, const char *key, int64_t value)
{
    char buffer[64];
#if defined(_MSC_VER)
    snprintf(buffer, sizeof(buffer), "%lld", (long long)value);
#else
    snprintf(buffer, sizeof(buffer), "%lld", (long long)value);
#endif
    return QpmIni_SetString(document, section, key, buffer);
}

int QpmIni_SetDouble(QpmIniDocument *document, const char *section, const char *key, double value)
{
    char buffer[64];
    snprintf(buffer, sizeof(buffer), "%.17g", value);
    return QpmIni_SetString(document, section, key, buffer);
}

int QpmIni_SetBool(QpmIniDocument *document, const char *section, const char *key, int value)
{
    return QpmIni_SetString(document, section, key, value ? "true" : "false");
}

int QpmIni_RemoveKey(QpmIniDocument *document, const char *sectionName, const char *key)
{
    QpmIniSection *section;
    size_t i;
    if (document == NULL || key == NULL)
        return QPM_INI_ERR_ARGUMENT;
    section = QpmIni_FindSectionMutable(document, sectionName);
    if (section == NULL)
        return QPM_INI_NOT_FOUND;
    for (i = 0; i < section->entryCount; ++i)
    {
        if (QpmIni_TextEqual(section->entries[i].key, key, document->caseSensitive))
        {
            free(section->entries[i].key);
            free(section->entries[i].value);
            if (i + 1 < section->entryCount)
                memmove(&section->entries[i], &section->entries[i + 1], (section->entryCount - i - 1) * sizeof(section->entries[0]));
            --section->entryCount;
            memset(&section->entries[section->entryCount], 0, sizeof(section->entries[0]));
            return QPM_INI_OK;
        }
    }
    return QPM_INI_NOT_FOUND;
}

int QpmIni_RemoveSection(QpmIniDocument *document, const char *sectionName)
{
    size_t i;
    const char *resolved = sectionName != NULL ? sectionName : "";
    if (document == NULL)
        return QPM_INI_ERR_ARGUMENT;
    for (i = 0; i < document->sectionCount; ++i)
    {
        if (QpmIni_TextEqual(document->sections[i].name, resolved, document->caseSensitive))
        {
            QpmIni_FreeSection(&document->sections[i]);
            if (i + 1 < document->sectionCount)
                memmove(&document->sections[i], &document->sections[i + 1], (document->sectionCount - i - 1) * sizeof(document->sections[0]));
            --document->sectionCount;
            memset(&document->sections[document->sectionCount], 0, sizeof(document->sections[0]));
            return QPM_INI_OK;
        }
    }
    return QPM_INI_NOT_FOUND;
}

size_t QpmIni_GetSectionCount(const QpmIniDocument *document)
{
    return document != NULL ? document->sectionCount : 0;
}

const char *QpmIni_GetSectionName(const QpmIniDocument *document, size_t sectionIndex)
{
    if (document == NULL || sectionIndex >= document->sectionCount)
        return NULL;
    return document->sections[sectionIndex].name;
}

size_t QpmIni_GetKeyCount(const QpmIniDocument *document, const char *section)
{
    const QpmIniSection *found = QpmIni_FindSection(document, section);
    return found != NULL ? found->entryCount : 0;
}

const char *QpmIni_GetKeyName(const QpmIniDocument *document, const char *section, size_t keyIndex)
{
    const QpmIniSection *found = QpmIni_FindSection(document, section);
    if (found == NULL || keyIndex >= found->entryCount)
        return NULL;
    return found->entries[keyIndex].key;
}

static int QpmIni_ReadWithDocument(const char *path, QpmIniDocument *document)
{
    QpmIni_Init(document);
    return QpmIni_Load(document, path);
}

int QpmIni_ReadString(const char *path, const char *section, const char *key,
                      const char *defaultValue, char *value, size_t valueSize)
{
    QpmIniDocument document;
    int status = QpmIni_ReadWithDocument(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_GetString(&document, section, key, defaultValue, value, valueSize);
    else if (value != NULL && valueSize > 0)
        QpmIni_Copy(value, valueSize, defaultValue != NULL ? defaultValue : "");
    QpmIni_Free(&document);
    return status;
}

int QpmIni_ReadInt(const char *path, const char *section, const char *key, int defaultValue, int *value)
{
    QpmIniDocument document;
    int status = QpmIni_ReadWithDocument(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_GetInt(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue;
    QpmIni_Free(&document);
    return status;
}

int QpmIni_ReadInt64(const char *path, const char *section, const char *key, int64_t defaultValue, int64_t *value)
{
    QpmIniDocument document;
    int status = QpmIni_ReadWithDocument(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_GetInt64(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue;
    QpmIni_Free(&document);
    return status;
}

int QpmIni_ReadDouble(const char *path, const char *section, const char *key, double defaultValue, double *value)
{
    QpmIniDocument document;
    int status = QpmIni_ReadWithDocument(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_GetDouble(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue;
    QpmIni_Free(&document);
    return status;
}

int QpmIni_ReadBool(const char *path, const char *section, const char *key, int defaultValue, int *value)
{
    QpmIniDocument document;
    int status = QpmIni_ReadWithDocument(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_GetBool(&document, section, key, defaultValue, value);
    else if (value != NULL)
        *value = defaultValue ? 1 : 0;
    QpmIni_Free(&document);
    return status;
}

static int QpmIni_LoadForWrite(const char *path, QpmIniDocument *document)
{
    FILE *probe;
    int status;
    QpmIni_Init(document);
    probe = fopen(path, "rb");
    if (probe == NULL)
        return QPM_INI_OK;
    fclose(probe);
    status = QpmIni_Load(document, path);
    return status;
}

static int QpmIni_WritePrepared(const char *path, QpmIniDocument *document, int setStatus)
{
    int status = setStatus;
    if (status == QPM_INI_OK)
        status = QpmIni_Save(document, path);
    QpmIni_Free(document);
    return status;
}

int QpmIni_WriteString(const char *path, const char *section, const char *key, const char *value)
{
    QpmIniDocument document;
    int status;
    if (path == NULL || key == NULL || value == NULL)
        return QPM_INI_ERR_ARGUMENT;
    status = QpmIni_LoadForWrite(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_SetString(&document, section, key, value);
    return QpmIni_WritePrepared(path, &document, status);
}

int QpmIni_WriteInt(const char *path, const char *section, const char *key, int value)
{
    QpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return QPM_INI_ERR_ARGUMENT;
    status = QpmIni_LoadForWrite(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_SetInt(&document, section, key, value);
    return QpmIni_WritePrepared(path, &document, status);
}

int QpmIni_WriteInt64(const char *path, const char *section, const char *key, int64_t value)
{
    QpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return QPM_INI_ERR_ARGUMENT;
    status = QpmIni_LoadForWrite(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_SetInt64(&document, section, key, value);
    return QpmIni_WritePrepared(path, &document, status);
}

int QpmIni_WriteDouble(const char *path, const char *section, const char *key, double value)
{
    QpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return QPM_INI_ERR_ARGUMENT;
    status = QpmIni_LoadForWrite(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_SetDouble(&document, section, key, value);
    return QpmIni_WritePrepared(path, &document, status);
}

int QpmIni_WriteBool(const char *path, const char *section, const char *key, int value)
{
    QpmIniDocument document;
    int status;
    if (path == NULL || key == NULL)
        return QPM_INI_ERR_ARGUMENT;
    status = QpmIni_LoadForWrite(path, &document);
    if (status == QPM_INI_OK)
        status = QpmIni_SetBool(&document, section, key, value);
    return QpmIni_WritePrepared(path, &document, status);
}

const char *QpmIni_StatusString(int status)
{
    switch (status)
    {
        case QPM_INI_OK: return "OK";
        case QPM_INI_NOT_FOUND: return "Not found";
        case QPM_INI_ERR_ARGUMENT: return "Invalid argument";
        case QPM_INI_ERR_IO: return "I/O error";
        case QPM_INI_ERR_MEMORY: return "Out of memory";
        case QPM_INI_ERR_PARSE: return "Parse error";
        case QPM_INI_ERR_RANGE: return "Range/buffer error";
        default: return "Unknown INI status";
    }
}

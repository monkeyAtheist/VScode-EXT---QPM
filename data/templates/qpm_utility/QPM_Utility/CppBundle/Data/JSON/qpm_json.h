/** @file qpm_json.h @brief Dependency-free JSON tokenizer, typed accessors and fixed-buffer writer. */
#ifndef QPM_JSON_H
#define QPM_JSON_H
#include <stddef.h>
#include <stdint.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef enum QpmJsonType { QPM_JSON_UNDEFINED=0, QPM_JSON_OBJECT, QPM_JSON_ARRAY, QPM_JSON_STRING, QPM_JSON_PRIMITIVE } QpmJsonType;
typedef struct QpmJsonToken { QpmJsonType type; int start; int end; int size; int parent; } QpmJsonToken;

typedef struct QpmJsonWriter {
    char *buffer; size_t capacity; size_t length; int depth; int error;
    char container[32]; unsigned int count[32]; int expectingValue[32];
} QpmJsonWriter;

int QpmJson_Parse(const char *json, QpmJsonToken *tokens, size_t tokenCapacity);
int QpmJson_ObjectValue(const char *json, const QpmJsonToken *tokens, int tokenCount, int objectIndex, const char *key);
int QpmJson_ArrayElement(const QpmJsonToken *tokens, int tokenCount, int arrayIndex, size_t elementIndex);
int QpmJson_TokenEquals(const char *json, const QpmJsonToken *token, const char *text);
int QpmJson_GetString(const char *json, const QpmJsonToken *token, char *output, size_t outputSize);
int QpmJson_GetInt64(const char *json, const QpmJsonToken *token, int64_t *value);
int QpmJson_GetDouble(const char *json, const QpmJsonToken *token, double *value);
int QpmJson_GetBool(const char *json, const QpmJsonToken *token, int *value);

void QpmJsonWriter_Init(QpmJsonWriter *writer, char *buffer, size_t capacity);
int QpmJsonWriter_BeginObject(QpmJsonWriter *writer);
int QpmJsonWriter_EndObject(QpmJsonWriter *writer);
int QpmJsonWriter_BeginArray(QpmJsonWriter *writer);
int QpmJsonWriter_EndArray(QpmJsonWriter *writer);
int QpmJsonWriter_Key(QpmJsonWriter *writer, const char *key);
int QpmJsonWriter_String(QpmJsonWriter *writer, const char *value);
int QpmJsonWriter_Int64(QpmJsonWriter *writer, int64_t value);
int QpmJsonWriter_Double(QpmJsonWriter *writer, double value);
int QpmJsonWriter_Bool(QpmJsonWriter *writer, int value);
int QpmJsonWriter_Null(QpmJsonWriter *writer);
const char *QpmJsonWriter_Data(const QpmJsonWriter *writer);

#ifdef __cplusplus
}
#endif
#endif

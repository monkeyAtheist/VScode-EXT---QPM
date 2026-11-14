#ifndef QPM_HTTP_H
#define QPM_HTTP_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct QpmHttpUrl
{
    char host[256];
    uint16_t port;
    char path[1024];
} QpmHttpUrl;

typedef struct QpmHttpResponse
{
    int statusCode;
    char reason[96];
    char contentType[128];
    long long contentLength;
    int chunked;
    int connectionClose;
    size_t bodySize;
} QpmHttpResponse;

int QpmHttp_ParseUrl(const char *url, QpmHttpUrl *parsed);
int QpmHttp_Request(const char *method,
                    const char *url,
                    const char *extraHeaders,
                    const void *requestBody,
                    size_t requestBodySize,
                    void *responseBody,
                    size_t responseBodyCapacity,
                    QpmHttpResponse *response,
                    int timeoutMs);
int QpmHttp_Get(const char *url, void *body, size_t capacity, QpmHttpResponse *response, int timeoutMs);
int QpmHttp_Post(const char *url, const char *contentType, const void *body, size_t bodySize,
                 void *responseBody, size_t responseCapacity, QpmHttpResponse *response, int timeoutMs);
const char *QpmHttp_ResultText(int result);

#ifdef __cplusplus
}
#endif
#endif

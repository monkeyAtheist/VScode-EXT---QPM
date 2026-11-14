#include "qpm_http.h"
#include "qpm_socket.h"

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define QPM_HTTP_HEADER_MAX 16384

static int QpmHttp_CaseStarts(const char *text, const char *prefix)
{
    while (*prefix)
    {
        if (tolower((unsigned char)*text++) != tolower((unsigned char)*prefix++)) return 0;
    }
    return 1;
}

static void QpmHttp_TrimCopy(char *dst, size_t capacity, const char *src, size_t length)
{
    size_t n;
    while (length && isspace((unsigned char)*src)) { ++src; --length; }
    while (length && isspace((unsigned char)src[length - 1])) --length;
    n = length < capacity - 1 ? length : capacity - 1;
    if (capacity)
    {
        memcpy(dst, src, n);
        dst[n] = '\0';
    }
}

int QpmHttp_ParseUrl(const char *url, QpmHttpUrl *parsed)
{
    const char *hostStart;
    const char *pathStart;
    const char *colon = NULL;
    size_t hostLen;
    if (!url || !parsed) return -1;
    memset(parsed, 0, sizeof(*parsed));
    if (strncmp(url, "http://", 7) != 0) return -2; /* HTTPS intentionally not faked. */
    hostStart = url + 7;
    pathStart = strchr(hostStart, '/');
    if (!pathStart) pathStart = hostStart + strlen(hostStart);
    {
        const char *p;
        for (p = hostStart; p < pathStart; ++p) if (*p == ':') colon = p;
    }
    hostLen = (size_t)((colon ? colon : pathStart) - hostStart);
    if (!hostLen || hostLen >= sizeof(parsed->host)) return -3;
    memcpy(parsed->host, hostStart, hostLen); parsed->host[hostLen] = '\0';
    parsed->port = 80;
    if (colon)
    {
        long port = strtol(colon + 1, NULL, 10);
        if (port <= 0 || port > 65535) return -4;
        parsed->port = (uint16_t)port;
    }
    if (*pathStart) snprintf(parsed->path, sizeof(parsed->path), "%s", pathStart);
    else snprintf(parsed->path, sizeof(parsed->path), "/");
    return 0;
}

static int QpmHttp_ParseHeaders(char *header, QpmHttpResponse *response)
{
    char *line = header;
    char *next = strstr(line, "\r\n");
    if (!next || !response) return -1;
    *next = '\0';
    {
        char *space = strchr(line, ' ');
        if (!space) return -2;
        response->statusCode = atoi(space + 1);
        space = strchr(space + 1, ' ');
        if (space) snprintf(response->reason, sizeof(response->reason), "%s", space + 1);
    }
    line = next + 2;
    while (*line)
    {
        next = strstr(line, "\r\n");
        if (!next) break;
        if (next == line) break;
        *next = '\0';
        if (QpmHttp_CaseStarts(line, "Content-Length:")) response->contentLength = strtoll(line + 15, NULL, 10);
        else if (QpmHttp_CaseStarts(line, "Content-Type:")) QpmHttp_TrimCopy(response->contentType, sizeof(response->contentType), line + 13, strlen(line + 13));
        else if (QpmHttp_CaseStarts(line, "Transfer-Encoding:") && strstr(line + 18, "chunked")) response->chunked = 1;
        else if (QpmHttp_CaseStarts(line, "Connection:") && strstr(line + 11, "close")) response->connectionClose = 1;
        line = next + 2;
    }
    return 0;
}

static int QpmHttp_ReadChunked(QpmSocketHandle socketHandle, unsigned char *dst, size_t capacity, size_t *used, int timeoutMs)
{
    char line[64];
    size_t total = *used;
    for (;;)
    {
        unsigned long chunkSize;
        int rc = QpmSocket_ReceiveLine(socketHandle, line, sizeof(line), timeoutMs);
        if (rc <= 0) return -1;
        chunkSize = strtoul(line, NULL, 16);
        if (chunkSize == 0)
        {
            /* Consume the trailer terminator; trailer fields are intentionally ignored. */
            do { rc = QpmSocket_ReceiveLine(socketHandle, line, sizeof(line), timeoutMs); } while (rc > 0 && line[0]);
            *used = total;
            return 0;
        }
        if ((size_t)chunkSize > capacity - total) return -2;
        rc = QpmSocket_ReceiveExact(socketHandle, dst + total, (size_t)chunkSize, timeoutMs);
        if (rc != (int)chunkSize) return -3;
        total += (size_t)chunkSize;
        {
            char crlf[2];
            if (QpmSocket_ReceiveExact(socketHandle, crlf, 2, timeoutMs) != 2) return -4;
        }
    }
}

int QpmHttp_Request(const char *method,
                    const char *url,
                    const char *extraHeaders,
                    const void *requestBody,
                    size_t requestBodySize,
                    void *responseBody,
                    size_t responseBodyCapacity,
                    QpmHttpResponse *response,
                    int timeoutMs)
{
    QpmHttpUrl parsed;
    QpmSocketHandle socketHandle = QPM_SOCKET_INVALID;
    char *header = NULL;
    char request[4096];
    size_t headerUsed = 0;
    int rc;
    unsigned char *body = (unsigned char *)responseBody;
    if (!method || !url || !response || (!responseBody && responseBodyCapacity)) return -1;
    memset(response, 0, sizeof(*response)); response->contentLength = -1;
    rc = QpmHttp_ParseUrl(url, &parsed); if (rc != 0) return rc;
    if (QpmSocket_Startup() != 0) return -10;
    socketHandle = QpmSocket_TcpConnect(parsed.host, parsed.port, timeoutMs);
    if (socketHandle == QPM_SOCKET_INVALID) { QpmSocket_Cleanup(); return -11; }
    {
        char headerBlock[2048];
        size_t extraLen = extraHeaders ? strlen(extraHeaders) : 0U;
        headerBlock[0] = '\0';
        if (extraLen)
        {
            if (extraLen + 3U >= sizeof(headerBlock)) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -12; }
            memcpy(headerBlock, extraHeaders, extraLen);
            while (extraLen && (headerBlock[extraLen - 1] == '\r' || headerBlock[extraLen - 1] == '\n')) --extraLen;
            headerBlock[extraLen++] = '\r'; headerBlock[extraLen++] = '\n'; headerBlock[extraLen] = '\0';
        }
        if (requestBodySize)
        {
            if (parsed.port == 80)
                rc = snprintf(request, sizeof(request), "%s %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: QPM/1.0\r\nConnection: close\r\nContent-Length: %llu\r\n%s\r\n",
                              method, parsed.path, parsed.host, (unsigned long long)requestBodySize, headerBlock);
            else
                rc = snprintf(request, sizeof(request), "%s %s HTTP/1.1\r\nHost: %s:%u\r\nUser-Agent: QPM/1.0\r\nConnection: close\r\nContent-Length: %llu\r\n%s\r\n",
                              method, parsed.path, parsed.host, (unsigned)parsed.port, (unsigned long long)requestBodySize, headerBlock);
        }
        else if (parsed.port == 80)
            rc = snprintf(request, sizeof(request), "%s %s HTTP/1.1\r\nHost: %s\r\nUser-Agent: QPM/1.0\r\nConnection: close\r\n%s\r\n",
                          method, parsed.path, parsed.host, headerBlock);
        else
            rc = snprintf(request, sizeof(request), "%s %s HTTP/1.1\r\nHost: %s:%u\r\nUser-Agent: QPM/1.0\r\nConnection: close\r\n%s\r\n",
                          method, parsed.path, parsed.host, (unsigned)parsed.port, headerBlock);
    }
    if (rc < 0 || (size_t)rc >= sizeof(request)) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -12; }
    if (QpmSocket_SendAll(socketHandle, request, (size_t)rc) != rc) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -13; }
    if (requestBodySize && QpmSocket_SendAll(socketHandle, requestBody, requestBodySize) != (int)requestBodySize) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -14; }

    header = (char *)malloc(QPM_HTTP_HEADER_MAX);
    if (!header) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -15; }
    header[0] = '\0';
    while (headerUsed + 1 < QPM_HTTP_HEADER_MAX)
    {
        char ch;
        int n = QpmSocket_Receive(socketHandle, &ch, 1, timeoutMs);
        if (n <= 0) { free(header); QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -16; }
        header[headerUsed++] = ch; header[headerUsed] = '\0';
        if (headerUsed >= 4 && memcmp(header + headerUsed - 4, "\r\n\r\n", 4) == 0) break;
    }
    if (headerUsed + 1 >= QPM_HTTP_HEADER_MAX) { free(header); QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -17; }
    rc = QpmHttp_ParseHeaders(header, response);
    free(header);
    if (rc != 0) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -18; }

    if (response->chunked)
    {
        size_t used = 0;
        rc = QpmHttp_ReadChunked(socketHandle, body, responseBodyCapacity, &used, timeoutMs);
        response->bodySize = used;
        if (rc != 0) { QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -19; }
    }
    else
    {
        size_t total = 0;
        while (total < responseBodyCapacity)
        {
            size_t want = responseBodyCapacity - total;
            if (response->contentLength >= 0 && want > (size_t)(response->contentLength - (long long)total)) want = (size_t)(response->contentLength - (long long)total);
            if (want == 0) break;
            rc = QpmSocket_Receive(socketHandle, body + total, want, timeoutMs);
            if (rc <= 0) break;
            total += (size_t)rc;
        }
        response->bodySize = total;
        if (response->contentLength >= 0 && (long long)total < response->contentLength && total == responseBodyCapacity)
        {
            QpmSocket_Close(socketHandle); QpmSocket_Cleanup(); return -20;
        }
    }
    QpmSocket_Close(socketHandle);
    QpmSocket_Cleanup();
    return response->statusCode;
}

int QpmHttp_Get(const char *url, void *body, size_t capacity, QpmHttpResponse *response, int timeoutMs)
{
    return QpmHttp_Request("GET", url, NULL, NULL, 0, body, capacity, response, timeoutMs);
}

int QpmHttp_Post(const char *url, const char *contentType, const void *body, size_t bodySize,
                 void *responseBody, size_t responseCapacity, QpmHttpResponse *response, int timeoutMs)
{
    char headers[256];
    snprintf(headers, sizeof(headers), "Content-Type: %s\r\n", contentType ? contentType : "application/octet-stream");
    return QpmHttp_Request("POST", url, headers, body, bodySize, responseBody, responseCapacity, response, timeoutMs);
}

const char *QpmHttp_ResultText(int result)
{
    if (result >= 100 && result <= 599) return "HTTP response received";
    if (result == -2) return "Only http:// is supported by this dependency-free bundle; use a TLS transport for HTTPS";
    return result >= 0 ? "OK" : "HTTP request failed";
}

/**
 * @file qpm_can.c
 * @brief Implementation of the qpm_can C bundle.
 *
 * Generated bundle implementation. Public API semantics are documented in the matching header file.
 */
#define _DEFAULT_SOURCE
#include "qpm_can.h"

#include <stdio.h>
#include <string.h>

#if defined(__linux__)
#include <errno.h>
#include <fcntl.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <sys/socket.h>
#include <sys/time.h>
#include <unistd.h>
#include <linux/can.h>
#include <linux/can/raw.h>
#endif

static char g_qpmCanLastError[256] = "";

/**
 * @brief Implements the QpmCan_SetLastErrorText operation.
 * @param message See the matching header for semantic details.
 */
static void QpmCan_SetLastErrorText(const char *message)
{
    if (message == NULL)
        message = "CAN error";
    strncpy(g_qpmCanLastError, message, sizeof(g_qpmCanLastError) - 1u);
    g_qpmCanLastError[sizeof(g_qpmCanLastError) - 1u] = '\0';
}

/**
 * @brief Implements the QpmCan_CopyName operation.
 * @param dst See the matching header for semantic details.
 * @param dstSize See the matching header for semantic details.
 * @param src See the matching header for semantic details.
 */
static void QpmCan_CopyName(char *dst, size_t dstSize, const char *src)
{
    if (dst == NULL || dstSize == 0u)
        return;
    if (src == NULL)
        src = "";
    strncpy(dst, src, dstSize - 1u);
    dst[dstSize - 1u] = '\0';
}

/**
 * @brief Implements the QpmCan_InitBus operation.
 * @param bus See the matching header for semantic details.
 */
void QpmCan_InitBus(QpmCanBus *bus)
{
    if (bus == NULL)
        return;
    bus->handle = -1;
    bus->canFdEnabled = 0;
    bus->interfaceName[0] = '\0';
}

/**
 * @brief Implements the QpmCan_InitFrame operation.
 * @param frame See the matching header for semantic details.
 */
void QpmCan_InitFrame(QpmCanFrame *frame)
{
    if (frame == NULL)
        return;
    memset(frame, 0, sizeof(*frame));
}

/**
 * @brief Implements the QpmCan_SetData operation.
 * @param frame See the matching header for semantic details.
 * @param data See the matching header for semantic details.
 * @param size See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_SetData(QpmCanFrame *frame, const uint8_t *data, size_t size)
{
    if (frame == NULL || (data == NULL && size > 0u))
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    if (size > QPM_CAN_MAX_DATA)
        return QPM_CAN_ERROR_TRUNCATED;
    if (!frame->isFd && size > 8u)
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    if (size > 0u)
        memcpy(frame->data, data, size);
    frame->dlc = (uint8_t)size;
    return QPM_CAN_OK;
}

/**
 * @brief Implements the QpmCan_MakeStandardId operation.
 * @param id11 See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
uint32_t QpmCan_MakeStandardId(uint16_t id11)
{
    return (uint32_t)(id11 & 0x07FFu);
}

/**
 * @brief Implements the QpmCan_MakeExtendedId operation.
 * @param id29 See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
uint32_t QpmCan_MakeExtendedId(uint32_t id29)
{
    return (uint32_t)(id29 & 0x1FFFFFFFu);
}

/**
 * @brief Implements the QpmCan_Open operation.
 * @param bus See the matching header for semantic details.
 * @param interfaceName See the matching header for semantic details.
 * @param enableCanFd See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_Open(QpmCanBus *bus, const char *interfaceName, int enableCanFd)
{
#if defined(__linux__)
    struct ifreq ifr;
    struct sockaddr_can address;
    int fd;
    int opt;

    if (bus == NULL || interfaceName == NULL || interfaceName[0] == '\0')
        return QPM_CAN_ERROR_INVALID_ARGUMENT;

    QpmCan_Close(bus);

    fd = socket(PF_CAN, SOCK_RAW, CAN_RAW);
    if (fd < 0)
    {
        QpmCan_SetLastErrorText("socket(PF_CAN, SOCK_RAW, CAN_RAW) failed");
        return QPM_CAN_ERROR_SYSTEM;
    }

    memset(&ifr, 0, sizeof(ifr));
    strncpy(ifr.ifr_name, interfaceName, IFNAMSIZ - 1u);
    if (ioctl(fd, SIOCGIFINDEX, &ifr) < 0)
    {
        close(fd);
        QpmCan_SetLastErrorText("CAN interface lookup failed");
        return QPM_CAN_ERROR_SYSTEM;
    }

    if (enableCanFd)
    {
        opt = 1;
        if (setsockopt(fd, SOL_CAN_RAW, CAN_RAW_FD_FRAMES, &opt, sizeof(opt)) < 0)
        {
            close(fd);
            QpmCan_SetLastErrorText("CAN FD enable failed");
            return QPM_CAN_ERROR_SYSTEM;
        }
    }

    memset(&address, 0, sizeof(address));
    address.can_family = AF_CAN;
    address.can_ifindex = ifr.ifr_ifindex;

    if (bind(fd, (struct sockaddr *)&address, sizeof(address)) < 0)
    {
        close(fd);
        QpmCan_SetLastErrorText("CAN bind failed");
        return QPM_CAN_ERROR_SYSTEM;
    }

    bus->handle = fd;
    bus->canFdEnabled = enableCanFd ? 1 : 0;
    QpmCan_CopyName(bus->interfaceName, sizeof(bus->interfaceName), interfaceName);
    return QPM_CAN_OK;
#else
    (void)bus;
    (void)interfaceName;
    (void)enableCanFd;
    QpmCan_SetLastErrorText("SocketCAN is not available on this platform in the default C bundle");
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_Close operation.
 * @param bus See the matching header for semantic details.
 */
void QpmCan_Close(QpmCanBus *bus)
{
    if (bus == NULL)
        return;
#if defined(__linux__)
    if (bus->handle >= 0)
        close(bus->handle);
#endif
    bus->handle = -1;
    bus->canFdEnabled = 0;
    bus->interfaceName[0] = '\0';
}

/**
 * @brief Implements the QpmCan_IsOpen operation.
 * @param bus See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_IsOpen(const QpmCanBus *bus)
{
    return bus != NULL && bus->handle >= 0;
}

/**
 * @brief Implements the QpmCan_SetReceiveTimeout operation.
 * @param bus See the matching header for semantic details.
 * @param timeoutMs See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_SetReceiveTimeout(QpmCanBus *bus, int timeoutMs)
{
#if defined(__linux__)
    struct timeval timeout;
    if (!QpmCan_IsOpen(bus) || timeoutMs < 0)
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    timeout.tv_sec = timeoutMs / 1000;
    timeout.tv_usec = (timeoutMs % 1000) * 1000;
    if (setsockopt(bus->handle, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout)) < 0)
        return QPM_CAN_ERROR_SYSTEM;
    return QPM_CAN_OK;
#else
    (void)bus;
    (void)timeoutMs;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_SetLoopback operation.
 * @param bus See the matching header for semantic details.
 * @param enabled See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_SetLoopback(QpmCanBus *bus, int enabled)
{
#if defined(__linux__)
    int opt;
    if (!QpmCan_IsOpen(bus))
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    opt = enabled ? 1 : 0;
    return setsockopt(bus->handle, SOL_CAN_RAW, CAN_RAW_LOOPBACK, &opt, sizeof(opt)) == 0
        ? QPM_CAN_OK
        : QPM_CAN_ERROR_SYSTEM;
#else
    (void)bus;
    (void)enabled;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_SetReceiveOwnMessages operation.
 * @param bus See the matching header for semantic details.
 * @param enabled See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_SetReceiveOwnMessages(QpmCanBus *bus, int enabled)
{
#if defined(__linux__)
    int opt;
    if (!QpmCan_IsOpen(bus))
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    opt = enabled ? 1 : 0;
    return setsockopt(bus->handle, SOL_CAN_RAW, CAN_RAW_RECV_OWN_MSGS, &opt, sizeof(opt)) == 0
        ? QPM_CAN_OK
        : QPM_CAN_ERROR_SYSTEM;
#else
    (void)bus;
    (void)enabled;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_SetFilters operation.
 * @param bus See the matching header for semantic details.
 * @param ids See the matching header for semantic details.
 * @param masks See the matching header for semantic details.
 * @param count See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_SetFilters(QpmCanBus *bus, const uint32_t *ids, const uint32_t *masks, size_t count)
{
#if defined(__linux__)
    struct can_filter localFilters[32];
    size_t i;
    if (!QpmCan_IsOpen(bus) || ids == NULL || masks == NULL || count > 32u)
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    for (i = 0; i < count; ++i)
    {
        localFilters[i].can_id = (canid_t)ids[i];
        localFilters[i].can_mask = (canid_t)masks[i];
    }
    if (setsockopt(bus->handle, SOL_CAN_RAW, CAN_RAW_FILTER, localFilters, (socklen_t)(count * sizeof(localFilters[0]))) < 0)
        return QPM_CAN_ERROR_SYSTEM;
    return QPM_CAN_OK;
#else
    (void)bus;
    (void)ids;
    (void)masks;
    (void)count;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_ClearFilters operation.
 * @param bus See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_ClearFilters(QpmCanBus *bus)
{
#if defined(__linux__)
    if (!QpmCan_IsOpen(bus))
        return QPM_CAN_ERROR_INVALID_ARGUMENT;
    if (setsockopt(bus->handle, SOL_CAN_RAW, CAN_RAW_FILTER, NULL, 0) < 0)
        return QPM_CAN_ERROR_SYSTEM;
    return QPM_CAN_OK;
#else
    (void)bus;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

#if defined(__linux__)
/**
 * @brief Implements the QpmCan_ToLinuxId operation.
 * @param frame See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
static canid_t QpmCan_ToLinuxId(const QpmCanFrame *frame)
{
    canid_t id = (canid_t)(frame->id & (frame->isExtended ? CAN_EFF_MASK : CAN_SFF_MASK));
    if (frame->isExtended)
        id |= CAN_EFF_FLAG;
    if (frame->isRemote)
        id |= CAN_RTR_FLAG;
    if (frame->isError)
        id |= CAN_ERR_FLAG;
    return id;
}

/**
 * @brief Implements the QpmCan_FromLinuxId operation.
 * @param frame See the matching header for semantic details.
 * @param id See the matching header for semantic details.
 */
static void QpmCan_FromLinuxId(QpmCanFrame *frame, canid_t id)
{
    frame->isExtended = (id & CAN_EFF_FLAG) ? 1u : 0u;
    frame->isRemote = (id & CAN_RTR_FLAG) ? 1u : 0u;
    frame->isError = (id & CAN_ERR_FLAG) ? 1u : 0u;
    frame->id = frame->isExtended ? (uint32_t)(id & CAN_EFF_MASK) : (uint32_t)(id & CAN_SFF_MASK);
}
#endif

/**
 * @brief Implements the QpmCan_Send operation.
 * @param bus See the matching header for semantic details.
 * @param frame See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_Send(QpmCanBus *bus, const QpmCanFrame *frame)
{
#if defined(__linux__)
    ssize_t written;
    if (!QpmCan_IsOpen(bus) || frame == NULL || frame->dlc > QPM_CAN_MAX_DATA || (!frame->isFd && frame->dlc > 8u))
        return QPM_CAN_ERROR_INVALID_ARGUMENT;

    if (frame->isFd)
    {
        struct canfd_frame out;
        if (!bus->canFdEnabled)
            return QPM_CAN_ERROR_INVALID_ARGUMENT;
        memset(&out, 0, sizeof(out));
        out.can_id = QpmCan_ToLinuxId(frame);
        out.len = frame->dlc;
        if (frame->bitrateSwitch)
            out.flags |= CANFD_BRS;
        if (frame->errorStateIndicator)
            out.flags |= CANFD_ESI;
        memcpy(out.data, frame->data, frame->dlc);
        written = write(bus->handle, &out, sizeof(out));
        return written == (ssize_t)sizeof(out) ? QPM_CAN_OK : QPM_CAN_ERROR_SYSTEM;
    }
    else
    {
        struct can_frame out;
        memset(&out, 0, sizeof(out));
        out.can_id = QpmCan_ToLinuxId(frame);
        out.can_dlc = frame->dlc;
        memcpy(out.data, frame->data, frame->dlc);
        written = write(bus->handle, &out, sizeof(out));
        return written == (ssize_t)sizeof(out) ? QPM_CAN_OK : QPM_CAN_ERROR_SYSTEM;
    }
#else
    (void)bus;
    (void)frame;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_Receive operation.
 * @param bus See the matching header for semantic details.
 * @param frame See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_Receive(QpmCanBus *bus, QpmCanFrame *frame)
{
#if defined(__linux__)
    uint8_t buffer[sizeof(struct canfd_frame)];
    ssize_t received;
    if (!QpmCan_IsOpen(bus) || frame == NULL)
        return QPM_CAN_ERROR_INVALID_ARGUMENT;

    memset(buffer, 0, sizeof(buffer));
    received = read(bus->handle, buffer, sizeof(buffer));
    if (received < 0)
    {
        if (errno == EAGAIN || errno == EWOULDBLOCK)
            return QPM_CAN_ERROR_TIMEOUT;
        return QPM_CAN_ERROR_SYSTEM;
    }

    QpmCan_InitFrame(frame);
    if (received == (ssize_t)sizeof(struct can_frame))
    {
        const struct can_frame *in = (const struct can_frame *)buffer;
        QpmCan_FromLinuxId(frame, in->can_id);
        frame->dlc = in->can_dlc;
        memcpy(frame->data, in->data, frame->dlc);
        return QPM_CAN_OK;
    }
    if (received == (ssize_t)sizeof(struct canfd_frame))
    {
        const struct canfd_frame *in = (const struct canfd_frame *)buffer;
        QpmCan_FromLinuxId(frame, in->can_id);
        frame->isFd = 1u;
        frame->dlc = in->len;
        frame->bitrateSwitch = (in->flags & CANFD_BRS) ? 1u : 0u;
        frame->errorStateIndicator = (in->flags & CANFD_ESI) ? 1u : 0u;
        memcpy(frame->data, in->data, frame->dlc);
        return QPM_CAN_OK;
    }
    return QPM_CAN_ERROR_TRUNCATED;
#else
    (void)bus;
    (void)frame;
    return QPM_CAN_ERROR_UNSUPPORTED;
#endif
}

/**
 * @brief Implements the QpmCan_FormatFrame operation.
 * @param frame See the matching header for semantic details.
 * @param buffer See the matching header for semantic details.
 * @param bufferSize See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmCan_FormatFrame(const QpmCanFrame *frame, char *buffer, size_t bufferSize)
{
    size_t offset;
    size_t i;
    int written;

    if (frame == NULL || buffer == NULL || bufferSize == 0u)
        return QPM_CAN_ERROR_INVALID_ARGUMENT;

    written = snprintf(buffer, bufferSize, "%s %08lX [%u]",
                       frame->isFd ? "CANFD" : "CAN",
                       (unsigned long)frame->id,
                       (unsigned int)frame->dlc);
    if (written < 0 || (size_t)written >= bufferSize)
        return QPM_CAN_ERROR_TRUNCATED;
    offset = (size_t)written;

    for (i = 0u; i < frame->dlc && i < QPM_CAN_MAX_DATA; ++i)
    {
        written = snprintf(buffer + offset, bufferSize - offset, " %02X", (unsigned int)frame->data[i]);
        if (written < 0 || (size_t)written >= bufferSize - offset)
            return QPM_CAN_ERROR_TRUNCATED;
        offset += (size_t)written;
    }

    return QPM_CAN_OK;
}

/**
 * @brief Implements the QpmCan_LastError operation.
 * @return See the matching header for status code or value semantics.
 */
const char *QpmCan_LastError(void)
{
    return g_qpmCanLastError;
}

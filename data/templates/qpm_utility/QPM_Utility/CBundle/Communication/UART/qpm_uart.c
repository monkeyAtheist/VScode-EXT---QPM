/**
 * @file qpm_uart.c
 * @brief Implementation of the qpm_uart C bundle.
 *
 * Generated bundle implementation. Public API semantics are documented in the matching header file.
 */
#include "qpm_uart.h"

#include <errno.h>
#include <stdio.h>
#include <string.h>

#ifdef _WIN32
static char g_qpmUartLastError[256] = "";

/**
 * @brief Implements the QpmUart_SetLastErrorText operation.
 * @param message See the matching header for semantic details.
 */
static void QpmUart_SetLastErrorText(const char *message)
{
    if (message == NULL)
        message = "unknown error";
    strncpy(g_qpmUartLastError, message, sizeof(g_qpmUartLastError) - 1);
    g_qpmUartLastError[sizeof(g_qpmUartLastError) - 1] = '\0';
}

/**
 * @brief Implements the QpmUart_ToWindowsBaud operation.
 * @param baudRate See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
static DWORD QpmUart_ToWindowsBaud(unsigned int baudRate)
{
    return (DWORD)baudRate;
}

/**
 * @brief Implements the QpmUart_ToWindowsParity operation.
 * @param parity See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
static char QpmUart_ToWindowsParity(QpmUartParity parity)
{
    switch (parity)
    {
        case QPM_UART_PARITY_ODD: return ODDPARITY;
        case QPM_UART_PARITY_EVEN: return EVENPARITY;
        case QPM_UART_PARITY_NONE:
        default: return NOPARITY;
    }
}

#else
#  include <fcntl.h>
#  include <sys/select.h>
#  include <termios.h>
#  include <unistd.h>

static char g_qpmUartLastError[256] = "";

/**
 * @brief Implements the QpmUart_SetLastErrorText operation.
 * @param message See the matching header for semantic details.
 */
static void QpmUart_SetLastErrorText(const char *message)
{
    if (message == NULL)
        message = strerror(errno);
    strncpy(g_qpmUartLastError, message, sizeof(g_qpmUartLastError) - 1);
    g_qpmUartLastError[sizeof(g_qpmUartLastError) - 1] = '\0';
}

/**
 * @brief Implements the QpmUart_ToPosixBaud operation.
 * @param baudRate See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
static speed_t QpmUart_ToPosixBaud(unsigned int baudRate)
{
    switch (baudRate)
    {
        case 1200: return B1200;
        case 2400: return B2400;
        case 4800: return B4800;
        case 9600: return B9600;
        case 19200: return B19200;
        case 38400: return B38400;
#ifdef B57600
        case 57600: return B57600;
#endif
#ifdef B115200
        case 115200: return B115200;
#endif
#ifdef B230400
        case 230400: return B230400;
#endif
        default: return B9600;
    }
}
#endif

/**
 * @brief Implements the QpmUart_Init operation.
 * @param port See the matching header for semantic details.
 */
void QpmUart_Init(QpmUartPort *port)
{
    if (port == NULL)
        return;
#ifdef _WIN32
    port->handle = INVALID_HANDLE_VALUE;
#else
    port->handle = -1;
#endif
    port->isOpen = 0;
}

/**
 * @brief Implements the QpmUart_Open operation.
 * @param port See the matching header for semantic details.
 * @param deviceName See the matching header for semantic details.
 * @param baudRate See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_Open(QpmUartPort *port, const char *deviceName, unsigned int baudRate)
{
    return QpmUart_OpenEx(port, deviceName, baudRate, 8, 1, QPM_UART_PARITY_NONE);
}

/**
 * @brief Implements the QpmUart_OpenEx operation.
 * @param port See the matching header for semantic details.
 * @param deviceName See the matching header for semantic details.
 * @param baudRate See the matching header for semantic details.
 * @param dataBits See the matching header for semantic details.
 * @param stopBits See the matching header for semantic details.
 * @param parity See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_OpenEx(QpmUartPort *port, const char *deviceName, unsigned int baudRate,
                   int dataBits, int stopBits, QpmUartParity parity)
{
    if (port == NULL || deviceName == NULL || deviceName[0] == '\0')
        return -1;

    QpmUart_Close(port);

#ifdef _WIN32
    char fullName[128];
    if (strncmp(deviceName, "\\\\.\\", 4) == 0)
        snprintf(fullName, sizeof(fullName), "%s", deviceName);
    else
        snprintf(fullName, sizeof(fullName), "\\\\.\\%s", deviceName);

    HANDLE handle = CreateFileA(fullName, GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, 0, NULL);
    if (handle == INVALID_HANDLE_VALUE)
    {
        QpmUart_SetLastErrorText("CreateFileA failed");
        return -2;
    }

    DCB dcb;
    SecureZeroMemory(&dcb, sizeof(dcb));
    dcb.DCBlength = sizeof(dcb);
    if (!GetCommState(handle, &dcb))
    {
        CloseHandle(handle);
        QpmUart_SetLastErrorText("GetCommState failed");
        return -3;
    }
    dcb.BaudRate = QpmUart_ToWindowsBaud(baudRate);
    dcb.ByteSize = (BYTE)dataBits;
    dcb.StopBits = (stopBits == 2) ? TWOSTOPBITS : ONESTOPBIT;
    dcb.Parity = QpmUart_ToWindowsParity(parity);
    dcb.fDtrControl = DTR_CONTROL_ENABLE;
    dcb.fRtsControl = RTS_CONTROL_ENABLE;

    if (!SetCommState(handle, &dcb))
    {
        CloseHandle(handle);
        QpmUart_SetLastErrorText("SetCommState failed");
        return -4;
    }

    COMMTIMEOUTS timeouts;
    SecureZeroMemory(&timeouts, sizeof(timeouts));
    timeouts.ReadIntervalTimeout = 50;
    timeouts.ReadTotalTimeoutConstant = 50;
    timeouts.ReadTotalTimeoutMultiplier = 10;
    timeouts.WriteTotalTimeoutConstant = 1000;
    timeouts.WriteTotalTimeoutMultiplier = 10;
    SetCommTimeouts(handle, &timeouts);

    port->handle = handle;
    port->isOpen = 1;
    return 0;
#else
    int fd = open(deviceName, O_RDWR | O_NOCTTY | O_SYNC);
    if (fd < 0)
    {
        QpmUart_SetLastErrorText(NULL);
        return -2;
    }

    struct termios tty;
    memset(&tty, 0, sizeof(tty));
    if (tcgetattr(fd, &tty) != 0)
    {
        close(fd);
        QpmUart_SetLastErrorText(NULL);
        return -3;
    }

    cfsetospeed(&tty, QpmUart_ToPosixBaud(baudRate));
    cfsetispeed(&tty, QpmUart_ToPosixBaud(baudRate));

    tty.c_cflag = (tty.c_cflag & ~CSIZE);
    switch (dataBits)
    {
        case 5: tty.c_cflag |= CS5; break;
        case 6: tty.c_cflag |= CS6; break;
        case 7: tty.c_cflag |= CS7; break;
        case 8:
        default: tty.c_cflag |= CS8; break;
    }
    tty.c_cflag |= CLOCAL | CREAD;
    if (parity == QPM_UART_PARITY_NONE)
        tty.c_cflag &= ~PARENB;
    else
    {
        tty.c_cflag |= PARENB;
        if (parity == QPM_UART_PARITY_ODD)
            tty.c_cflag |= PARODD;
        else
            tty.c_cflag &= ~PARODD;
    }
    if (stopBits == 2)
        tty.c_cflag |= CSTOPB;
    else
        tty.c_cflag &= ~CSTOPB;

    tty.c_iflag &= ~(IXON | IXOFF | IXANY);
    tty.c_lflag = 0;
    tty.c_oflag = 0;
    tty.c_cc[VMIN] = 0;
    tty.c_cc[VTIME] = 1;

    if (tcsetattr(fd, TCSANOW, &tty) != 0)
    {
        close(fd);
        QpmUart_SetLastErrorText(NULL);
        return -4;
    }

    port->handle = fd;
    port->isOpen = 1;
    return 0;
#endif
}

/**
 * @brief Implements the QpmUart_IsOpen operation.
 * @param port See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_IsOpen(const QpmUartPort *port)
{
    return port != NULL && port->isOpen;
}

/**
 * @brief Implements the QpmUart_Write operation.
 * @param port See the matching header for semantic details.
 * @param data See the matching header for semantic details.
 * @param size See the matching header for semantic details.
 * @param written See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_Write(QpmUartPort *port, const void *data, size_t size, size_t *written)
{
    if (written != NULL)
        *written = 0;
    if (!QpmUart_IsOpen(port) || data == NULL)
        return -1;
#ifdef _WIN32
    DWORD count = 0;
    if (!WriteFile(port->handle, data, (DWORD)size, &count, NULL))
    {
        QpmUart_SetLastErrorText("WriteFile failed");
        return -2;
    }
    if (written != NULL)
        *written = (size_t)count;
#else
    ssize_t count = write(port->handle, data, size);
    if (count < 0)
    {
        QpmUart_SetLastErrorText(NULL);
        return -2;
    }
    if (written != NULL)
        *written = (size_t)count;
#endif
    return 0;
}

/**
 * @brief Implements the QpmUart_WriteText operation.
 * @param port See the matching header for semantic details.
 * @param text See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_WriteText(QpmUartPort *port, const char *text)
{
    if (text == NULL)
        return -1;
    return QpmUart_Write(port, text, strlen(text), NULL);
}

/**
 * @brief Implements the QpmUart_Read operation.
 * @param port See the matching header for semantic details.
 * @param buffer See the matching header for semantic details.
 * @param bufferSize See the matching header for semantic details.
 * @param received See the matching header for semantic details.
 * @param timeoutMs See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_Read(QpmUartPort *port, void *buffer, size_t bufferSize, size_t *received, unsigned int timeoutMs)
{
    if (received != NULL)
        *received = 0;
    if (!QpmUart_IsOpen(port) || buffer == NULL || bufferSize == 0)
        return -1;
#ifdef _WIN32
    (void)timeoutMs;
    DWORD count = 0;
    if (!ReadFile(port->handle, buffer, (DWORD)bufferSize, &count, NULL))
    {
        QpmUart_SetLastErrorText("ReadFile failed");
        return -2;
    }
    if (received != NULL)
        *received = (size_t)count;
#else
    fd_set set;
    struct timeval timeout;
    FD_ZERO(&set);
    FD_SET(port->handle, &set);
    timeout.tv_sec = (long)(timeoutMs / 1000u);
    timeout.tv_usec = (long)((timeoutMs % 1000u) * 1000u);
    int ready = select(port->handle + 1, &set, NULL, NULL, timeoutMs == 0 ? NULL : &timeout);
    if (ready < 0)
    {
        QpmUart_SetLastErrorText(NULL);
        return -2;
    }
    if (ready == 0)
        return 1;
    ssize_t count = read(port->handle, buffer, bufferSize);
    if (count < 0)
    {
        QpmUart_SetLastErrorText(NULL);
        return -3;
    }
    if (received != NULL)
        *received = (size_t)count;
#endif
    return 0;
}

/**
 * @brief Implements the QpmUart_ReadLine operation.
 * @param port See the matching header for semantic details.
 * @param buffer See the matching header for semantic details.
 * @param bufferSize See the matching header for semantic details.
 * @param timeoutMs See the matching header for semantic details.
 * @return See the matching header for status code or value semantics.
 */
int QpmUart_ReadLine(QpmUartPort *port, char *buffer, size_t bufferSize, unsigned int timeoutMs)
{
    if (buffer == NULL || bufferSize == 0)
        return -1;
    size_t index = 0;
    buffer[0] = '\0';
    while (index + 1 < bufferSize)
    {
        char ch = '\0';
        size_t received = 0;
        int rc = QpmUart_Read(port, &ch, 1, &received, timeoutMs);
        if (rc != 0)
            return rc;
        if (received == 0)
            continue;
        if (ch == '\n')
            break;
        if (ch != '\r')
            buffer[index++] = ch;
    }
    buffer[index] = '\0';
    return 0;
}

/**
 * @brief Implements the QpmUart_Close operation.
 * @param port See the matching header for semantic details.
 */
void QpmUart_Close(QpmUartPort *port)
{
    if (port == NULL || !port->isOpen)
        return;
#ifdef _WIN32
    CloseHandle(port->handle);
    port->handle = INVALID_HANDLE_VALUE;
#else
    close(port->handle);
    port->handle = -1;
#endif
    port->isOpen = 0;
}

/**
 * @brief Implements the QpmUart_LastError operation.
 * @return See the matching header for status code or value semantics.
 */
const char *QpmUart_LastError(void)
{
    return g_qpmUartLastError;
}

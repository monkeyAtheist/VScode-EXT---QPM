# QPM C INI bundle

Dependency-free INI parser/writer for C projects.

## Files

- `qpm_ini.c` / `qpm_ini.h`: parser, typed accessors, editing and save API.
- `example.ini`: example with root keys and multiple sections.

## Typical use

```c
#include "qpm_ini.h"
#include <stdio.h>

int main(void)
{
    QpmIniDocument ini;
    char port[64];
    int baudrate = 9600;
    int logging = 0;

    QpmIni_Init(&ini);
    if (QpmIni_Load(&ini, "config.ini") != QPM_INI_OK)
    {
        QpmIni_Free(&ini);
        return 1;
    }

    QpmIni_GetString(&ini, "serial", "port", "COM1", port, sizeof(port));
    QpmIni_GetInt(&ini, "serial", "baudrate", 9600, &baudrate);
    QpmIni_GetBool(&ini, "features", "logging", 0, &logging);

    printf("port=%s baudrate=%d logging=%d\n", port, baudrate, logging);
    QpmIni_Free(&ini);
    return 0;
}
```

For one value, the document object is optional:

```c
char host[128];
QpmIni_ReadString("config.ini", "network", "host", "127.0.0.1", host, sizeof(host));
```

To modify and save:

```c
QpmIniDocument ini;
QpmIni_Init(&ini);
QpmIni_Load(&ini, "config.ini");
QpmIni_SetInt(&ini, "network", "port", 5025);
QpmIni_SetBool(&ini, "features", "logging", 1);
QpmIni_Save(&ini, "config.ini");
QpmIni_Free(&ini);
```

## Parsing rules

- Sections use `[section]` syntax.
- `;` and `#` start full-line comments.
- The first `=` separates the key from the value, so values may contain additional `=` characters.
- UTF-8 BOM is accepted.
- Double-quoted values support `\\n`, `\\r`, `\\t`, `\\\\` and `\\"` escapes.
- Key/section comparisons are case-insensitive by default.
- Root keys before the first section are supported using an empty section name (`""`).

## Save behavior

`QpmIni_Save()` writes a normalized INI file from the in-memory document. It preserves values, sections and keys, but intentionally does not preserve original comments or whitespace formatting.

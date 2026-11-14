# QPM C CSV bundle

CSV parsing/writing with configurable delimiter, quoted fields and escaped quotes (`""`).

`QpmCsv_ParseLine()` is intended for one logical CSV row. `QpmCsv_ReadFile()` currently treats a physical line as one row; embedded newlines inside a quoted field are therefore not supported.

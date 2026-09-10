# QPM_Utility C++ bundle

This bundle replaces the older MY_Util / qpm_util split.  It is the canonical C++ utility layer for QPM generated projects.

## Files

- `qpm_utility.h`
- `qpm_utility.cpp`
- `utility.ini`

## Main features

- executable path and executable directory helpers;
- filesystem helpers based on `std::filesystem`;
- text file read/write/append helpers;
- timestamp, date, time, delay and stopwatch helpers;
- environment-variable helper;
- string formatting/parsing helpers;
- simple INI reader with typed accessors;
- simple matrix/vector helpers inherited from the previous utility bundle;
- formatted error-log block helpers.

## Minimal example

```cpp
#include "qpm_utility.h"

int main()
{
    const auto appDir = qpm_utility::getExecutableDirectory();
    const auto logDir = appDir / "logs";
    qpm_utility::ensure_directory(logDir);

    qpm_utility::Stopwatch timer;
    qpm_utility::sleep_ms(50);

    qpm_utility::append_text_file(
        logDir / "app.log",
        qpm_utility::now_timestamp("%Y-%m-%d %H:%M:%S") +
        " elapsed_ms=" + std::to_string(timer.elapsed_ms()) + "
");

    return 0;
}
```

The legacy namespace alias `jc_utility` is still available for source compatibility, but new code should use `qpm_utility`.


## QPM_String helper

`QPM_String` is a small `std::string`-compatible helper added by QPM_Utility. It keeps the existing `MyString` alias for compatibility, but new code should prefer `QPM_String`.

```cpp
#include "qpm_utility.h"

using qpm_utility::QPM_String;
using namespace qpm_utility::literals;

QPM_String lineA = QPM_String("=") * 10;
QPM_String lineB = 10 * QPM_String("-");
QPM_String lineC = "*"_qpm * 8;
QPM_String lineD = qpm_utility::repeat("//", 4);

QPM_String lineE = "abc"_qpm;
lineE += "def";  // "abcdef"
lineE *= 2;      // "abcdefabcdef"
lineE ^= 2;      // compatibility alias for *=

```

C++ cannot overload the exact expression `"=" * 10` because a string literal is not a user-defined type. Use `QPM_String("=") * 10`, `10 * QPM_String("=")`, or `"="_qpm * 10`.

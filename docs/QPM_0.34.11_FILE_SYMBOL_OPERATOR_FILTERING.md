# QPM 0.34.11 — Qt File Symbols operator-body filtering

The fallback Qt File Symbols scanner now recognises C++ operator-overload bodies before scanning for declaration-shaped text. This prevents constructor-style local variables inside `operator+`, `operator+=`, `operator[]`, `operator()`, conversion operators and related overloads from appearing as functions.

The change is based on the corresponding JC Lib implementation supplied for comparison. Regression coverage includes local `Widget result(other);`, `QPointF operatorLocalPoint(...);` and `Widget temporary(other);` declarations inside overloaded operators.

# QPM 0.34.3 — Embedded JC Lib 0.8.36 synchronization

QPM keeps a curated subset of JC Lib. This update synchronizes only packs that are already part of the QPM embedded set.

## Updated packs

| QPM pack | Previous | JC Lib 0.8.36 |
| --- | ---: | ---: |
| C | 1.12.0 | 2.0.0 |
| C++ | 2.16.0 | 3.2.0 |
| Scripting / System | 1.9.1 | 1.12.0 |
| Qt C++ / QML | 1.12.1 | 2.0.0 |

The other embedded JC Lib packs already matched the supplied JC Lib archive and were left unchanged. `qpm_base_preprocessor_pack.json` remains QPM-specific.

## Embedded engine compatibility

The embedded library UI now supports the JC Lib 0.8.36 features required by these packs:

- `insertValueMap` expansion with bounded multi-pass placeholder resolution;
- optional empty multi-select pickers (`allowEmptySelection`);
- correct clearing of optional multi-select values without re-applying a default;
- whitespace normalization for generated Windows CMD/Batch and Git command cards;
- Qt sub-pack routes for Qt Language, Qt QML / Qt Quick, Qt Multimedia and Qt SQL & Test.

## Functional checks

- C `malloc typed pointer allocation`: `char***` generation verified.
- C++ `std::malloc typed pointer allocation`: `char****` generation verified.
- Git `push`: `-u` / upstream flag exposed and zero selected optional flags accepted.
- Qt 2.0.0: QRangeModelAdapter, QRestAccessManager and modern QML ComponentBehavior cards present.
- QPM curated pack migration tests: pass.
- QPM 0.34.x icon/deployment regression tests: pass.

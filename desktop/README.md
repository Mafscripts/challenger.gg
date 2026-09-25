# Topfragg Desktop

Native Windows desktop client built with C++17, Qt 6 and Qt Quick.

## Testen

Open `release/Topfragg.exe`. De volledige `release`-map moet bij de EXE blijven,
omdat deze de Qt-runtime en QML-modules bevat.

## Zelf bouwen

Gebruik Qt 6.5 of nieuwer met CMake en een bijpassende C++-compiler:

```powershell
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build build
windeployqt --release --qmldir qml release/Topfragg.exe
```

De interface bevat werkende navigatie, tournament-inschrijving, ranked queue,
wallet-demoacties, meldingen en animaties. De huidige data is lokale demodata;
de bestaande web-API kan in een volgende stap via Qt Network worden gekoppeld.

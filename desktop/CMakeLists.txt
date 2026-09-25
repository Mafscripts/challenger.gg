cmake_minimum_required(VERSION 3.21)

project(TopfraggDesktop VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)

find_package(Qt6 6.5 REQUIRED COMPONENTS Quick QuickControls2 Svg)
qt_standard_project_setup(REQUIRES 6.5)

qt_add_executable(Topfragg
    src/main.cpp
    src/AppController.cpp
    src/AppController.h
)

qt_add_qml_module(Topfragg
    URI Topfragg
    VERSION 1.0
    QML_FILES
        qml/Main.qml
        qml/AppButton.qml
        qml/GlassCard.qml
        qml/NavItem.qml
        qml/StatCard.qml
    RESOURCES
        assets/topfragg-logo.svg
        assets/topfragg-mark.svg
        assets/trophy-gold.png
        assets/trophy-silver.png
        assets/trophy-bronze.png
        assets/rank-champion.png
)

set_target_properties(Topfragg PROPERTIES
    WIN32_EXECUTABLE TRUE
    OUTPUT_NAME "Topfragg"
)

target_link_libraries(Topfragg PRIVATE Qt6::Quick Qt6::QuickControls2 Qt6::Svg)

install(TARGETS Topfragg
    BUNDLE DESTINATION .
    RUNTIME DESTINATION .
)

#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QIcon>
#include <QQuickWindow>
#include <QQuickStyle>
#include <QTimer>

#include "AppController.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);
    app.setOrganizationName(QStringLiteral("Topfragg"));
    app.setApplicationName(QStringLiteral("Topfragg"));
    app.setApplicationVersion(QStringLiteral("1.0.0"));
    app.setWindowIcon(QIcon(QStringLiteral(":/qt/qml/Topfragg/assets/topfragg-mark.svg")));

    QQuickStyle::setStyle(QStringLiteral("Basic"));

    AppController controller;
    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("appController"), &controller);
    engine.loadFromModule(QStringLiteral("Topfragg"), QStringLiteral("Main"));

    if (engine.rootObjects().isEmpty())
        return -1;

    const QStringList arguments = app.arguments();
    const int screenshotIndex = arguments.indexOf(QStringLiteral("--screenshot"));
    if (screenshotIndex >= 0 && screenshotIndex + 1 < arguments.size()) {
        const QString outputPath = arguments.at(screenshotIndex + 1);
        QTimer::singleShot(1200, &app, [outputPath, &app]() {
            const auto windows = QGuiApplication::allWindows();
            for (QWindow *candidate : windows) {
                if (auto *quickWindow = qobject_cast<QQuickWindow *>(candidate)) {
                    quickWindow->grabWindow().save(outputPath);
                    break;
                }
            }
            app.quit();
        });
    }

    return app.exec();
}

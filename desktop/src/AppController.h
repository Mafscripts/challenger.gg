#pragma once

#include <QObject>
#include <QString>
#include <QTimer>

class AppController final : public QObject
{
    Q_OBJECT
    Q_PROPERTY(bool queueActive READ queueActive NOTIFY queueActiveChanged)
    Q_PROPERTY(QString queueStatus READ queueStatus NOTIFY queueActiveChanged)
    Q_PROPERTY(QString matchmakingState READ matchmakingState NOTIFY matchmakingChanged)
    Q_PROPERTY(int queueSeconds READ queueSeconds NOTIFY matchmakingChanged)
    Q_PROPERTY(int playersFound READ playersFound NOTIFY matchmakingChanged)
    Q_PROPERTY(int readyPlayers READ readyPlayers NOTIFY matchmakingChanged)
    Q_PROPERTY(int readySecondsLeft READ readySecondsLeft NOTIFY matchmakingChanged)
    Q_PROPERTY(int matchCountdown READ matchCountdown NOTIFY matchmakingChanged)
    Q_PROPERTY(QString searchRange READ searchRange NOTIFY matchmakingChanged)
    Q_PROPERTY(int credits READ credits NOTIFY creditsChanged)

public:
    explicit AppController(QObject *parent = nullptr);

    bool queueActive() const { return m_queueActive; }
    QString queueStatus() const;
    QString matchmakingState() const { return m_matchmakingState; }
    int queueSeconds() const { return m_queueSeconds; }
    int playersFound() const { return m_playersFound; }
    int readyPlayers() const { return m_readyPlayers; }
    int readySecondsLeft() const { return m_readySecondsLeft; }
    int matchCountdown() const { return m_matchCountdown; }
    QString searchRange() const;
    int credits() const { return m_credits; }

    Q_INVOKABLE void toggleQueue();
    Q_INVOKABLE void leaveQueue();
    Q_INVOKABLE void acceptReadyCheck();
    Q_INVOKABLE void declineReadyCheck();
    Q_INVOKABLE void enterMatch();
    Q_INVOKABLE void resetMatchmaking();
    Q_INVOKABLE bool joinTournament(const QString &tournamentName);
    Q_INVOKABLE void addDemoCredits(int amount);

signals:
    void queueActiveChanged();
    void matchmakingChanged();
    void creditsChanged();
    void toastRequested(const QString &title, const QString &message, const QString &tone);

private:
    bool m_queueActive = false;
    QString m_matchmakingState = QStringLiteral("idle");
    int m_queueSeconds = 0;
    int m_playersFound = 0;
    int m_readyPlayers = 0;
    int m_readySecondsLeft = 20;
    int m_matchCountdown = 10;
    bool m_localPlayerReady = false;
    QTimer m_matchmakingTimer;
    int m_credits = 2450;

    void matchmakingTick();
    void setMatchmakingState(const QString &state);
};

#include "AppController.h"

AppController::AppController(QObject *parent)
    : QObject(parent)
{
    m_matchmakingTimer.setInterval(1000);
    connect(&m_matchmakingTimer, &QTimer::timeout, this, &AppController::matchmakingTick);
}

QString AppController::queueStatus() const
{
    if (m_matchmakingState == QStringLiteral("searching"))
        return QStringLiteral("OPEN QUEUE LOBBY");
    if (m_matchmakingState == QStringLiteral("readyCheck"))
        return QStringLiteral("MATCH FOUND");
    if (m_matchmakingState == QStringLiteral("lobby") || m_matchmakingState == QStringLiteral("inMatch"))
        return QStringLiteral("OPEN MATCH ROOM");
    return QStringLiteral("START RANKED QUEUE");
}

void AppController::toggleQueue()
{
    if (m_matchmakingState != QStringLiteral("idle")) {
        emit toastRequested(QStringLiteral("Matchmaking active"),
                            QStringLiteral("Your active queue or match room is shown below."),
                            QStringLiteral("cyan"));
        return;
    }

    m_queueActive = true;
    m_queueSeconds = 0;
    m_playersFound = 1;
    m_readyPlayers = 0;
    m_readySecondsLeft = 20;
    m_localPlayerReady = false;
    setMatchmakingState(QStringLiteral("searching"));
    m_matchmakingTimer.start();
    emit queueActiveChanged();
    emit toastRequested(QStringLiteral("Ranked queue started"),
                        QStringLiteral("4v4 CDL · EU West · Champion skill pool"),
                        QStringLiteral("cyan"));
}

QString AppController::searchRange() const
{
    if (m_queueSeconds < 6)
        return QStringLiteral("8.500 – 9.000 SR");
    if (m_queueSeconds < 11)
        return QStringLiteral("8.250 – 9.250 SR");
    return QStringLiteral("7.900 – 9.500 SR");
}

void AppController::setMatchmakingState(const QString &state)
{
    m_matchmakingState = state;
    emit matchmakingChanged();
    emit queueActiveChanged();
}

void AppController::matchmakingTick()
{
    if (m_matchmakingState == QStringLiteral("searching")) {
        ++m_queueSeconds;
        const int stagedPlayers = 1 + m_queueSeconds / 2;
        m_playersFound = qMin(8, stagedPlayers);
        if (m_queueSeconds >= 13) {
            m_playersFound = 8;
            m_readyPlayers = 5;
            m_readySecondsLeft = 20;
            setMatchmakingState(QStringLiteral("readyCheck"));
            emit toastRequested(QStringLiteral("MATCH FOUND"),
                                QStringLiteral("Accept within 20 seconds."),
                                QStringLiteral("green"));
            return;
        }
        emit matchmakingChanged();
        return;
    }

    if (m_matchmakingState == QStringLiteral("readyCheck")) {
        --m_readySecondsLeft;
        if (m_localPlayerReady && m_readyPlayers < 8)
            ++m_readyPlayers;
        if (m_readyPlayers >= 8) {
            m_readyPlayers = 8;
            setMatchmakingState(QStringLiteral("lobby"));
            m_matchmakingTimer.stop();
            emit toastRequested(QStringLiteral("Match room ready"),
                                QStringLiteral("All players are ready. The match room is open."),
                                QStringLiteral("green"));
            return;
        }
        if (m_readySecondsLeft <= 0) {
            leaveQueue();
            emit toastRequested(QStringLiteral("Ready check expired"),
                                QStringLiteral("Not every player accepted. Queue cancelled."),
                                QStringLiteral("orange"));
            return;
        }
        emit matchmakingChanged();
        return;
    }

    if (m_matchmakingState == QStringLiteral("countdown")) {
        --m_matchCountdown;
        if (m_matchCountdown <= 0) {
            m_matchCountdown = 0;
            setMatchmakingState(QStringLiteral("inMatch"));
            m_matchmakingTimer.stop();
            emit toastRequested(QStringLiteral("MATCH LIVE"),
                                QStringLiteral("Skyline Hardpoint · Best of 5"),
                                QStringLiteral("green"));
            return;
        }
        emit matchmakingChanged();
    }
}

void AppController::leaveQueue()
{
    m_matchmakingTimer.stop();
    m_queueActive = false;
    m_queueSeconds = 0;
    m_playersFound = 0;
    m_readyPlayers = 0;
    m_readySecondsLeft = 20;
    m_localPlayerReady = false;
    setMatchmakingState(QStringLiteral("idle"));
    emit toastRequested(QStringLiteral("Queue left"),
                        QStringLiteral("You are no longer in the ranked queue."),
                        QStringLiteral("orange"));
}

void AppController::acceptReadyCheck()
{
    if (m_matchmakingState != QStringLiteral("readyCheck") || m_localPlayerReady)
        return;
    m_localPlayerReady = true;
    ++m_readyPlayers;
    emit matchmakingChanged();
    emit toastRequested(QStringLiteral("Accepted"),
                        QStringLiteral("Waiting for the remaining players."),
                        QStringLiteral("green"));
}

void AppController::declineReadyCheck()
{
    if (m_matchmakingState == QStringLiteral("readyCheck"))
        leaveQueue();
}

void AppController::enterMatch()
{
    if (m_matchmakingState != QStringLiteral("lobby"))
        return;
    m_matchCountdown = 10;
    setMatchmakingState(QStringLiteral("countdown"));
    m_matchmakingTimer.start();
    emit toastRequested(QStringLiteral("Match starting"),
                        QStringLiteral("Get ready. The match begins in 10 seconds."),
                        QStringLiteral("cyan"));
}

void AppController::resetMatchmaking()
{
    leaveQueue();
}

bool AppController::joinTournament(const QString &tournamentName)
{
    constexpr int entryFee = 250;
    if (m_credits < entryFee) {
        emit toastRequested(QStringLiteral("Not enough credits"),
                            QStringLiteral("You need at least 250 credits."),
                            QStringLiteral("orange"));
        return false;
    }

    m_credits -= entryFee;
    emit creditsChanged();
    emit toastRequested(QStringLiteral("Registration confirmed"),
                        QStringLiteral("You are registered for %1.").arg(tournamentName),
                        QStringLiteral("green"));
    return true;
}

void AppController::addDemoCredits(int amount)
{
    if (amount <= 0)
        return;
    m_credits += amount;
    emit creditsChanged();
    emit toastRequested(QStringLiteral("Credits added"),
                        QStringLiteral("%1 demo credits were added to your wallet.").arg(amount),
                        QStringLiteral("cyan"));
}

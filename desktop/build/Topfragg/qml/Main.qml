import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Window

ApplicationWindow {
    id: window
    width: 1440
    height: 900
    minimumWidth: 1120
    minimumHeight: 700
    visible: true
    title: "Topfragg — Competitive Arena"
    color: "#0b1017"

    property int currentPage: 0
    property string pageTitle: ["Dashboard", "Tournaments", "Ranked", "Teams", "Marketplace", "Wallet", "Profiel"][currentPage]
    property color cyan: "#14d8ff"
    property color orange: "#ff8200"
    property color green: "#00ff8a"
    property color muted: "#8997aa"

    ListModel {
        id: tournamentModel
        ListElement { name: "Friday Night Clash"; mode: "4V4 CDL"; prize: "€ 500"; players: "24 / 32"; starts: "VANDAAG · 20:00"; tone: "#14d8ff"; status: "OPEN" }
        ListElement { name: "Weekend Warfare"; mode: "2V2 GUNFIGHT"; prize: "€ 250"; players: "12 / 16"; starts: "ZA · 19:30"; tone: "#ff8200"; status: "OPEN" }
        ListElement { name: "Elite Series Qualifier"; mode: "4V4 HARDPOINT"; prize: "€ 1.250"; players: "28 / 32"; starts: "ZO · 18:00"; tone: "#b469ff"; status: "BIJNA VOL" }
        ListElement { name: "Rookie Rumble"; mode: "1V1"; prize: "1.000 CR"; players: "44 / 64"; starts: "MA · 20:00"; tone: "#00ff8a"; status: "OPEN" }
    }

    Rectangle {
        anchors.fill: parent
        color: "#0b1017"

        Rectangle {
            width: 620; height: 620; radius: 310
            x: -300; y: -360
            color: "#102e3b"; opacity: .32
            SequentialAnimation on opacity {
                loops: Animation.Infinite
                NumberAnimation { to: .16; duration: 2400; easing.type: Easing.InOutSine }
                NumberAnimation { to: .32; duration: 2400; easing.type: Easing.InOutSine }
            }
        }
        Rectangle {
            width: 500; height: 500; radius: 250
            anchors.right: parent.right; anchors.rightMargin: -260; y: -280
            color: "#39220f"; opacity: .2
        }

        RowLayout {
            anchors.fill: parent
            spacing: 0

            Rectangle {
                id: sidebar
                Layout.preferredWidth: 236
                Layout.fillHeight: true
                color: "#0d141d"
                border.color: "#202b38"

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 14
                    spacing: 5

                    Item {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 82
                        Image {
                            anchors.left: parent.left
                            anchors.verticalCenter: parent.verticalCenter
                            source: "../assets/topfragg-logo.svg"
                            sourceSize.width: 190
                            sourceSize.height: 51
                            width: 190; height: 51
                            fillMode: Image.PreserveAspectFit
                        }
                    }

                    Text {
                        text: "ARENA"
                        color: "#546274"
                        font.pixelSize: 9
                        font.bold: true
                        font.letterSpacing: 1.8
                        leftPadding: 14
                        Layout.topMargin: 5
                        Layout.bottomMargin: 3
                    }

                    Repeater {
                        model: [
                            { label: "Dashboard", icon: "⌂" },
                            { label: "Tournaments", icon: "♜" },
                            { label: "Ranked", icon: "▲" },
                            { label: "Teams", icon: "◆" },
                            { label: "Marketplace", icon: "◇" },
                            { label: "Wallet", icon: "◉" }
                        ]
                        NavItem {
                            required property var modelData
                            required property int index
                            Layout.fillWidth: true
                            text: modelData.label
                            symbol: modelData.icon
                            selected: window.currentPage === index
                            onSelectedByUser: {
                                window.currentPage = index
                                contentFader.restart()
                            }
                        }
                    }

                    Item { Layout.fillHeight: true }

                    GlassCard {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 92
                        accent: window.cyan
                        glow: true
                        Column {
                            anchors.fill: parent
                            anchors.margins: 13
                            spacing: 8
                            Row {
                                spacing: 8
                                Rectangle { width: 8; height: 8; radius: 4; color: window.green; anchors.verticalCenter: parent.verticalCenter }
                                Text { text: "SERVERS ONLINE"; color: "#d9e4ef"; font.pixelSize: 10; font.bold: true }
                            }
                            Text { text: "1.284 spelers actief"; color: window.muted; font.pixelSize: 11 }
                            Rectangle {
                                width: parent.width; height: 3; radius: 2; color: "#25313e"
                                Rectangle { width: parent.width * .72; height: parent.height; radius: 2; color: window.cyan }
                            }
                        }
                    }

                    NavItem {
                        Layout.fillWidth: true
                        text: "Profiel"
                        symbol: "●"
                        selected: window.currentPage === 6
                        onSelectedByUser: { window.currentPage = 6; contentFader.restart() }
                    }
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                spacing: 0

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 72
                    color: "#0e151e"
                    border.color: "#202b38"

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 30
                        anchors.rightMargin: 30

                        Column {
                            spacing: 2
                            Text { text: window.pageTitle.toUpperCase(); color: "#ffffff"; font.pixelSize: 17; font.bold: true; font.letterSpacing: .5 }
                            Text { text: "COMPETE · CLIMB · CONQUER"; color: "#617186"; font.pixelSize: 9; font.bold: true; font.letterSpacing: 1.6 }
                        }
                        Item { Layout.fillWidth: true }
                        Rectangle {
                            width: 138; height: 38; radius: 10; color: "#161f2a"; border.color: "#293747"
                            Row {
                                anchors.centerIn: parent; spacing: 8
                                Text { text: "◈"; color: window.orange; font.pixelSize: 15; font.bold: true }
                                Text { text: appController.credits.toLocaleString(Qt.locale("nl_NL"), "f", 0); color: "#ffffff"; font.pixelSize: 13; font.bold: true }
                                Text { text: "CR"; color: "#69798d"; font.pixelSize: 9; font.bold: true; anchors.baseline: parent.children[1].baseline }
                            }
                        }
                        Rectangle {
                            width: 1; height: 28; color: "#283443"
                        }
                        Rectangle {
                            width: 38; height: 38; radius: 19
                            color: "#132b35"; border.color: "#236177"
                            Text { anchors.centerIn: parent; text: "LF"; color: window.cyan; font.bold: true; font.pixelSize: 12 }
                        }
                        Column {
                            Text { text: "LIVAO"; color: "#e9f3fc"; font.pixelSize: 11; font.bold: true }
                            Text { text: "LEVEL 42"; color: window.cyan; font.pixelSize: 9; font.bold: true }
                        }
                    }
                }

                Item {
                    Layout.fillWidth: true
                    Layout.fillHeight: true

                    StackLayout {
                        id: stack
                        anchors.fill: parent
                        currentIndex: window.currentPage

                        DashboardPage {}
                        TournamentsPage {}
                        RankedPage {}
                        TeamsPage {}
                        MarketplacePage {}
                        WalletPage {}
                        ProfilePage {}
                    }

                    NumberAnimation {
                        id: contentFader
                        target: stack
                        property: "opacity"
                        from: .25; to: 1
                        duration: 240
                        easing.type: Easing.OutCubic
                    }
                }
            }
        }
    }

    component Page: Flickable {
        id: pageRoot
        clip: true
        contentWidth: width
        contentHeight: pageContent.implicitHeight + 64
        ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
        default property alias pageData: pageContent.data
        Column {
            id: pageContent
            width: Math.min(pageRoot.width - 64, 1280)
            x: (pageRoot.width - width) / 2
            y: 32
            spacing: 22
        }
    }

    component SectionTitle: RowLayout {
        property alias title: mainTitle.text
        property alias subtitle: subTitle.text
        width: parent ? parent.width : 600
        Column {
            spacing: 3
            Text { id: mainTitle; color: "#ffffff"; font.pixelSize: 19; font.bold: true }
            Text { id: subTitle; color: window.muted; font.pixelSize: 11 }
        }
        Item { Layout.fillWidth: true }
    }

    component DashboardPage: Page {
        GlassCard {
            width: parent.width
            height: 218
            accent: window.cyan
            glow: true
            clip: true

            Rectangle {
                width: 440; height: 440; radius: 220
                anchors.right: parent.right; anchors.rightMargin: -80
                anchors.verticalCenter: parent.verticalCenter
                color: "#0b4a5c"; opacity: .33
                RotationAnimation on rotation { from: 0; to: 360; duration: 22000; loops: Animation.Infinite }
            }
            Rectangle {
                width: 240; height: 240; radius: 120
                anchors.right: parent.right; anchors.rightMargin: 110
                anchors.verticalCenter: parent.verticalCenter
                color: "transparent"; border.width: 2; border.color: "#19556a"; opacity: .65
            }
            Image {
                source: "../assets/rank-champion.png"
                width: 175; height: 175
                anchors.right: parent.right; anchors.rightMargin: 145
                anchors.verticalCenter: parent.verticalCenter
                fillMode: Image.PreserveAspectFit
                SequentialAnimation on y {
                    loops: Animation.Infinite
                    NumberAnimation { to: parent.height / 2 - height / 2 - 6; duration: 1600; easing.type: Easing.InOutSine }
                    NumberAnimation { to: parent.height / 2 - height / 2 + 6; duration: 1600; easing.type: Easing.InOutSine }
                }
            }
            Column {
                anchors.left: parent.left; anchors.leftMargin: 28
                anchors.verticalCenter: parent.verticalCenter
                spacing: 10
                Text { text: "WELKOM TERUG, LIVAO"; color: window.cyan; font.pixelSize: 11; font.bold: true; font.letterSpacing: 1.5 }
                Text { text: "Klaar voor je volgende win?"; color: "#ffffff"; font.pixelSize: 30; font.bold: true }
                Text { text: "Je bent nog 128 SR verwijderd van Champion III."; color: "#91a1b4"; font.pixelSize: 13 }
                AppButton {
                    text: appController.queueStatus
                    accent: window.cyan
                    busy: appController.queueActive
                    width: 210
                    onClicked: appController.toggleQueue()
                }
            }
        }

        GridLayout {
            width: parent.width
            columns: 4
            columnSpacing: 14
            StatCard { Layout.fillWidth: true; label: "Skill rating"; value: "8.742"; footnote: "+126 deze week"; symbol: "▲"; accent: window.cyan; glow: true }
            StatCard { Layout.fillWidth: true; label: "Win rate"; value: "68%"; footnote: "34 wins · 16 losses"; symbol: "◒"; accent: window.green }
            StatCard { Layout.fillWidth: true; label: "K/D ratio"; value: "1.42"; footnote: "Top 8%"; symbol: "✦"; accent: window.orange }
            StatCard { Layout.fillWidth: true; label: "Current streak"; value: "5 W"; footnote: "Persoonlijk record: 9"; symbol: "⚡"; accent: "#b469ff" }
        }

        SectionTitle { title: "Live in de arena"; subtitle: "Wedstrijden en toernooien die nu aandacht verdienen" }

        Row {
            width: parent.width
            spacing: 16
            Repeater {
                model: 3
                GlassCard {
                    required property int index
                    width: (parent.width - 32) / 3
                    height: 178
                    interactive: true
                    accent: index === 0 ? window.cyan : (index === 1 ? window.orange : "#b469ff")
                    Column {
                        anchors.fill: parent; anchors.margins: 18; spacing: 10
                        Row {
                            width: parent.width
                            Rectangle { width: 7; height: 7; radius: 4; color: index === 2 ? window.orange : window.green; anchors.verticalCenter: parent.verticalCenter }
                            Text { text: index === 2 ? " START OVER 24 MIN" : " LIVE"; color: index === 2 ? window.orange : window.green; font.pixelSize: 9; font.bold: true }
                        }
                        Text { text: ["Friday Night Clash", "Ranked Pro Division", "Elite Series Qualifier"][index]; color: "#ffffff"; font.pixelSize: 16; font.bold: true }
                        Text { text: ["NOVA  2  —  1  VORTEX", "KRYPTIC  184 — 176  ECHO", "32 TEAMS · € 1.250 PRIZE"][index]; color: "#a6b4c4"; font.pixelSize: 11; font.bold: true }
                        Item { width: 1; height: 5 }
                        Rectangle { width: parent.width; height: 1; color: "#2b3746" }
                        Text { text: ["Map 4 · Hardpoint", "Map 3 · Control", "Check-in is geopend"][index]; color: "#69798d"; font.pixelSize: 10 }
                    }
                }
            }
        }
    }

    component TournamentsPage: Page {
        RowLayout {
            width: parent.width
            Column {
                spacing: 5
                Text { text: "TOURNAMENTS"; color: "#ffffff"; font.pixelSize: 29; font.bold: true }
                Text { text: "Speel voor glorie, credits en cashprijzen."; color: window.muted; font.pixelSize: 12 }
            }
            Item { Layout.fillWidth: true }
            AppButton { text: "MIJN TOERNOOIEN"; outlined: true; accent: window.cyan }
        }

        Row {
            width: parent.width
            spacing: 10
            Repeater {
                model: ["ALLE", "VANDAAG", "DEZE WEEK", "GRATIS"]
                AppButton {
                    required property string modelData
                    required property int index
                    text: modelData
                    width: index === 2 ? 122 : 92
                    height: 36
                    outlined: index !== 0
                    accent: index === 0 ? window.cyan : "#526276"
                }
            }
        }

        Repeater {
            model: tournamentModel
            GlassCard {
                required property int index
                required property string name
                required property string mode
                required property string prize
                required property string players
                required property string starts
                required property string tone
                required property string status
                width: parent.width
                height: 138
                interactive: true
                accent: tone
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 20
                    spacing: 18
                    Rectangle {
                        width: 78; height: 78; radius: 18
                        color: Qt.rgba(parent.parent.accent.r, parent.parent.accent.g, parent.parent.accent.b, .1)
                        border.color: Qt.rgba(parent.parent.accent.r, parent.parent.accent.g, parent.parent.accent.b, .25)
                        Text { anchors.centerIn: parent; text: "♜"; color: parent.parent.parent.accent; font.pixelSize: 30 }
                    }
                    Column {
                        Layout.preferredWidth: 290
                        spacing: 7
                        Row {
                            spacing: 9
                            Text { text: name; color: "#ffffff"; font.pixelSize: 17; font.bold: true }
                            Rectangle {
                                width: statusText.width + 14; height: 20; radius: 5
                                color: "#173029"
                                Text { id: statusText; anchors.centerIn: parent; text: status; color: window.green; font.pixelSize: 8; font.bold: true }
                            }
                        }
                        Text { text: mode + "  ·  CROSSPLAY"; color: "#718196"; font.pixelSize: 10; font.bold: true; font.letterSpacing: .6 }
                        Text { text: "Double elimination · Best of 5"; color: "#526175"; font.pixelSize: 10 }
                    }
                    Item { Layout.fillWidth: true }
                    Column {
                        spacing: 4
                        Text { text: "PRIZE POOL"; color: "#617085"; font.pixelSize: 9; font.bold: true }
                        Text { text: prize; color: tone; font.pixelSize: 17; font.bold: true }
                    }
                    Column {
                        spacing: 4
                        Text { text: "DEELNEMERS"; color: "#617085"; font.pixelSize: 9; font.bold: true }
                        Text { text: players; color: "#e9f2fb"; font.pixelSize: 14; font.bold: true }
                    }
                    Column {
                        spacing: 4
                        Text { text: "START"; color: "#617085"; font.pixelSize: 9; font.bold: true }
                        Text { text: starts; color: "#e9f2fb"; font.pixelSize: 12; font.bold: true }
                    }
                    AppButton {
                        text: "INSCHRIJVEN · 250 CR"
                        width: 172
                        accent: tone
                        onClicked: {
                            joinDialog.tournamentName = name
                            joinDialog.open()
                        }
                    }
                }
            }
        }
    }

    component RankedPage: Page {
        GlassCard {
            width: parent.width; height: 270; accent: "#e54b5f"; glow: true
            RowLayout {
                anchors.fill: parent; anchors.margins: 30; spacing: 28
                Image {
                    source: "../assets/rank-champion.png"
                    Layout.preferredWidth: 205; Layout.preferredHeight: 205
                    fillMode: Image.PreserveAspectFit
                }
                Column {
                    Layout.fillWidth: true; spacing: 9
                    Text { text: "CHAMPION II"; color: "#ffffff"; font.pixelSize: 29; font.bold: true }
                    Text { text: "8.742 SKILL RATING"; color: "#e26b79"; font.pixelSize: 12; font.bold: true; font.letterSpacing: 1.3 }
                    Rectangle {
                        width: Math.min(parent.width, 480); height: 8; radius: 4; color: "#2a3340"
                        Rectangle {
                            width: parent.width * .72
                            height: parent.height
                            radius: 4
                            gradient: Gradient {
                                GradientStop { position: 0; color: "#d52b48" }
                                GradientStop { position: 1; color: "#ff7d8b" }
                            }
                        }
                    }
                    Text { text: "128 SR tot Champion III"; color: "#7f8fa3"; font.pixelSize: 11 }
                    AppButton { text: appController.queueStatus; busy: appController.queueActive; accent: window.cyan; width: 225; onClicked: appController.toggleQueue() }
                }
                Column {
                    spacing: 12
                    Text { text: "SEIZOEN 4"; color: "#607084"; font.pixelSize: 10; font.bold: true }
                    Text { text: "# 2.184"; color: "#ffffff"; font.pixelSize: 27; font.bold: true }
                    Text { text: "GLOBAL RANK"; color: "#607084"; font.pixelSize: 9; font.bold: true }
                }
            }
        }

        GlassCard {
            width: parent.width
            height: visible ? 238 : 0
            visible: appController.matchmakingState === "searching"
            accent: window.cyan
            glow: true
            clip: true

            Rectangle {
                width: 260; height: 260; radius: 130
                anchors.centerIn: parent
                color: "transparent"
                border.width: 2
                border.color: "#1c5c70"
                opacity: .55
                RotationAnimation on rotation { from: 0; to: 360; duration: 5000; loops: Animation.Infinite }
                Rectangle { width: 10; height: 10; radius: 5; color: window.cyan; anchors.top: parent.top; anchors.horizontalCenter: parent.horizontalCenter }
            }

            RowLayout {
                anchors.fill: parent
                anchors.margins: 25
                spacing: 25

                Column {
                    Layout.preferredWidth: 230
                    spacing: 8
                    Text { text: "RANKED QUEUE LOBBY"; color: window.cyan; font.pixelSize: 10; font.bold: true; font.letterSpacing: 1.5 }
                    Text {
                        text: Math.floor(appController.queueSeconds / 60).toString().padStart(2, "0") + ":" + (appController.queueSeconds % 60).toString().padStart(2, "0")
                        color: "#ffffff"; font.pixelSize: 38; font.bold: true
                    }
                    Text { text: "4V4 CDL · EU WEST"; color: "#8c9caf"; font.pixelSize: 11; font.bold: true }
                    Text { text: "Geschatte wachttijd  00:18"; color: "#5e7085"; font.pixelSize: 10 }
                }

                Column {
                    Layout.fillWidth: true
                    spacing: 12
                    RowLayout {
                        width: parent.width
                        Text { text: "SPELERS GEVONDEN"; color: "#738399"; font.pixelSize: 9; font.bold: true }
                        Item { Layout.fillWidth: true }
                        Text { text: appController.playersFound + " / 8"; color: window.cyan; font.pixelSize: 12; font.bold: true }
                    }
                    Row {
                        spacing: 9
                        Repeater {
                            model: 8
                            Rectangle {
                                required property int index
                                width: 42; height: 42; radius: 12
                                color: index < appController.playersFound ? "#153847" : "#111923"
                                border.color: index < appController.playersFound ? "#23738b" : "#2b3745"
                                Text { anchors.centerIn: parent; text: index === 0 ? "LF" : (index < appController.playersFound ? "✓" : "·"); color: index < appController.playersFound ? window.cyan : "#4c5a6b"; font.bold: true }
                                SequentialAnimation on scale {
                                    running: index === appController.playersFound - 1
                                    loops: Animation.Infinite
                                    NumberAnimation { to: 1.08; duration: 500 }
                                    NumberAnimation { to: 1; duration: 500 }
                                }
                            }
                        }
                    }
                    Rectangle {
                        width: parent.width; height: 7; radius: 4; color: "#25313e"
                        Rectangle {
                            width: parent.width * (appController.playersFound / 8)
                            height: parent.height; radius: 4; color: window.cyan
                            Behavior on width { NumberAnimation { duration: 300; easing.type: Easing.OutCubic } }
                        }
                    }
                    RowLayout {
                        width: parent.width
                        Text { text: "SKILL POOL  " + appController.searchRange; color: "#66788d"; font.pixelSize: 9; font.bold: true }
                        Item { Layout.fillWidth: true }
                        Text { text: appController.queueSeconds < 6 ? "PRIORITY MATCHING" : "ZOEKGEBIED VERBREED"; color: appController.queueSeconds < 6 ? window.green : window.orange; font.pixelSize: 9; font.bold: true }
                    }
                }

                AppButton { text: "QUEUE VERLATEN"; outlined: true; accent: "#ff596a"; width: 150; onClicked: appController.leaveQueue() }
            }
        }

        GlassCard {
            width: parent.width
            height: visible ? 376 : 0
            visible: appController.matchmakingState === "lobby" || appController.matchmakingState === "inMatch"
            accent: window.green
            glow: true

            Column {
                anchors.fill: parent
                anchors.margins: 22
                spacing: 15
                RowLayout {
                    width: parent.width
                    Column {
                        Text { text: appController.matchmakingState === "inMatch" ? "MATCH IN PROGRESS" : "MATCH LOBBY"; color: appController.matchmakingState === "inMatch" ? window.orange : window.green; font.pixelSize: 10; font.bold: true; font.letterSpacing: 1.5 }
                        Text { text: "TF-RNK-28491  ·  4V4 CDL  ·  BEST OF 5"; color: "#ffffff"; font.pixelSize: 18; font.bold: true }
                    }
                    Item { Layout.fillWidth: true }
                    Rectangle {
                        width: 160; height: 38; radius: 9; color: "#16232b"; border.color: "#2d4854"
                        Text { anchors.centerIn: parent; text: "EU WEST · 24 MS"; color: window.cyan; font.pixelSize: 10; font.bold: true }
                    }
                }
                Rectangle { width: parent.width; height: 1; color: "#293644" }
                Row {
                    width: parent.width
                    spacing: 18
                    Column {
                        width: (parent.width - 18) / 2
                        spacing: 8
                        Text { text: "TEAM ALPHA"; color: window.cyan; font.pixelSize: 10; font.bold: true }
                        Repeater {
                            model: [
                                { name: "Livao", sr: "8.742 SR", role: "CAPTAIN" },
                                { name: "Vexor", sr: "8.510 SR", role: "SMG" },
                                { name: "Kyro", sr: "8.284 SR", role: "AR" },
                                { name: "Norz", sr: "7.996 SR", role: "FLEX" }
                            ]
                            Rectangle {
                                required property var modelData
                                width: parent.width; height: 40; radius: 8; color: "#121c26"; border.color: "#263442"
                                RowLayout {
                                    anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12
                                    Rectangle { width: 7; height: 7; radius: 4; color: window.green }
                                    Text { text: modelData.name; color: "#eaf3fc"; font.pixelSize: 11; font.bold: true; Layout.fillWidth: true }
                                    Text { text: modelData.role; color: "#617287"; font.pixelSize: 8; font.bold: true }
                                    Text { text: modelData.sr; color: window.cyan; font.pixelSize: 9; font.bold: true }
                                }
                            }
                        }
                    }
                    Column {
                        width: (parent.width - 18) / 2
                        spacing: 8
                        Text { text: "TEAM BRAVO"; color: window.orange; font.pixelSize: 10; font.bold: true }
                        Repeater {
                            model: [
                                { name: "Ravage", sr: "8.631 SR", role: "CAPTAIN" },
                                { name: "Echo", sr: "8.448 SR", role: "AR" },
                                { name: "Nexus", sr: "8.190 SR", role: "SMG" },
                                { name: "Frost", sr: "8.021 SR", role: "FLEX" }
                            ]
                            Rectangle {
                                required property var modelData
                                width: parent.width; height: 40; radius: 8; color: "#121c26"; border.color: "#263442"
                                RowLayout {
                                    anchors.fill: parent; anchors.leftMargin: 12; anchors.rightMargin: 12
                                    Rectangle { width: 7; height: 7; radius: 4; color: window.green }
                                    Text { text: modelData.name; color: "#eaf3fc"; font.pixelSize: 11; font.bold: true; Layout.fillWidth: true }
                                    Text { text: modelData.role; color: "#617287"; font.pixelSize: 8; font.bold: true }
                                    Text { text: modelData.sr; color: window.orange; font.pixelSize: 9; font.bold: true }
                                }
                            }
                        }
                    }
                }
                RowLayout {
                    width: parent.width
                    Text { text: "MAP 1  SKYLINE · HARDPOINT"; color: "#8c9caf"; font.pixelSize: 10; font.bold: true }
                    Item { Layout.fillWidth: true }
                    AppButton {
                        text: appController.matchmakingState === "inMatch" ? "MATCH ACTIEF" : "START MATCH"
                        accent: appController.matchmakingState === "inMatch" ? window.orange : window.green
                        enabled: appController.matchmakingState !== "inMatch"
                        width: 160
                        onClicked: appController.enterMatch()
                    }
                }
            }
        }

        SectionTitle { title: "Recente wedstrijden"; subtitle: "Jouw laatste competitive resultaten" }
        Repeater {
            model: [
                { result: "WIN", score: "250 — 218", map: "Skyline · Hardpoint", delta: "+32 SR", color: "#00ff8a" },
                { result: "WIN", score: "3 — 1", map: "Protocol · Control", delta: "+28 SR", color: "#00ff8a" },
                { result: "LOSS", score: "4 — 6", map: "Red Card · S&D", delta: "−19 SR", color: "#ff596a" }
            ]
            GlassCard {
                required property var modelData
                width: parent.width; height: 72
                RowLayout {
                    anchors.fill: parent; anchors.margins: 17
                    Text { text: modelData.result; color: modelData.color; font.pixelSize: 11; font.bold: true; Layout.preferredWidth: 64 }
                    Text { text: modelData.score; color: "#ffffff"; font.pixelSize: 15; font.bold: true; Layout.preferredWidth: 120 }
                    Text { text: modelData.map; color: "#8291a4"; font.pixelSize: 11; Layout.fillWidth: true }
                    Text { text: modelData.delta; color: modelData.color; font.pixelSize: 12; font.bold: true }
                }
            }
        }
    }

    component TeamsPage: Page {
        SectionTitle { title: "Mijn team"; subtitle: "Beheer je roster en maak je klaar voor de arena" }
        GlassCard {
            width: parent.width; height: 190; accent: window.cyan; glow: true
            RowLayout {
                anchors.fill: parent; anchors.margins: 25
                Rectangle { width: 92; height: 92; radius: 24; color: "#102f3a"; border.color: "#246177"; Text { anchors.centerIn: parent; text: "NV"; color: window.cyan; font.pixelSize: 28; font.bold: true } }
                Column {
                    spacing: 7
                    Text { text: "NOVA ESPORTS"; color: "#ffffff"; font.pixelSize: 23; font.bold: true }
                    Text { text: "EUROPE  ·  SINDS 2025"; color: "#68798d"; font.pixelSize: 10; font.bold: true }
                    Text { text: "Team rating 8.390  ·  72% win rate"; color: "#9aabba"; font.pixelSize: 11 }
                }
                Item { Layout.fillWidth: true }
                AppButton { text: "TEAM BEHEREN"; outlined: true; accent: window.cyan }
            }
        }
        SectionTitle { title: "Actieve roster"; subtitle: "4 van 6 spelers" }
        Grid {
            width: parent.width; columns: 2; spacing: 14
            Repeater {
                model: [
                    { initials: "LF", name: "Livao", role: "CAPTAIN · AR", rank: "8.742 SR" },
                    { initials: "VX", name: "Vexor", role: "SMG · ENTRY", rank: "8.510 SR" },
                    { initials: "KY", name: "Kyro", role: "AR · FLEX", rank: "8.284 SR" },
                    { initials: "NZ", name: "Norz", role: "SMG · OBJ", rank: "7.996 SR" }
                ]
                GlassCard {
                    required property var modelData
                    width: (parent.width - 14) / 2; height: 92; interactive: true
                    Row {
                        anchors.fill: parent; anchors.margins: 16; spacing: 14
                        Rectangle { width: 54; height: 54; radius: 16; color: "#192f3b"; Text { anchors.centerIn: parent; text: modelData.initials; color: window.cyan; font.bold: true } }
                        Column {
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: 4
                            Text { text: modelData.name; color: "#ffffff"; font.pixelSize: 14; font.bold: true }
                            Text { text: modelData.role; color: "#69798c"; font.pixelSize: 9; font.bold: true }
                            Text { text: modelData.rank; color: window.cyan; font.pixelSize: 10; font.bold: true }
                        }
                    }
                }
            }
        }
    }

    component MarketplacePage: Page {
        SectionTitle { title: "Marketplace"; subtitle: "Items, badges en exclusieve cosmetics" }
        Grid {
            width: parent.width; columns: 3; spacing: 16
            Repeater {
                model: [
                    { name: "Cyan Pulse", type: "LEGENDARY CALLING CARD", price: "1.250 CR", color: "#14d8ff" },
                    { name: "Ember Crown", type: "MYTHIC EMBLEM", price: "2.400 CR", color: "#ff8200" },
                    { name: "Arena Founder", type: "EXCLUSIVE BADGE", price: "950 CR", color: "#b469ff" },
                    { name: "Viper Green", type: "PROFILE THEME", price: "750 CR", color: "#00ff8a" },
                    { name: "Champion Pack", type: "RANKED BUNDLE", price: "3.200 CR", color: "#ff5268" },
                    { name: "Clean Slate", type: "NAME EFFECT", price: "600 CR", color: "#e6f2ff" }
                ]
                GlassCard {
                    required property var modelData
                    width: (parent.width - 32) / 3; height: 226; interactive: true; accent: modelData.color
                    Rectangle {
                        anchors.left: parent.left; anchors.right: parent.right; anchors.top: parent.top
                        anchors.margins: 14; height: 112; radius: 12
                        gradient: Gradient {
                            GradientStop { position: 0; color: Qt.rgba(parent.accent.r, parent.accent.g, parent.accent.b, .22) }
                            GradientStop { position: 1; color: "#101721" }
                        }
                        Text { anchors.centerIn: parent; text: "✦"; color: modelData.color; font.pixelSize: 44 }
                    }
                    Column {
                        anchors.left: parent.left; anchors.leftMargin: 17; anchors.bottom: parent.bottom; anchors.bottomMargin: 16; spacing: 5
                        Text { text: modelData.type; color: modelData.color; font.pixelSize: 8; font.bold: true }
                        Text { text: modelData.name; color: "#ffffff"; font.pixelSize: 15; font.bold: true }
                        Text { text: modelData.price; color: "#9dadbe"; font.pixelSize: 11; font.bold: true }
                    }
                }
            }
        }
    }

    component WalletPage: Page {
        SectionTitle { title: "Wallet"; subtitle: "Beheer je Topfragg credits en transacties" }
        Row {
            width: parent.width; spacing: 16
            GlassCard {
                width: (parent.width - 16) * .58; height: 180; accent: window.orange; glow: true
                Column {
                    anchors.fill: parent
                    anchors.margins: 24
                    spacing: 8
                    Text { text: "BESCHIKBAAR SALDO"; color: "#748499"; font.pixelSize: 10; font.bold: true }
                    Text { text: appController.credits.toLocaleString(Qt.locale("nl_NL"), "f", 0) + " CR"; color: "#ffffff"; font.pixelSize: 34; font.bold: true }
                    Text { text: "Geschatte waarde  € " + (appController.credits / 100).toFixed(2); color: "#7e8fa3"; font.pixelSize: 11 }
                    AppButton { text: "DEMO +1.000 CR"; accent: window.orange; width: 170; onClicked: appController.addDemoCredits(1000) }
                }
            }
            GlassCard {
                width: (parent.width - 16) * .42; height: 180
                Column {
                    anchors.fill: parent
                    anchors.margins: 24
                    spacing: 10
                    Text { text: "DEZE MAAND"; color: "#748499"; font.pixelSize: 10; font.bold: true }
                    Text { text: "+ 3.480 CR"; color: window.green; font.pixelSize: 23; font.bold: true }
                    Text { text: "− 1.750 CR uitgegeven"; color: "#ff6676"; font.pixelSize: 11 }
                    Text { text: "12 transacties"; color: "#6f8094"; font.pixelSize: 10 }
                }
            }
        }
        SectionTitle { title: "Recente transacties"; subtitle: "Laatste activiteit" }
        Repeater {
            model: [
                { title: "Tournament entry", date: "Vandaag · 18:42", amount: "− 250 CR", color: "#ff6676" },
                { title: "Ranked weekly reward", date: "Gisteren · 09:00", amount: "+ 800 CR", color: "#00ff8a" },
                { title: "Cyan Pulse verkocht", date: "25 juli · 21:16", amount: "+ 1.150 CR", color: "#00ff8a" }
            ]
            GlassCard {
                required property var modelData
                width: parent.width; height: 68
                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 16
                    Column {
                        Text { text: modelData.title; color: "#eaf2fa"; font.pixelSize: 12; font.bold: true }
                        Text { text: modelData.date; color: "#66768a"; font.pixelSize: 9 }
                    }
                    Item { Layout.fillWidth: true }
                    Text { text: modelData.amount; color: modelData.color; font.pixelSize: 12; font.bold: true }
                }
            }
        }
    }

    component ProfilePage: Page {
        GlassCard {
            width: parent.width; height: 220; accent: window.cyan; glow: true
            RowLayout {
                anchors.fill: parent; anchors.margins: 28; spacing: 24
                Rectangle { width: 118; height: 118; radius: 32; color: "#102d38"; border.width: 2; border.color: "#24657b"; Text { anchors.centerIn: parent; text: "LF"; color: window.cyan; font.pixelSize: 34; font.bold: true } }
                Column {
                    spacing: 7
                    Text { text: "LIVAO"; color: "#ffffff"; font.pixelSize: 26; font.bold: true }
                    Text { text: "@livao  ·  NEDERLAND"; color: "#718196"; font.pixelSize: 10; font.bold: true }
                    Text { text: "Competitive player · Nova Esports"; color: "#a0afbf"; font.pixelSize: 12 }
                    Row {
                        spacing: 7
                        Rectangle {
                            width: 75; height: 23; radius: 6; color: "#17352e"
                            Text { anchors.centerIn: parent; text: "VERIFIED"; color: window.green; font.pixelSize: 8; font.bold: true }
                        }
                        Rectangle {
                            width: 72; height: 23; radius: 6; color: "#30270f"
                            Text { anchors.centerIn: parent; text: "PREMIUM"; color: "#ffc04b"; font.pixelSize: 8; font.bold: true }
                        }
                    }
                }
                Item { Layout.fillWidth: true }
                AppButton { text: "PROFIEL BEWERKEN"; outlined: true; accent: window.cyan }
            }
        }
        GridLayout {
            width: parent.width; columns: 4; columnSpacing: 14
            StatCard { Layout.fillWidth: true; label: "Level"; value: "42"; footnote: "18.420 / 20.000 XP"; symbol: "✦"; accent: window.cyan }
            StatCard { Layout.fillWidth: true; label: "Matches"; value: "486"; footnote: "Sinds jan. 2025"; symbol: "◇"; accent: window.orange }
            StatCard { Layout.fillWidth: true; label: "Wins"; value: "331"; footnote: "68% win rate"; symbol: "✓"; accent: window.green }
            StatCard { Layout.fillWidth: true; label: "Trophies"; value: "17"; footnote: "3 gold"; symbol: "♜"; accent: "#ffc44d" }
        }
        SectionTitle { title: "Trofeeënkast"; subtitle: "Jouw beste prestaties" }
        Row {
            width: parent.width; spacing: 16
            Repeater {
                model: [
                    { image: "../assets/trophy-gold.png", label: "FRIDAY CLASH", date: "WINNAAR · JULI 2026" },
                    { image: "../assets/trophy-silver.png", label: "ELITE SERIES", date: "TWEEDE · JUNI 2026" },
                    { image: "../assets/trophy-bronze.png", label: "WEEKEND WARFARE", date: "DERDE · MEI 2026" }
                ]
                GlassCard {
                    required property var modelData
                    width: (parent.width - 32) / 3; height: 188; interactive: true
                    Image { source: modelData.image; width: 92; height: 92; anchors.horizontalCenter: parent.horizontalCenter; anchors.top: parent.top; anchors.topMargin: 14; fillMode: Image.PreserveAspectFit }
                    Text { text: modelData.label; color: "#ffffff"; font.pixelSize: 11; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: 33 }
                    Text { text: modelData.date; color: "#6d7d91"; font.pixelSize: 8; font.bold: true; anchors.horizontalCenter: parent.horizontalCenter; anchors.bottom: parent.bottom; anchors.bottomMargin: 17 }
                }
            }
        }
    }

    Rectangle {
        id: readyCheckOverlay
        anchors.fill: parent
        visible: appController.matchmakingState === "readyCheck"
        color: "#d9000509"
        z: 90

        Rectangle {
            width: 520; height: 410; radius: 24
            anchors.centerIn: parent
            color: "#141e29"
            border.width: 2
            border.color: window.green

            Rectangle {
                width: 280; height: 280; radius: 140
                anchors.centerIn: parent
                color: "#0d2c25"
                opacity: .35
                SequentialAnimation on scale {
                    loops: Animation.Infinite
                    NumberAnimation { to: 1.12; duration: 900; easing.type: Easing.InOutSine }
                    NumberAnimation { to: 1; duration: 900; easing.type: Easing.InOutSine }
                }
            }

            Column {
                anchors.fill: parent
                anchors.margins: 28
                spacing: 16
                Text { anchors.horizontalCenter: parent.horizontalCenter; text: "MATCH GEVONDEN"; color: window.green; font.pixelSize: 12; font.bold: true; font.letterSpacing: 2 }
                Text { anchors.horizontalCenter: parent.horizontalCenter; text: appController.readySecondsLeft; color: "#ffffff"; font.pixelSize: 54; font.bold: true }
                Text { anchors.horizontalCenter: parent.horizontalCenter; text: "4V4 CDL · EU WEST · 24 MS"; color: "#8999ab"; font.pixelSize: 11; font.bold: true }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 10
                    Repeater {
                        model: 8
                        Rectangle {
                            required property int index
                            width: 42; height: 42; radius: 21
                            color: index < appController.readyPlayers ? "#15382f" : "#17212c"
                            border.width: 1
                            border.color: index < appController.readyPlayers ? window.green : "#354252"
                            Text { anchors.centerIn: parent; text: index < appController.readyPlayers ? "✓" : (index + 1); color: index < appController.readyPlayers ? window.green : "#657489"; font.pixelSize: 11; font.bold: true }
                        }
                    }
                }
                Text { anchors.horizontalCenter: parent.horizontalCenter; text: appController.readyPlayers + " VAN 8 SPELERS READY"; color: "#728297"; font.pixelSize: 9; font.bold: true; font.letterSpacing: 1 }
                Row {
                    anchors.horizontalCenter: parent.horizontalCenter
                    spacing: 12
                    AppButton { text: "AFWIJZEN"; width: 150; outlined: true; accent: "#ff596a"; onClicked: appController.declineReadyCheck() }
                    AppButton { text: appController.readyPlayers > 5 ? "GEACCEPTEERD ✓" : "ACCEPTEREN"; width: 190; accent: window.green; onClicked: appController.acceptReadyCheck() }
                }
                Text { anchors.horizontalCenter: parent.horizontalCenter; text: "Niet accepteren annuleert deze matchmakingpoging."; color: "#56677b"; font.pixelSize: 9 }
            }
        }
    }

    Dialog {
        id: joinDialog
        property string tournamentName: ""
        anchors.centerIn: parent
        modal: true
        width: 440
        padding: 0
        background: Rectangle { radius: 18; color: "#151e29"; border.color: "#314052" }
        contentItem: Column {
            spacing: 15
            padding: 25
            Text { text: "INSCHRIJVEN"; color: window.cyan; font.pixelSize: 10; font.bold: true; font.letterSpacing: 1.4 }
            Text { text: joinDialog.tournamentName; color: "#ffffff"; font.pixelSize: 21; font.bold: true }
            Text { width: 390; wrapMode: Text.WordWrap; text: "De entry fee is 250 credits. Na bevestiging wordt je plek direct gereserveerd."; color: "#8998aa"; font.pixelSize: 12 }
            Row {
                spacing: 10
                AppButton { text: "ANNULEREN"; outlined: true; accent: "#617084"; onClicked: joinDialog.close() }
                AppButton { text: "BEVESTIGEN"; accent: window.cyan; onClicked: { if (appController.joinTournament(joinDialog.tournamentName)) joinDialog.close() } }
            }
        }
    }

    Rectangle {
        id: toast
        property string tone: "cyan"
        width: 350; height: 86; radius: 14
        x: window.width - width - 26
        y: visible ? 90 : 60
        opacity: visible ? 1 : 0
        visible: false
        color: "#18222e"
        border.color: tone === "green" ? window.green : (tone === "orange" ? window.orange : window.cyan)
        z: 100
        Column {
            anchors.fill: parent; anchors.margins: 15; spacing: 5
            Text { id: toastTitle; color: "#ffffff"; font.pixelSize: 12; font.bold: true }
            Text { id: toastMessage; color: "#8d9caf"; font.pixelSize: 10 }
        }
        Behavior on y { NumberAnimation { duration: 220; easing.type: Easing.OutCubic } }
        Behavior on opacity { NumberAnimation { duration: 180 } }
        Timer { id: toastTimer; interval: 3200; onTriggered: toast.visible = false }
    }

    Connections {
        target: appController
        function onToastRequested(title, message, tone) {
            toastTitle.text = title
            toastMessage.text = message
            toast.tone = tone
            toast.visible = true
            toastTimer.restart()
        }
    }
}

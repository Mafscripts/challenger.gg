import QtQuick

GlassCard {
    id: root
    property string label: ""
    property string value: ""
    property string footnote: ""
    property string symbol: "◆"
    property color valueColor: "#ffffff"

    implicitHeight: 116

    Row {
        anchors.fill: parent
        anchors.margins: 18
        spacing: 15
        Rectangle {
            width: 46
            height: 46
            radius: 12
            color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, .11)
            border.color: Qt.rgba(root.accent.r, root.accent.g, root.accent.b, .24)
            Text {
                anchors.centerIn: parent
                text: root.symbol
                color: root.accent
                font.pixelSize: 18
                font.bold: true
            }
        }
        Column {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 3
            Text { text: root.label.toUpperCase(); color: "#7f8da0"; font.pixelSize: 10; font.bold: true; font.letterSpacing: 1.2 }
            Text { text: root.value; color: root.valueColor; font.pixelSize: 24; font.bold: true }
            Text { text: root.footnote; color: "#657488"; font.pixelSize: 10 }
        }
    }
}

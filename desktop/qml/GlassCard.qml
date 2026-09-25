import QtQuick

Rectangle {
    property color accent: "#14d8ff"
    property bool glow: false
    property bool interactive: false
    property bool hovered: hoverArea.containsMouse

    radius: 16
    color: hovered && interactive ? "#202b38" : "#17202c"
    border.width: 1
    border.color: glow ? Qt.rgba(accent.r, accent.g, accent.b, hovered ? .48 : .26) : (hovered ? "#405063" : "#2b3747")
    scale: hovered && interactive ? 1.008 : 1

    Behavior on color { ColorAnimation { duration: 130 } }
    Behavior on border.color { ColorAnimation { duration: 130 } }
    Behavior on scale { NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }

    MouseArea {
        id: hoverArea
        anchors.fill: parent
        hoverEnabled: parent.interactive
        acceptedButtons: Qt.NoButton
    }
}

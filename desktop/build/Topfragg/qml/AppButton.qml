import QtQuick
import QtQuick.Controls

Button {
    id: control
    property color accent: "#14d8ff"
    property bool outlined: false
    property bool busy: false

    implicitHeight: 44
    implicitWidth: 150
    hoverEnabled: true
    font.pixelSize: 12
    font.weight: Font.Bold

    contentItem: Text {
        text: control.busy ? "●  " + control.text : control.text
        color: control.outlined ? control.accent : "#071018"
        font: control.font
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
    }

    background: Rectangle {
        radius: 10
        color: control.outlined ? (control.hovered ? Qt.rgba(control.accent.r, control.accent.g, control.accent.b, .12) : "transparent")
                                : (control.down ? Qt.darker(control.accent, 1.2) : control.accent)
        border.width: 1
        border.color: control.accent
        opacity: control.enabled ? 1 : .45

        Behavior on color { ColorAnimation { duration: 120 } }
        scale: control.down ? .97 : 1
        Behavior on scale { NumberAnimation { duration: 90 } }
    }
}

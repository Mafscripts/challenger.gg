import QtQuick
import QtQuick.Controls

Button {
    id: root
    property string symbol: "◆"
    property bool selected: false
    signal selectedByUser()

    implicitHeight: 46
    hoverEnabled: true
    onClicked: selectedByUser()

    background: Rectangle {
        radius: 10
        color: root.selected ? "#152d38" : (root.hovered ? "#17212d" : "transparent")
        border.width: root.selected ? 1 : 0
        border.color: "#23566a"
        Rectangle {
            visible: root.selected
            width: 3
            height: 22
            radius: 2
            color: "#14d8ff"
            anchors.left: parent.left
            anchors.leftMargin: 1
            anchors.verticalCenter: parent.verticalCenter
        }
    }

    contentItem: Row {
        spacing: 13
        leftPadding: 15
        Text {
            width: 18
            text: root.symbol
            color: root.selected ? "#14d8ff" : "#7d8b9c"
            font.pixelSize: 15
            anchors.verticalCenter: parent.verticalCenter
            horizontalAlignment: Text.AlignHCenter
        }
        Text {
            text: root.text
            color: root.selected ? "#ffffff" : (root.hovered ? "#dce8f4" : "#91a0b2")
            font.pixelSize: 13
            font.weight: root.selected ? Font.DemiBold : Font.Medium
            anchors.verticalCenter: parent.verticalCenter
        }
    }
}
